# vscode-journal — Modernization Roadmap

> Created: 2026-02-16  
> Based on analysis in [docs/analysis/README.md](docs/analysis/README.md)  
> Target: VS Code Extension API (latest), TypeScript 5.x, Node 20+

---

## Phase 0: Preparation & Infrastructure (Foundation)

### 0.1 — Upgrade Build Toolchain
- [x] Replace webpack with **esbuild** (faster builds, recommended by VS Code team)
- [x] Update `tsconfig.json`: enable `"noImplicitReturns"`, `"noFallthroughCasesInSwitch"`, `"esModuleInterop"` (`noUnusedLocals` deferred to Phase 5)
- [x] Upgrade ESLint to flat config (`eslint.config.mjs`) with stricter rules
- [x] Remove unused devDependencies: `glob`, `rimraf`, old `mocha`, `ts-loader`, `webpack`, `webpack-cli`, `@types/glob` (keep `@vscode/test-cli`)
- [x] Clean up dual test runner setup — standardize on `@vscode/test-cli` + `@vscode/test-electron`

### 0.2 — Remove Redundant Files
- [x] Delete all hand-written `.d.ts` files (`src/**/*.d.ts`) — compiler generates these via `"declaration": true`
- [x] Fix stale `src/index.d.ts` (references non-existent `./features` module) or delete it
- [x] Remove dead/commented-out code blocks (~15 instances across the codebase)
- [x] Remove unused import `AnyARecord` from `src/model/vscode.ts`

### 0.3 — Standardize File Naming
- [x] Rename all source files to consistent **kebab-case** (e.g., `controller.ts` → keep, `TestLogger.ts` → `test-logger.ts`, `InputMatcher.d.ts` → delete)
- [x] Ensure barrel `index.ts` files use consistent export style

### 0.4 — Set Up CI
- [x] Add GitHub Actions workflow for lint, build, and test
- [x] Add a `npm run check` script combining lint + compile + test

---

## Phase 1: Critical Bug Fixes

### 1.1 — Fix #167: Weekly Template Name Mismatch
- [x] `conf.ts:getWeeklyTemplate()` calls `getInlineTemplate("week", ...)` but `package.json` default template is named `"weekly"`
- [x] **Fix**: Changed lookup key to `"weekly"` to match the default template name in `package.json`
- [x] Add regression test

### 1.2 — Fix #170: Wrong Day Set on New Entry
- [x] `MatchInput` stores `this.today = new Date()` at construction time; if the instance is reused across midnight, dates are wrong
- [x] **Fix**: Added `refreshToday()` called at start of every `parseInput()`. Removed unused stale `Parser.today` field.
- [x] Review `resolveISOString()`, `resolveWeekday()`, `resolveDayOfMonth()` for off-by-one errors — fixed month validation (`>12` → `>11`) and day validation (`<0` → `<1`)
- [x] Add unit tests for edge cases (midnight boundary, timezone transitions)

### 1.3 — Fix #94: Remote Workspace Support (Local VS Remote Hosting)
Make sure that, when running on a remote host, the extension can still access the journal files on the local file system. Validate if the following plan supports this. 

- [x] Add `"extensionKind": ["workspace"]` to `package.json` so the extension runs on the remote host
- [x] Replace all direct `fs` calls with `vscode.workspace.fs` API:
  - `util/paths.ts` — `checkIfFileIsAccessible()` → `vscode.workspace.fs.stat()`
  - `provider/features/scan-entries.ts` — `walkDir()` / `walkDirSync()` → `vscode.workspace.fs.readDirectory()` + `stat()`
  - `provider/features/sync-note-links.ts` — `getFilesInNotesFolder()` → `vscode.workspace.fs.readDirectory()` + `stat()`
  - `ext/startup.ts` — `fs.promises.readFile()` → `vscode.workspace.fs.readFile()`
- [x] `os.homedir()` in `conf.ts`: No change needed — with `extensionKind: ["workspace"]` the extension runs on the remote host, so `os.homedir()` correctly returns the remote home directory where the journal resides
- [x] Replace `untitled:` URI scheme in `writer.ts:createSaveLoadTextDocument()` with `vscode.workspace.fs.writeFile()` + `vscode.workspace.openTextDocument()`
- [x] Add integration test verifying file creation via `vscode.workspace.fs`

