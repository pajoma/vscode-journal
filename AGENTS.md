# AGENTS.md

Project-level guidance for any AI coding assistant (Claude Code, Codex, Gemini CLI, Copilot CLI, etc.) and for humans contributing to this repository.

## Project

VS Code extension (`pajoma.vscode-journal`) for daily markdown journaling. TypeScript, bundled with esbuild, runs in the workspace extension host. Requires Node 20+ and VS Code 1.118+.

## Commands

```bash
npm install
npm run compile          # esbuild → dist/extension.js (CJS, external 'vscode')
npm run watch            # esbuild watch (used as preLaunchTask for F5)
npm run package          # production build (minified, no sourcemap)
npm run compile-tests    # tsc -p . --outDir out (separate from extension bundle)
npm run lint             # eslint src
npm test                 # @vscode/test-cli — pretest auto-runs compile-tests + compile + lint
npm run check            # lint + compile + test
```

Run a single test by passing a Mocha grep through `@vscode/test-cli`:

```bash
npm test -- --grep "MatchInput"
```

`--grep` is the fast TDD loop (~5 s vs 30 s for the full suite). `rm -rf out/` between branch switches — `npm run compile-tests` does not prune stale `.test.js` files, so deleted/renamed tests keep running and show as phantom failures when comparing test counts across branches.

Tests live in `src/test/suite/**/*.test.ts`, compile to `out/test/suite/**/*.test.js`, and run inside a real Extension Host against the workspace `test/ws_unittests/`. Mocha TDD UI, 20s default timeout (`.vscode-test.mjs`). `src/test/direct/` contains plain-node debug scripts, not part of the suite.

Launch configs (`.vscode/launch.json`):
- **Run Extension** — opens Extension Development Host on `test/ws_manual/` (default F5)
- **Run Extension without Workspace** — uses `test/ws_empty/`
- **Extension Tests** — runs the suite with `watch-tests` as pre-launch

CI (`.github/workflows/ci.yml`) runs lint → compile → compile-tests → `xvfb-run npm test` on push to `main`/`master`/`develop` and on PRs.

## Architecture

Entry: `src/extension.ts` → `Startup(config).run(context)` (in `src/ext/startup.ts`) which initializes the `Ctrl` service locator and registers commands, code actions, and optional syntax highlighting.

**Service locator pattern.** `Ctrl` (`src/util/controller.ts`) owns one instance each of `Configuration`, `Parser`, `Writer`, `Reader`, `Inject`, `Dialogues`, and `Logger`. Every command/provider receives `Ctrl` in its constructor and reaches services through it. `docs/PLAN.md` Phase 2.1 marks this for replacement with proper DI — new code should be written so it can accept narrower interfaces later, not lean harder on `Ctrl`.

**Namespace barrel imports.** `src/index.ts` re-exports submodules as `J.Extension`, `J.Actions`, `J.Model`, `J.Util`, `J.Provider`. Existing code does `import * as J from '..'` and references `J.Util.Ctrl`, `J.Actions.Writer`, etc. `docs/PLAN.md` Phase 2.3 marks this for replacement with named imports — prefer named imports in new files.

**Module responsibilities** (need multiple files to grasp):

- `src/ext/` — VS Code surface integration. `Configuration` (`conf.ts`) reads `journal.*` settings and resolves templates/scopes. `Dialogues` drives QuickPick/InputBox. `Startup` wires everything. i18n uses `vscode.l10n` — manifest strings in `package.nls.json` (English-only); runtime strings in `l10n/bundle.l10n.json`. Per-locale `package.nls.<loc>.json` and `l10n/bundle.l10n.<loc>.json` were removed in 1.1.0 (audience is English-speaking; vscode falls back to the default bundle for any locale).
- `src/actions/` — Core domain logic, no direct command bindings.
  - `Parser` — turns user input/URIs into structured `Input` (date, note, memo, task, weekly).
  - `Reader` — loads entries/notes from the configured base directory using `vscode.workspace.fs`.
  - `Writer` — creates new files (entry, note, weekly) and opens text documents.
  - `Inject` — modifies existing documents (insert memo/task/file link, shift task).
- `src/model/` — Plain data types: `Input`, `FileEntry`, `HeaderTemplate`/`InlineTemplate`/`ScopedTemplate`, scope/quickpick types.
- `src/provider/` — VS Code-facing surface.
  - `commands/` — one file per registered command (`journal.today`, `journal.note`, `journal.printDuration`, etc.); each exports a static `create(ctrl)` that returns the `Disposable`.
  - `codeactions/` — markdown code actions for completed and open task lines.
  - `codelens/` — task migration/shift CodeLens providers (not all registered yet — see `Startup.registerCodeLens`).
  - `features/` — reusable building blocks: `MatchInput` (smart-input resolver), `ScanEntries` (directory walker + cache for QuickPick), `LoadNotes`, `SyncNoteLinks`.
- `src/util/` — `Ctrl`, `Logger` (OutputChannel-backed), `dates.ts` (moment-based, slated for removal in Phase 3), `paths.ts`, `strings.ts`.

**Smart-input flow.** User triggers `journal.day` (`Ctrl+Shift+J`) → `Dialogues` shows InputBox → `MatchInput.parseInput()` classifies the text (date expression, weekday, "memo:", "task:", "note ...", week reference) → command dispatches to `Reader`/`Writer`/`Inject`. The default path/file patterns (`${base}/${year}/${month}/${day}` for notes, `${base}/${year}/${month}/${day}.${ext}` for entries) come from `journal.patterns` in `package.json`.

