# AGENTS.md

Project-level guidance for any AI coding assistant (Claude Code, Codex, Gemini CLI, Copilot CLI, etc.) and for humans contributing to this repository.

## Project

VS Code extension (`pajoma.vscode-journal`) for daily markdown journaling. TypeScript, bundled with esbuild, runs in the workspace extension host. Requires Node 20+ and VS Code 1.118+.

## Commands

```bash
npm install
npm run build:core       # tsc → packages/journal-core/dist (run by compile, package, compile-tests)
npm run compile          # esbuild → dist/extension.js (CJS, external 'vscode')
npm run watch            # esbuild watch (used as preLaunchTask for F5)
npm run package          # production build (minified, no sourcemap)
npm run compile-tests    # tsc -p . --outDir out (separate from extension bundle)
npm run lint             # eslint src
npm run test:unit        # node unit tests (src/test/unit), no Extension Host
npm test                 # test:unit + @vscode/test-cli — pretest auto-runs compile-tests + compile + lint
npm run check            # lint + compile + test
```

Run a single test by passing a Mocha grep through `@vscode/test-cli`:

```bash
npm test -- --grep "matchInput"
```

No display available (no xvfb)? Run `npm run compile-tests` then verify pure logic with `node -e "const {fn} = require('./out/path/to/module'); ..."` — does not need VS Code.

`--grep` is the fast TDD loop (~5 s vs 30 s for the full suite). `rm -rf out/` between branch switches — `npm run compile-tests` does not prune stale `.test.js` files, so deleted/renamed tests keep running and show as phantom failures when comparing test counts across branches.

Tests live in `src/test/suite/**/*.test.ts`, compile to `out/test/suite/**/*.test.js`, and run inside a real Extension Host against the workspace `test/ws_unittests/`. Mocha TDD UI, 20s default timeout (`.vscode-test.mjs`). `src/test/unit/**/*.test.ts` run in plain node (`npm run test:unit`, milliseconds): use them for logic that must not need VS Code (entries domain, configuration, text positions, journal-core). `src/test/direct/` contains plain-node debug scripts, not part of the suite.

Launch configs (`.vscode/launch.json`):
- **Run Extension** — opens Extension Development Host on `test/ws_manual/` (default F5)
- **Run Extension without Workspace** — uses `test/ws_empty/`
- **Extension Tests** — runs the suite with `watch-tests` as pre-launch

CI (`.github/workflows/ci.yml`) runs lint → compile → compile-tests → `xvfb-run npm test` on push to `main`/`master`/`develop` and on PRs.

## Architecture