---

## Phase 2: Architecture Modernization

### 2.1 — Replace Service Locator with Dependency Injection
- [ ] Define interfaces for each service: `IConfiguration`, `IDialogues`, `IParser`, `IReader`, `IWriter`, `IInject`, `ILogger`
- [ ] Remove `Ctrl` and use constructor injection
- [ ] Each class receives only the interfaces it depends on (not the full `Ctrl`)
- [ ] Rewrite all tests to use dependency injection, make sure you achieve high test coverage
- [ ] This enables proper unit testing with mocks

### 2.2 — Eliminate `new Promise()` Anti-Pattern
- [ ] Refactor ~25 methods that wrap their body in `new Promise()` to use native `async/await`
- [ ] Priority files (by impact):
  1. `conf.ts` — 8 methods
  2. `dialogues.ts` — 5 methods
  3. `reader.ts` — 3 methods
  4. `writer.ts` — 3 methods
  5. `inject.ts` — 4 methods
  6. `startup.ts` — 3 methods
  7. `sync-note-links.ts` — 4 methods
- [ ] Ensure error propagation is correct everywhere after refactoring
- [ ] Validate that async/await is used throughout complete codebase
- [ ] Validate error propagation through unit tests

### 2.3 — Replace `import * as J from '..'` Pattern
- [ ] Replace namespace-style imports with explicit named imports
- [ ] This improves tree-shaking, readability, and IDE support
- [ ] Example: `import { Ctrl } from '../util/controller'` instead of `J.Util.Ctrl`

### 2.4 — Modernize Activation
- [ ] Remove explicit `activationEvents` from `package.json` (VS Code 1.74+ supports implicit activation from `contributes.commands`)
- [ ] Or replace with `"onStartupFinished"` if the extension needs early initialization
- [ ] Remove the `journal.test` command and its activation event

### 2.5 — Fix Syntax Highlighting Approach
- [ ] Remove `enableSyntaxHighlighting()` / `disableSyntaxHighlighting()` that modify global user settings
- [ ] Use `contributes.grammars` (already partially in place) and optional `contributes.themes` for color customization
- [ ] Provide a dedicated color theme as an optional install instead of injecting TextMate rules