**Filesystem.** Always go through `vscode.workspace.fs` (the extension declares `extensionKind: ["workspace"]` so it runs on the remote host for Remote SSH/Codespaces). Avoid raw `fs` / `fs.promises` in new code — `docs/PLAN.md` Phase 1.3 finished migrating the old `fs` call sites; do not reintroduce them.

**Templates.** All user-facing inserted content comes from `journal.templates` (array of `{name, template, after?}`). Lookup happens via `Configuration.getInlineTemplate(name, fallback)`. Default template names: `memo`, `task`, `entry`, `time`, `note`, `files`, `weekly`. Issue #167 was a name-mismatch bug (`week` vs `weekly`) — when adding a new template type, register the name consistently in `package.json` defaults and the consumer.

## Notes for changes

- `docs/PLAN.md` is the active modernization roadmap. Phases 0 and 1 are complete; Phase 2+ is open. Match the direction in the plan (DI, named imports, native `async`/`await` instead of `new Promise()` wrappers, `vscode.workspace.fs`, replacing moment with `Intl`/`date-fns`).
- ESLint flat config (`eslint.config.mjs`) enforces `curly`, `eqeqeq`, `no-throw-literal`, `semi`. Import naming must be `camelCase` or `PascalCase`.
- `tsconfig.json` runs `strict`, `noImplicitReturns`, `noFallthroughCasesInSwitch`. The bundle goes through esbuild, but tests are compiled via `tsc` — both must succeed for `npm test`.
- `docs/` contains user-facing feature docs (entries, notes, memos, tasks, scopes, settings, codeactions) and `docs/analysis/` holds the analysis that produced `PLAN.md`.
- Local `develop` often lags `origin/develop` — `git fetch origin develop` and rebase the feature branch before opening a PR. Remote branches created from the issue UI may already exist as empty refs; fetch and rebase rather than force-push.
- Conventional Commits with scope: `perf(scan-entries):`, `feat(navigation):`, `fix(remote):`, `test(remote):`, `docs:`. Issue ref goes in the commit body (`#187`), not the subject.

## Testing patterns

- Test workspace: `test/ws_unittests/`. `journal.base` is NOT preset — each test does `config.update('base', tmpBase, ConfigurationTarget.Workspace)` then builds a fresh `Ctrl` from `vscode.workspace.getConfiguration('journal')`. See `commands-prev-next.test.ts` and `issue-51-remote-create.test.ts` for the template.
- `TestLogger` (`src/test/test-logger.ts`) has an `errors[]` accumulator — assert `logger.errors.length === 0` to prove "no error logged on the happy path".
- Don't call `Command.create(ctrl)` in tests — it re-registers the command and collides with activation. Instantiate directly: `new (Cmd as any)(ctrl)` then call the instance method.
- Monkey-patch seams that work: `(ctrl.ui as any).openDocument = wrapper` and `(vscode.window as any).showInformationMessage = wrapper`. Restore in teardown.
- `vscode.workspace.fs` is frozen — to observe FS calls, spy on the class method via prototype (`(ScanEntries.prototype as any).walkDir = function(...) { count++; return orig.apply(this, args); }`). Restore in teardown. See `scan-entries-cache.test.ts`.

## Reusable building blocks

- `J.Util.fileExists(uri)` (`src/util/fs-exists.ts`) — stat-first existence check; converts `FileSystemError.FileNotFound` to `false`, re-throws others. Use instead of "open and catch the rejection".
- `AbstractLoadEntryForDateCommand` (`src/provider/commands/show-entry-for-date.ts`) — new "open a specific date" commands should extend it and call `this.execute(input)` with `input.offset` set. Reuses the local-vs-remote prompt and `loadPageForInput` plumbing.
- `getDateFromURIAndConfig` (`src/util/paths.ts`) — parses a `Date` from a journal entry file path. Anchor detection for navigation features.
- `vscode.Uri.joinPath` for composing FS URIs. `vscode.workspace.fs.readDirectory` returns `[name, FileType][]`.

## i18n

- English-only. `package.nls.json` carries command titles and configuration descriptions consumed by the VS Code manifest. Runtime user-facing strings (toasts, prompts) go in `l10n/bundle.l10n.json` and are looked up via `vscode.l10n.t()`.
- Per-locale `package.nls.<loc>.json` and `l10n/bundle.l10n.<loc>.json` files were removed in 1.1.0. If the project ever needs to re-internationalize, restore both sets from git history (`git log --diff-filter=D --name-only -- package.nls.*.json l10n/bundle.l10n.*.json`).

## Spec/plan workflow

- Long-running feature/bugfix work is captured under `docs/specs/<YYYY-MM-DD>-<slug>.md` (what + why) and `docs/plans/<YYYY-MM-DD>-<slug>.md` (how + test scenarios). The corresponding GitHub issue carries short summary comments linking the file. See #51, #144, #170 for examples.
- GitHub labels available in this repo: `bug`, `enhancement`, `question`, `wontfix`, `invalid`, `duplicate`, `help wanted`, `dependencies`. No `chore` / `docs` — omit `--label` when filing other issue types.