The source is organized **package-by-feature** (restructured in #234). Three top-level zones:

```
src/app/                composition root — wiring only
src/shared/             kernel — no feature dependencies
src/features/           one folder per capability
packages/journal-core/  format rules shared with the MCP server (no vscode)
```

Entry: `src/extension.ts` → `Startup(config).run(context)` (in `src/app/startup.ts`) which builds the `Container` composition root and registers commands, code actions, and optional syntax highlighting.

**Dependency injection.** `Container` (`src/app/container.ts`) implements the `JournalController` interface and constructs the full service graph in **one pass**: its constructor takes `(configSource, loggerFactory)` and builds `Configuration` (with the `HostEnvironment`: UI language and workspace root from `vscode`), `VscodeEditor`, `Inject`, `Parser`, `Dialogues`, `Writer`, `Reader`, `JournalEvents` in dependency order (no two-phase `initServices`, no `!` fields). Commands/providers receive the `JournalController` interface (never the concrete `Container`); only `src/app/` instantiates it. Service interfaces live in `src/shared/model/interfaces.ts` (`IConfiguration`, `ILogger`, `IParser`, `IWriter`, `IReader`, `IInject`, `IDialogues`, `IEditor`, `IFileSystem`, `IJournalEvents`); they contain no vscode types. `src/app/register.ts` does the command/provider registration.

**Named imports only.** The old `J.*` namespace barrel was removed in #234 — `src/index.ts` is empty (`export {}`). Import named symbols directly from submodule barrels / files.

**Module responsibilities** (need multiple files to grasp):

- `src/shared/` — the kernel, no feature dependencies:
  - `config/` — `Configuration` (`configuration.ts`) extends journal-core's `JournalConfiguration` (the journal format, see below) with the settings of the editor integration (`EditorSettings`: navigation mode, editor group, quick-pick formats, weekly sync). `IConfiguration` (`shared/model/interfaces.ts`) is the union of journal-core's `JournalSettings`, `JournalScopes`, `JournalPaths`, `JournalTemplates` and `EditorSettings`; depend on the narrowest part you use (#278). No `vscode` import: the language and the workspace root come in as `HostEnvironment` (default `NO_HOST` outside VS Code).
  - `model/` — plain data types: `Input`, `FileEntry`, `HeaderTemplate`/`InlineTemplate`/`ScopedTemplate`, `InlineString`/`TextPosition`, scope/quickpick types, and all service interfaces (`interfaces.ts`). Documents are passed as file paths, events carry paths.
  - `editor/` — the VS Code side: `VscodeEditor` (`IEditor`: `getText`, `insert`, `save`, `show` by file path; the entries domain, the commands and the notes link sync go through it — only the weekly daily-links sync and the task code actions still work on `vscode.TextDocument`) and `remote-session.ts` (local-or-remote decision, `toLocalFileUri`).
  - `text/document-text.ts` — `DocumentText`: lines and positions with the semantics of `vscode.TextDocument` (`validate`, `positionAt`), so inserts are computed without VS Code.
  - `fs/` — `IFileSystem` impl `VscodeFileSystem` + `fileExists`.
  - `logging/` — `Logger`/`ConsoleLogger` (OutputChannel-backed).
  - `dates/`, `strings/`, `lang.ts` — date formatting, string, and primitive helpers.
  - `paths.ts` — date-from-path utilities (`getDateFromURIAndConfig`, `getWeekFromURIAndConfig(fsPath, config)`, `resolvePath`, `inferType`); no vscode.
- `packages/journal-core/` — the journal format rules, used by the extension and the MCP server (#250). `config/`: the settings defaults of `package.json` (`SETTINGS_DEFAULTS`, applied by `SettingsWithDefaults` outside VS Code; a unit test compares them with `package.json`), `SettingsReader` (locale, base paths, extension, template definitions), `ScopeRegistry` + `Scope` (the only place that decides what a scope is: configured, folder, default; first settings entry of a name wins; unknown names → default; do not read `journal.scopes` anywhere else), `PathResolver` (entry/week/note paths and file patterns), `TemplateProvider` (entry/weekly/note/memo/task/link templates and their fallbacks), composed by the `JournalConfiguration` facade. All of it is synchronous (do not `await` it); resolved paths and templates are `Resolved` (their `value` is always set). Further: template variables (`resolveDate`, `resolveDayOffsets`, `toMomentFormat`, `replaceVariable`, `templatePattern`), `normalizeFilename`, weeks (`weekOf` → week + week-year in `journal.locale`, `firstDayOfWeek`, `daysOfWeek`, independent of today) and task markers (`TASK_BOX`, `CHECKBOX`, `doneSuffix`, `movedSuffix`). Plain TypeScript built to CommonJS (`npm run build:core`), linked as `file:` dependency; esbuild aliases `moment` so the bundle has one copy. Change a format rule here, not in a consumer, and add a case to `src/test/fixtures/journal-format.json`.
  - `events/` — `JournalEvents`, a typed `vscode.EventEmitter` bus for cross-feature signals (e.g. `entryOpened`).
- `src/features/<feature>/` — each owns its `commands/` (one file per registered command, each exports a static `create(ctrl)` returning a `Disposable`), domain logic, and `ui/` providers:
  - `entries/` — entry/weekly `Reader`/`Writer`/`Inject` and the `show-entry-for-*` commands. The domain (`reader.ts`, `writer.ts`, `inject.ts`) imports no vscode: Reader/Writer return file paths, Inject computes inserts from the document text and hands them to `IEditor`; commands show the result with `ctrl.editor.show(path)`.
  - `notes/` — `show-note` command, `LoadNotes`, `SyncNoteLinks`; `Notes` is the feature's service for other features (`ctrl.notes`, interface `INotes`).
  - `weekly/` — `WeeklyEntryWatcher`, `SyncDailyLinks` (subscribes to `entryOpened`).
  - `tasks/` — task code actions + migrate/shift CodeLens, `copy-task`.
  - `navigation/` — prev/next entry commands + `navigation.ts`.
  - `smart-input/` — `Parser` (`parseInput` → `matchInput`: tokenizer → date-resolver, words in `vocabulary.ts`), `Dialogues` (prompts and errors; delegates the picker), `Picker` (QuickPick UI and events only), `PickerContent` (what the picker shows: start rows, typed-input row, file rows, scan directories per `Scope`; plus pure `withPlaceholder`/`mergeSorted`), `ScanEntries` (directory walker + cache, UI-agnostic `onEntries` callback).
  - `tools/` — `print-time` / `print-duration` / `print-sum` / open-workspace.
  - `scopes/` — folder scopes below `journal.scopeRoot` (`refreshScopeFolders`, watcher) and the `create-scope` command. `SettingsReader.getScopes()` merges configured and folder scopes; `getScopeFolderPath()` routes notes of folder scopes into their folder. Notes in folder scopes are linked once on creation (`LoadNotes` fires `noteCreated`, the `Container` calls `SyncNoteLinks.linkNotes`), not by the date-based notes scan.
- A feature must not import another feature or `app/`, and `shared/` must not import features or `app/` — enforced by `no-restricted-imports` in `eslint.config.mjs` (#252). Only `src/app/` (composition root) knows the features. Cross-feature work goes through `shared/`: services on `JournalController` (e.g. `ctrl.notes`), events on `shared/events/`, or shared base classes (`shared/commands/`). Modules re-exported by `shared/index.ts` must not import the barrel. `shared/{model,config,text}`, `shared/paths.ts` and the entries domain must not import `vscode` or the `shared/index.ts` barrel (it loads the logger) — also enforced by lint (#239, #251), and the node unit tests fail if anything vscode slips in transitively.

**Smart-input flow.** User triggers `journal.day` (`Ctrl+Shift+J`) → `Dialogues` shows InputBox → `Parser.parseInput()` classifies the text (date expression, weekday, "memo:", "task:", "note ...", week reference) → command dispatches via the `JournalController` to `Reader`/`Writer`/`Inject`. The default path/file patterns (`${base}/${year}/${month}/${day}` for notes, `${base}/${year}/${month}/${day}.${ext}` for entries) come from `journal.patterns` in `package.json`.

**Filesystem.** Always go through `vscode.workspace.fs` (the extension declares `extensionKind: ["workspace"]` so it runs on the remote host for Remote SSH/Codespaces). Avoid raw `fs` / `fs.promises` in new code — `docs/PLAN.md` Phase 1.3 finished migrating the old `fs` call sites; do not reintroduce them.

**Templates.** All user-facing inserted content comes from `journal.templates` (array of `{name, template, after?}`). Lookup happens via `getInlineTemplate(name, fallback, scope)` (journal-core `SettingsReader`); the fallbacks are `TEMPLATE_FALLBACKS` in journal-core's `TemplateProvider`. Default template names: `memo`, `task`, `entry`, `time`, `note`, `files`, `weekly`. Issue #167 was a name-mismatch bug (`week` vs `weekly`) — when adding a new template type, register the name consistently in `package.json` defaults, `SETTINGS_DEFAULTS` and the consumer.

## Notes for changes

- `docs/PLAN.md` is the active modernization roadmap. Phases 0 and 1 are complete; Phase 2+ is open. Match the direction in the plan (DI, named imports, native `async`/`await` instead of `new Promise()` wrappers, `vscode.workspace.fs`, replacing moment with `Intl`/`date-fns`).
- ESLint flat config (`eslint.config.mjs`) enforces `curly`, `eqeqeq`, `no-throw-literal`, `semi`. Import naming must be `camelCase` or `PascalCase`.
- `tsconfig.json` runs `strict`, `noImplicitReturns`, `noFallthroughCasesInSwitch`. The bundle goes through esbuild, but tests are compiled via `tsc` — both must succeed for `npm test`.
- Test files written on a feature branch land on `develop` after the PR merges. When a fix touches an enum member or function signature, always grep `src/test/` — tests may reference the old name even if the branch that introduced them is already closed.
- When batch-replacing `this.ctrl.X.method(` patterns, also grep `this\.ctrl\.X[^.]` (no trailing dot) to catch argument positions like `this.ctrl.logger,`. Run `npm run compile-tests` (tsc) not just `npm run compile` (esbuild) to catch type errors in the refactor.
- `docs/` contains user-facing feature docs (entries, notes, memos, tasks, scopes, settings, codeactions) and `docs/analysis/` holds the analysis that produced `PLAN.md`.
- Local `develop` often lags `origin/develop` — `git fetch origin develop` and rebase the feature branch before opening a PR. Remote branches created from the issue UI may already exist as empty refs; fetch and rebase rather than force-push. Exception: spec/plan docs are committed directly to local `develop` before pushing — when branching a fix, use local `develop` (not `origin/develop`) to pick up those uncommitted docs.
- Run all `git` commands from the current working directory using `-C <path>` or absolute paths if needed — never `cd` before a git command.
- Conventional Commits with scope: `perf(scan-entries):`, `feat(navigation):`, `fix(remote):`, `test(remote):`, `docs:`. Issue ref goes in the commit body (`#187`), not the subject.

## Testing patterns

- Test workspace: `test/ws_unittests/`. `journal.base` is NOT preset — each test does `config.update('base', tmpBase, ConfigurationTarget.Workspace)` then builds a fresh `Ctrl` from `vscode.workspace.getConfiguration('journal')`. See `commands-prev-next.test.ts` and `issue-51-remote-create.test.ts` for the template. Two-phase init required: `const ctrl = new J.Util.Ctrl(config); ctrl.initServices(new TestLogger(false));` — the `ctrl.logger` setter was removed in #208. Use `ctrl.parser`, `ctrl.writer`, etc. after `initServices`; don't construct action classes directly in tests.
- `TestLogger` (`src/test/test-logger.ts`) has an `errors[]` accumulator — assert `logger.errors.length === 0` to prove "no error logged on the happy path".
- `createMockCtrl(overrides)` (`src/test/suite/command-test-helpers.ts`) takes a `DeepPartial<JournalController>`: leave out what the test does not need, but what you mock must match the real signature, so `tsc` reports outdated mocks (#278).
- Don't call `Command.create(ctrl)` in tests — it re-registers the command and collides with activation. Instantiate directly: `new (Cmd as any)(ctrl)` then call the instance method.
- Monkey-patch seams that work: `(ctrl.ui as any).openDocument = wrapper` and `(vscode.window as any).showInformationMessage = wrapper`. Restore in teardown.
- `vscode.workspace.fs` is frozen — to observe FS calls, spy on the class method via prototype (`(ScanEntries.prototype as any).walkDir = function(...) { count++; return orig.apply(this, args); }`). Restore in teardown. See `scan-entries-cache.test.ts`.

## Reusable building blocks

- `ctrl.editor` (`IEditor`) — read (`getText`), change (`insert`), `save` and `show` a document by file path; do not call `vscode.workspace.openTextDocument`/`applyEdit` in domain code.
- `fileExists(fs, uri)` (`src/shared/fs/fs-exists.ts`) — stat-first existence check; converts `FileSystemError.FileNotFound` to `false`, re-throws others. Use instead of "open and catch the rejection".
- `AbstractLoadEntryForDateCommand` (`src/shared/commands/load-entry-for-date.ts`) — new "open a specific date" commands should extend it and call `this.execute(input)` with `input.offset` set. Reuses the local-vs-remote prompt and `loadPageForInput` plumbing.
- `getDateFromURIAndConfig` (`src/shared/paths.ts`) — parses a `Date` from a journal entry file path. Anchor detection for navigation features.
- `vscode.Uri.joinPath` for composing FS URIs. `vscode.workspace.fs.readDirectory` returns `[name, FileType][]`.

## i18n

- English-only. `package.nls.json` carries command titles and configuration descriptions consumed by the VS Code manifest. Runtime user-facing strings (toasts, prompts) go in `l10n/bundle.l10n.json` and are looked up via `vscode.l10n.t()`.
- Per-locale `package.nls.<loc>.json` and `l10n/bundle.l10n.<loc>.json` files were removed in 1.1.0. If the project ever needs to re-internationalize, restore both sets from git history (`git log --diff-filter=D --name-only -- package.nls.*.json l10n/bundle.l10n.*.json`).

## MCP server (`mcp-server/`)

Standalone Node 22+ ESM package (own `package.json`, `tsconfig.json`, tests), not part of the extension bundle — excluded in the root `tsconfig.json` and `.vscodeignore`. It exposes daily and weekly entries (memos, tasks, `## Zeiterfassung` table, notes) as MCP tools and works on the markdown files directly, without VS Code APIs.

```bash
cd mcp-server && npm install   # postinstall installs packages/journal-core's dependencies
npm test                 # builds journal-core, then node:test via tsx
npm run typecheck
```

- `src/journal/` is pure line-based parsing/editing (`structure`, `privacy`, `tasks`, `memos`, `time`, `notes`, `links`); keep it free of I/O. Content tagged `#private`/`#privat` must never leave the server: functions that return content or resolve refs take a `VisibleLines` (`journal.visible(lines, policy)`), never raw `Lines`. The server builds its policy once from the configuration and hands tools a `view` function; the journal module exports no default policy and no raw mask/ref functions — keep it that way. Use `hiddenMask()` for what may be returned, `privateMask()` for placing new content.
- Journal layout and templates are read from a `settings.json` in VS Code format (`src/settings.ts`) and resolved by journal-core's `JournalConfiguration` (`cfg.journal`), exactly like in the extension: defaults, scopes, entry/week/note paths, templates, template variables, file names, weeks and task markers (#250). `src/config.ts` resolves `journal.base` against the repository and hands it to journal-core; the repository is the host's workspace root. `src/store.ts` and `src/scopes.ts` only add I/O, the repository boundary and the private-scope rules; `src/template.ts` adapts journal-core to the server's moment values. The cases in `src/test/fixtures/journal-format.json` (entry, week and note paths, file names, template variables, reopening tasks) run in both test suites (`mcp-server/test/contract.test.ts`). Add a case there when a format rule changes.
- Scopes (`src/scopes.ts`, `src/scope-tools.ts`) are folders below `journal.scopeRoot`, overridable via `journal.scopes`; see `docs/specs/2026-10-09-scopes-as-folders.md`. The extension must resolve them the same way.
- Local use: `.vscode/mcp.json` (stdio) and the **MCP Server (HTTP)** launch config, both reading `mcp-server/.env.local`.
- Container image: `.github/workflows/mcp-server.yml` pushes `ghcr.io/<owner>/journal-mcp:dev` on `develop`, `:<version>` on tags `mcp-server-v*`. It is built from the repository root (`docker build -f mcp-server/Dockerfile .`) because it includes `packages/journal-core`; `mcp-server/Dockerfile.dockerignore` allowlists the files that go into the build. See `mcp-server/README.md`.

## Spec/plan workflow

- Long-running feature/bugfix work is captured under `docs/specs/<YYYY-MM-DD>-<slug>.md` (what + why) and `docs/plans/<YYYY-MM-DD>-<slug>.md` (how + test scenarios). The corresponding GitHub issue carries short summary comments linking the file. See #51, #144, #170 for examples.
- GitHub labels available in this repo: `bug`, `enhancement`, `question`, `wontfix`, `invalid`, `duplicate`, `help wanted`, `dependencies`. No `chore` / `docs` — omit `--label` when filing other issue types.
