# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

VS Code extension (`pajoma.vscode-journal`) for daily markdown journaling. TypeScript, bundled with esbuild, runs in the workspace extension host. Requires Node 20+ and VS Code 1.94+.

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

Tests live in `src/test/suite/**/*.test.ts`, compile to `out/test/suite/**/*.test.js`, and run inside a real Extension Host against the workspace `test/ws_unittests/`. Mocha TDD UI, 20s default timeout (`.vscode-test.mjs`). `src/test/direct/` contains plain-node debug scripts, not part of the suite.

Launch configs (`.vscode/launch.json`):
- **Run Extension** — opens Extension Development Host on `test/ws_manual/` (default F5)
- **Run Extension without Workspace** — uses `test/ws_empty/`
- **Extension Tests** — runs the suite with `watch-tests` as pre-launch

CI (`.github/workflows/ci.yml`) runs lint → compile → compile-tests → `xvfb-run npm test` on push to `main`/`master`/`develop` and on PRs.

## Architecture

Entry: `src/extension.ts` → `Startup(config).run(context)` (in `src/ext/startup.ts`) which initializes the `Ctrl` service locator and registers commands, code actions, and optional syntax highlighting.

**Service locator pattern.** `Ctrl` (`src/util/controller.ts`) owns one instance each of `Configuration`, `Parser`, `Writer`, `Reader`, `Inject`, `Dialogues`, and `Logger`. Every command/provider receives `Ctrl` in its constructor and reaches services through it. PLAN.md Phase 2.1 marks this for replacement with proper DI — new code should be written so it can accept narrower interfaces later, not lean harder on `Ctrl`.

**Namespace barrel imports.** `src/index.ts` re-exports submodules as `J.Extension`, `J.Actions`, `J.Model`, `J.Util`, `J.Provider`. Existing code does `import * as J from '..'` and references `J.Util.Ctrl`, `J.Actions.Writer`, etc. PLAN.md Phase 2.3 marks this for replacement with named imports — prefer named imports in new files.

**Module responsibilities** (need multiple files to grasp):

- `src/ext/` — VS Code surface integration. `Configuration` (`conf.ts`) reads `journal.*` settings and resolves templates/scopes. `Dialogues` drives QuickPick/InputBox. `Startup` wires everything. `translations.ts` + `messages.json` provide i18n.
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

**Filesystem.** Always go through `vscode.workspace.fs` (the extension declares `extensionKind: ["workspace"]` so it runs on the remote host for Remote SSH/Codespaces). Avoid raw `fs` / `fs.promises` in new code — PLAN.md Phase 1.3 finished migrating the old `fs` call sites; do not reintroduce them.

**Templates.** All user-facing inserted content comes from `journal.templates` (array of `{name, template, after?}`). Lookup happens via `Configuration.getInlineTemplate(name, fallback)`. Default template names: `memo`, `task`, `entry`, `time`, `note`, `files`, `weekly`. Issue #167 was a name-mismatch bug (`week` vs `weekly`) — when adding a new template type, register the name consistently in `package.json` defaults and the consumer.

## Notes for changes

- `PLAN.md` is the active modernization roadmap. Phases 0 and 1 are complete; Phase 2+ is open. Match the direction in the plan (DI, named imports, native `async`/`await` instead of `new Promise()` wrappers, `vscode.workspace.fs`, replacing moment with `Intl`/`date-fns`).
- ESLint flat config (`eslint.config.mjs`) enforces `curly`, `eqeqeq`, `no-throw-literal`, `semi`. Import naming must be `camelCase` or `PascalCase`.
- `tsconfig.json` runs `strict`, `noImplicitReturns`, `noFallthroughCasesInSwitch`. The bundle goes through esbuild, but tests are compiled via `tsc` — both must succeed for `npm test`.
- `docs/` contains user-facing feature docs (entries, notes, memos, tasks, scopes, settings, codeactions) and `docs/analysis/` holds the analysis that produced `PLAN.md`.
