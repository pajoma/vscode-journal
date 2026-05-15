# Spec: Close user-journey test coverage gaps before 1.1.0 (#190)

## Goal

Add regression and journey tests for the five highest-risk flows identified in the 1.1.0 coverage audit, and fix three test-infrastructure flakiness items.

## Why now

1.1.0 milestone. Milestone bugs (#51, #144, #167, #170) are fixed; none has a test that would catch a recurrence. Release without coverage leaves those fixes unverifiable.

## In scope

### Tests to add

1. **Mark-task-complete code action (E2E)**
   - Files: `src/provider/codeactions/for-open-tasks.ts`, `for-completed-tasks.ts`
   - Scenario: seed entry with `- [ ] foo`, invoke `ForOpenTasksCodeAction`, assert line becomes `- [x] foo` with completed timestamp.
   - Currently: zero direct tests on either file.

2. **Weekly entry creation full write path (#167 regression)**
   - Files: `src/actions/writer.ts` (`createWeeklyForWeek`), `src/ext/conf.ts` (weekly template resolution)
   - Scenario: call weekly creation with tmp base, assert file exists at `${base}/${year}/wNN.md` and body matches resolved `weekly` template.
   - Currently: `phase1-regression.test.ts:10` only resolves the template object, does not write.

3. **`Inject.injectInput` E2E — memo / task / file link**
   - File: `src/actions/inject.ts`
   - Scenarios: seed today's entry, run `journal.memo` with `memo: lorem ipsum`, assert file gains the line at correct anchor. Parallel cases for `task:` and file link.
   - Currently: no targeted inject suite.

4. **Prev/next under non-default scope (#144 regression)**
   - File: `src/actions/navigation.ts`
   - Scenarios:
     - Seed `${base}/scopes/work/2025/03/{05,08}.md`, anchor on `08.md` in `work` scope, assert `OpenPreviousEntryCommand` opens `05.md` and does not cross into default scope.
     - Calendar mode backward through a non-existent day.
   - Currently: navigation tests use only default scope.

5. **`journal.today` command-layer E2E under remote-style URI (#51 closure)**
   - File: `src/provider/commands/show-entry-for-date.ts`
   - Scenario: `vscode.commands.executeCommand('journal.today')` against tmp base with no existing entry, assert no error and entry file exists afterwards.
   - Currently: `issue-51-remote-create.test.ts` stops at `Reader.loadEntryForDay`.

### Test-infrastructure fixes

- **`read-templates.test.ts`**: mutates `journal.scopes` without teardown → add `afterEach` restore.
- **`phase1-regression.test.ts:74`**: today-offset brittle near midnight UTC → use fixed clock or assert sign only.
- **`week-input.test.ts`**: `next week` uses `moment().week()`, fails on year-rollover week 52→1 → injected clock or relative offset assertion.
- **`notes-sync.test.ts`**: 8×500ms poll with no diagnostic dump on failure → log captured state on timeout.

## Out of scope

Zero-coverage modules not needed for 1.1.0:
- `codelens/migrate-tasks.ts`, `shift-task.ts`
- `features/scan-entries.ts`, `show-pick-list.ts`
- `features/sync-note-links.ts` (only indirect), `load-note.ts` (indirect)
- `src/ext/conf.ts` template/scope path resolution

## Acceptance criteria

- All five test groups added and green in `npm test`.
- Each closed 1.1.0 bug (#170, #167, #51, #144) has ≥1 regression test that would catch a recurrence.
- Four infra flakiness items addressed.
- No new ESLint or TypeScript errors introduced.

## Entities / contracts

- `ForOpenTasksCodeAction` / `ForCompletedTasksCodeAction` in `src/provider/codeactions/`
- `Writer.createWeeklyForWeek(input, ctrl)` in `src/actions/writer.ts`
- `Inject.injectInput(input, document, ctrl)` in `src/actions/inject.ts`
- `OpenPreviousEntryCommand` / `OpenNextEntryCommand` in `src/provider/commands/`
- Test helpers: `command-test-helpers.ts`, `TestLogger` (`src/test/test-logger.ts`)
- Pattern for config: `config.update('base', tmpBase, ConfigurationTarget.Workspace)` + fresh `Ctrl`

## Constraints

- Tests run inside real VS Code Extension Host — no mocking of `vscode.workspace.fs`.
- Do not register commands in tests — instantiate command classes directly.
- Must pass on Linux (CI uses `xvfb-run`).

## Open questions

None after reviewing issue body.

## Related issues

- Blocks: milestone 1.1.0 release
- Regression coverage for: #51, #144, #167, #170
