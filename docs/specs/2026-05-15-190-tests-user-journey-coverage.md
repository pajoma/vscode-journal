# Spec: Integration tests for all user stories — 1.1.0 (#190)

## Goal

Add integration tests covering every user-facing command and flow in the extension so that each user story has an observable, automated pass/fail signal.

## Why now

1.1.0 milestone. Code coverage gaps mean regressions in closed bugs (#51, #144, #167, #170) are silent, and untested commands have no safety net for future changes. Release without integration-level coverage for all user stories is a quality gap.

## In scope

### User stories → test suites

Each suite invokes the command or feature end-to-end against a tmp workspace; assertions are on file system state, document content, or VS Code messages.

| User story | Command / entry point | Test file (new or extend) |
|---|---|---|
| Open today's entry | `journal.today` | `commands-today.test.ts` |
| Open yesterday / tomorrow | `journal.yesterday`, `journal.tomorrow` | `commands-prev-next-shortcuts.test.ts` |
| Open entry by day expression | `journal.day` (smart input: date, weekday, offset) | `commands-day.test.ts` |
| Open entry by date picker | `journal.open` (QuickPick flow) | `commands-open.test.ts` |
| Open previous / next entry | `journal.openPrevious`, `journal.openNext` | extend `commands-prev-next.test.ts` |
| Open previous / next in non-default scope | `journal.openPrevious`, `journal.openNext` + scopes config | extend `commands-prev-next.test.ts` |
| Create / open a note | `journal.note` | `commands-note.test.ts` |
| Insert memo into today's entry | `journal.memo` (`memo: text`) | `commands-inject.test.ts` |
| Insert task into today's entry | `journal.task` (`task: text`) | `commands-inject.test.ts` |
| Create weekly entry | `journal.day` with week expression OR weekly write path | `commands-weekly.test.ts` |
| Mark open task done (code action) | `ForOpenTasksCodeAction` | `codeaction-tasks.test.ts` |
| Mark completed task open (code action) | `ForCompletedTasksCodeAction` | `codeaction-tasks.test.ts` |
| Print current time | `journal.printTime` | `commands-print.test.ts` |
| Print duration between selected times | `journal.printDuration` | `commands-print.test.ts` |
| Print sum of selected numbers | `journal.printSum` | `commands-print.test.ts` |

### Test-infrastructure fixes (prerequisite)

These must land first to avoid poisoning new suites:

- **`read-templates.test.ts`**: mutates `journal.scopes` without teardown → add `afterEach` restore.
- **`phase1-regression.test.ts:74`**: today-offset assertion brittle near midnight UTC → assert sign only, not exact ISO value.
- **`week-input.test.ts`**: `next week` uses `moment().week()`, fails on year-rollover week 52→1 → assert relative offset.
- **`notes-sync.test.ts`**: 8×500ms poll dumps no diagnostics on CI timeout → log captured state on failure.

## Out of scope

- `journal.weeklySync` — sync-note-links is exercised indirectly via `notes-sync.test.ts`; full integration deferred.
- `journal.open` workspace picker — requires interactive QuickPick; can only be tested via monkey-patch; defer unless trivial.
- `codelens/migrate-tasks.ts`, `shift-task.ts` — CodeLens providers; no activation path from command layer; defer.
- `scan-entries.ts`, `show-pick-list.ts` — internal feature, not a direct user story; `scan-entries-cache.test.ts` already covers caching.

## Acceptance criteria

- Every in-scope user story has ≥1 integration test with observable file-system or document assertion.
- All tests green in `npm test` on Linux CI.
- Four infra flakiness items addressed before new tests land.
- No new ESLint or TypeScript errors.
- `TestLogger.errors` asserted empty on every happy-path test.

## Entities / contracts

**Commands (instantiate directly, do not `registerCommand`):**
- `ShowEntryForTodayCommand`, `ShowEntryForYesterdayCommand`, `ShowEntryForTomorrowCommand` → `src/provider/commands/show-entry-for-today.ts` etc.
- `ShowEntryForDateCommand` (smart input) → `src/provider/commands/show-entry-for-date.ts`
- `ShowNoteCommand` → `src/provider/commands/show-note.ts`
- `OpenNextEntryCommand`, `OpenPreviousEntryCommand` → `src/provider/commands/open-next-entry.ts`, `open-previous-entry.ts`
- `PrintCurrentTimeCommand`, `PrintDurationCommand`, `PrintSumCommand` → `src/provider/commands/print-*.ts`

**Code actions:**
- `ForOpenTasksCodeAction`, `ForCompletedTasksCodeAction` → `src/provider/codeactions/`

**Domain actions under test:**
- `Writer.createEntryForDay`, `Writer.createWeeklyForWeek`, `Writer.createNote` → `src/actions/writer.ts`
- `Inject.injectInput` → `src/actions/inject.ts`
- `Navigation.openPreviousEntry`, `Navigation.openNextEntry` → `src/actions/navigation.ts`

**Test infrastructure:**
- Config pattern: `config.update('base', tmpBase, ConfigurationTarget.Workspace)` + fresh `new Ctrl(...)`
- Seeding: write fixture files via `vscode.workspace.fs.writeFile` before command invocation
- Spy pattern: `(vscode.window as any).showInformationMessage = wrapper`; restore in `afterEach`
- Error assertion: `assert.strictEqual(logger.errors.length, 0)`

## Constraints

- Tests run inside real VS Code Extension Host — no mocking of `vscode.workspace.fs`.
- Instantiate command classes directly: `new ShowEntryForTodayCommand(ctrl)`.
- Must pass on Linux (`xvfb-run npm test`).
- No `moment()` in new test code — use `Date` or fixed timestamps.

## Related issues

- Regression coverage closes: #51, #144, #167, #170
- Blocks: 1.1.0 milestone release
