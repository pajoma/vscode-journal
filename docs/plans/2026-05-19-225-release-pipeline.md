# Plan: GitHub Actions Release Pipeline (#225)

**Reference spec:** [docs/specs/2026-05-19-225-release-pipeline.md](../specs/2026-05-19-225-release-pipeline.md)

## Approach

Single-job workflow in `.github/workflows/release.yml`. Gate: full build + test must pass before packaging or releasing. Use `softprops/action-gh-release@v2` with `generate_release_notes: true`. Version read from `package.json` via `node -p`. No matrix — single Node 20 run is sufficient for a packaging job (not correctness testing).

Trade-off: single job means no parallelism, but avoids artifact-passing complexity. Reviewer comment noted `upload-artifact` for multi-job design — deferred as out of scope.

## Steps

1. **Create `.github/workflows/release.yml`**
   - Trigger: `push` to `main` only
   - `permissions: contents: write`
   - Single job `release` on `ubuntu-latest`
   - Steps in order:
     1. `actions/checkout@v4`
     2. `actions/setup-node@v4` — node 20, npm cache
     3. `npm install`
     4. `npm run compile`
     5. `npm run compile-tests`
     6. `xvfb-run -a npm test`
     7. Read version: `echo "version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT` with `id: package-version`
     8. `npx @vscode/vsce package`
     9. `softprops/action-gh-release@v2` — tag `v${{ steps.package-version.outputs.version }}`, name `vscode-journal v<version>`, `files: "*.vsix"`, `generate_release_notes: true`

2. **Verify no conflicts with existing `ci.yml`**
   - `ci.yml` triggers on `main` too — both will run on merge; that is intentional and acceptable (CI validates, release publishes)
   - No step overlap that could cause race conditions (releases are idempotent via `softprops`)

## Test Scenarios

| # | Scenario | Type | How to verify |
|---|----------|------|---------------|
| 1 | Merge to `main` with passing tests | e2e | Workflow green, GitHub Release `v<version>` created, `.vsix` attached |
| 2 | Merge to `main` with failing test | e2e | Workflow red at test step, no release created |
| 3 | Merge to `main` with compile error | e2e | Workflow red at compile step, no release |
| 4 | Push to `develop` | e2e | Workflow does NOT trigger |
| 5 | Duplicate version push (same `package.json` version) | e2e | `softprops` updates existing release, no duplicate tag error |

Scenarios 2–5 can be validated by reviewing workflow trigger config and `softprops` docs rather than requiring live test runs.

## Dependencies

None. No other PRs or issues must land first.

## Risk

- `xvfb-run` flakiness on GitHub runners — same risk as existing `ci.yml`; not new
- `softprops/action-gh-release@v2` pinned to `v2` (floating major) — acceptable for internal tooling; can pin to SHA if policy requires

## Rollback

Delete `.github/workflows/release.yml`. No code changes, no DB migrations. Fully reversible.