### 2.6 — Decouple Configuration
- [ ] Extract configuration reading into a dedicated service with caching and change detection
- [ ] Use `vscode.workspace.onDidChangeConfiguration` to invalidate cache
- [ ] Remove deprecated `getInlineTemplateCached()` method
- [ ] Remove legacy `tpl-*` setting support (they've been deprecated since pre-1.0)
- [ ] Type the return of `getWeekFilePattern()` and `getWeekPathPattern()` (currently `any`)

---

## Phase 3: Replace moment.js

### 3.1 — Migrate Date Handling
- [ ] Replace `moment` with native `Intl.DateTimeFormat` + small helpers, or `date-fns` (tree-shakeable)
- [ ] Files to update:
  - `util/dates.ts` — `formatDate()`, `replaceDateFormats()`, `replaceDateTemplatesWithMomentsFormats()`
  - `util/logger.ts` — `appendCurrentTime()` (simple `new Date().toISOString()` suffices)
  - `ext/dialogues.ts` — `generateDescription()`, `generateDetail()`, `addItemToPickList()`
  - `ext/conf.ts` — `getInputDetailsTimeFormat()` (hardcoded moment calendar config)
  - `provider/features/match-input.ts` — `resolveRelatedWeek()`, `resolveDayOfMonth()`
  - `provider/codeactions/for-open-tasks.ts` — `moment().format()`
  - `provider/commands/copy-task.ts` — `moment().add()`
- [ ] Maintain locale support via `Intl` (built-in, no bundle cost)
- [ ] Remove `moment` from `dependencies` in `package.json`
- [ ] Expected bundle size reduction: ~250-300KB

---

## Phase 4: Performance Improvements

### 4.1 — Async Directory Scanning
- [ ] Rewrite `ScanEntries.walkDir()` to use `vscode.workspace.fs.readDirectory()` (fully async, works with remote)
- [ ] Replace `fs.statSync` calls with `vscode.workspace.fs.stat()` (async)
- [ ] Implement proper completion detection instead of the 3-second timeout heuristic
- [ ] Consider using `vscode.workspace.findFiles()` with glob patterns for faster scanning

### 4.2 — Optimize QuickPick Population
- [ ] Batch items instead of concatenating + sorting on every callback
- [ ] Use a debounced update pattern (collect items for 100ms, then update the list once)
- [ ] Remove the `console.log("adding file in scope", ...)` debug statement left in `dialogues.ts:573`

### 4.3 — Debounce Note Sync
- [ ] `reader.ts:loadEntryForDay()` triggers `SyncNoteLinks.injectAttachementLinks()` on every entry load
- [ ] Add debouncing — only sync if the file was just created or on explicit user action
- [ ] Consider making note sync a separate command or a background task

### 4.4 — Lazy Initialization
- [ ] Defer `ScanEntries` cache population until the QuickPick is actually opened
- [ ] Defer regex compilation in `MatchInput` to module load (compile once, reuse)
- [ ] Lazy-load translation strings

---

## Phase 5: Code Quality & Refactoring

### 5.1 — Type Safety
- [ ] Remove all non-null assertions (`!`) — replace with proper type guards or optional chaining
- [ ] Replace `isNullOrUndefined()` / `isNotNullOrUndefined()` helpers with native `??`, `?.`, and type narrowing
- [ ] Replace `var` with `const`/`let` (3 occurrences)
- [ ] Add strict return types to all public methods
- [ ] Fix `getWeekFilePattern()` and `getWeekPathPattern()` return type (currently `any`)

### 5.2 — Error Handling
- [ ] Define custom error types: `JournalFileNotFoundError`, `JournalConfigError`, `JournalParseError`
- [ ] Standardize error handling: always log + propagate, never swallow silently
- [ ] Remove inconsistent patterns (some catch blocks reject, some throw, some do nothing)
- [ ] Show user-friendly messages via `vscode.window.showErrorMessage` with actionable hints

### 5.3 — Remove Unused / Dead Code
- [ ] Remove `getEntryPathForDate()` in `paths.ts` (marked `@deprecated`)
- [ ] Remove `getInlineTemplateCached()` in `conf.ts` (marked `@deprecated`)
- [ ] Remove `walkDirSync()` in `scan-entries.ts` (deprecated sync version)
- [ ] Remove `getPreviouslyAccessedFilesSync()` in `scan-entries.ts` (not used)
- [ ] Remove `JournalCodeLensProvider` in `vscode-codelens.ts` (disabled since 0.12, uses placeholder command)
- [ ] Remove the `InsertMemoCommand` if it's truly identical to `ShowEntryForInputCommand` (or merge)
- [ ] Remove `@vscode/extension-telemetry` if not actually used
- [ ] Clean up `show-pick-list.ts` (219 bytes, likely empty/stub)

### 5.4 — Improve i18n
- [ ] Replace hardcoded locale strings in `getInputDetailsTimeFormat()` with translations from `messages.json`
- [ ] Add support for VS Code's built-in `vscode.l10n` API (available since 1.73) instead of custom translation system
- [ ] Move all user-facing strings to the l10n system

---

## Phase 6: Feature Improvements (from GitHub Issues)

### 6.1 — #144: Open Previous / Open Next Navigation
- [ ] Add commands `journal.previousDay` and `journal.nextDay`
- [ ] Infer current date from the active document path using `getDateFromURIAndConfig()`
- [ ] Navigate by ±1 day offset from inferred date
- [ ] Add keybindings (e.g., `Ctrl+J Left` / `Ctrl+J Right`)

### 6.2 — #149: Create Note for Specific Journal Entry
- [ ] Allow creating a note linked to a specific date (not just today)
- [ ] Extend `ShowNoteCommand` to accept an optional date parameter
- [ ] When invoked from a journal entry, use that entry's date for the note path

### 6.3 — #168: Weekly Memos
- [ ] Allow memos and tasks to target weekly pages instead of daily entries
- [ ] Extend the input parser to recognize `week memo: ...` or `w memo: ...` syntax
- [ ] Route the memo to the weekly page instead of the daily page

### 6.4 — #137: Week Template Improvement
- [ ] Allow week templates to include day headers or task sections
- [ ] Support variables like `${weekStart}`, `${weekEnd}` in weekly templates

### 6.5 — #92: Better Wiki Links
- [ ] Support `[[wiki-style]]` links between journal entries and notes
- [ ] Add a `DocumentLinkProvider` that resolves `[[filename]]` to the correct path
- [ ] Consider integration with existing markdown link providers

### 6.6 — #173: URL Linkage for Bug Tickets
- [ ] Allow tasks created from bug tickets to include a URL
- [ ] Support syntax like `task: Fix login issue http://...` → task with embedded link

### 6.7 — #172 / #171: Sub-tasks and Multi-task Operations
- [ ] Support indented sub-tasks under parent tasks
- [ ] Allow selecting multiple tasks (via code actions or commands) to move/copy them
- [ ] This is a larger feature requiring careful UX design

---

## Phase 7: Testing & Documentation

### 7.1 — Expand Test Coverage
- [ ] Add unit tests for `Configuration` class (mock `vscode.WorkspaceConfiguration`)
- [ ] Add unit tests for `MatchInput` edge cases (midnight, locales, malformed input)
- [ ] Add unit tests for `Inject` (mock `vscode.TextDocument`, `vscode.WorkspaceEdit`)
- [ ] Add unit tests for each command (mock `Ctrl` dependencies)
- [ ] Add integration tests for file creation flow (entry, note, weekly)
- [ ] Add integration tests for code actions (complete task, shift task)
- [ ] Target: >70% line coverage

### 7.2 — Update Documentation
- [ ] Update `README.md` with current features and screenshots
- [ ] Update `CONTRIBUTING.md` with modern dev setup instructions
- [ ] Update `docs/settings.md` to reflect current configuration options
- [ ] Remove references to deprecated `tpl-*` settings from docs
- [ ] Add `CHANGELOG.md` entries for the modernization work

### 7.3 — Add Developer Documentation
- [ ] Document the architecture (module responsibilities, data flow)
- [ ] Document the template variable system
- [ ] Document the scope system
- [ ] Add inline JSDoc to all public APIs

---

## Phase 8: Polish & Release

### 8.1 — Package.json Cleanup
- [ ] Remove `"private": true` if publishing to marketplace
- [ ] Update `engines.vscode` to the minimum supported version after modernization
- [ ] Add `"extensionKind": ["workspace"]`
- [ ] Review and update `"categories"` (currently just "Other")
- [ ] Add `"capabilities": { "virtualWorkspaces": true }` if remote support is verified
- [ ] Clean up deprecated settings (remove or keep with migration path)

### 8.2 — Bundle Optimization
- [ ] Verify esbuild output size (target: <100KB without moment.js)
- [ ] Ensure source maps are correct for error reporting
- [ ] Update `.vscodeignore` to exclude test files, docs, and source

### 8.3 — Pre-release Testing
- [ ] Test in local workspace (Linux, macOS, Windows)
- [ ] Test in Remote SSH workspace
- [ ] Test in GitHub Codespaces
- [ ] Test in WSL
- [ ] Test with large journal directories (1000+ files)
- [ ] Test locale support (en, de, fr, es at minimum)

---

## Priority Order (Suggested Implementation Sequence)

1. **Phase 0** — Foundation (required for everything else)
2. **Phase 1** — Bug fixes (immediate user value)
3. **Phase 2.1–2.2** — DI + async/await (enables cleaner code for remaining phases)
4. **Phase 3** — Replace moment.js (bundle size + maintenance)
5. **Phase 4** — Performance (user experience)
6. **Phase 2.3–2.6** — Remaining architecture work
7. **Phase 5** — Code quality (maintainability)
8. **Phase 7.1** — Tests (safety net for features)
9. **Phase 6** — Features (user value, can be done incrementally)
10. **Phase 7.2–7.3 + Phase 8** — Documentation & release
