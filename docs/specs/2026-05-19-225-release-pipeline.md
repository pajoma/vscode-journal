# Spec: GitHub Actions Release Pipeline (#225)

## Goal

Automatically build and publish a `.vsix` artifact as a GitHub Release on every merge to `main`, enabling manual installation without a Marketplace publish step.

## Why Now

There is no current way to download a built extension artifact. Users and testers must clone and build locally. A GitHub Release with the `.vsix` attached makes every stable build downloadable in one click.

## In Scope

- New workflow file `.github/workflows/release.yml`
- Trigger: `push` to `main` only (not PRs, not `develop`)
- Build steps: `npm install` → `npm run compile` → `npm run compile-tests` → `xvfb-run -a npm test` → `vsce package`
- Read version from `package.json` (no external version-bump step)
- Create GitHub Release tagged `v<version>` (e.g. `v1.0.3`)
  - Release title: `vscode-journal v<version>`
  - Body: auto-generated from tag (or minimal static message)
  - Asset: the built `.vsix` file
- Use `softprops/action-gh-release` for the release step (simpler than `gh release create` in CI)
- Use default `GITHUB_TOKEN` (no PAT needed — same repo release)
- Fail the entire workflow (no release created) if any earlier step fails

## Out of Scope

- Publishing to VS Code Marketplace (`vsce publish`) — separate issue
- Automated version bumping or changelog generation
- Matrix builds (single Node LTS is enough for packaging)

## Acceptance Criteria (observable)

1. Push a commit to `main` → workflow run appears in Actions tab
2. Run succeeds → GitHub Release `v<version>` created with `.vsix` attached
3. Run fails (compile error or test failure) → no release created, workflow red
4. Release already exists for this version → workflow should NOT duplicate-tag (handled by `softprops/action-gh-release` which updates existing releases by default; acceptable for now)

## Constraints

- Tests require a display server: existing CI uses `xvfb-run -a npm test` on `ubuntu-latest` — same approach here
- `vsce` must be available: install via `npm install -g @vscode/vsce` or use `npx vsce`
- Node version: pin to `20` (current LTS, consistent with CI matrix minimum)
- `GITHUB_TOKEN` needs `contents: write` permission to create releases — must be declared explicitly in the workflow `permissions` block (GitHub now requires this for GITHUB_TOKEN write access in Actions)

## Open Questions

None after issue body review.

## Related

- No cross-issue blockers
- Out-of-scope follow-up: Marketplace publish (no issue yet)
