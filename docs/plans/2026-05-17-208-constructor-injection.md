---
issue: "#208"
date: 2026-05-17
slug: 208-constructor-injection
spec: docs/specs/2026-05-17-208-constructor-injection.md
---

# Plan: Decompose `Ctrl` god object via constructor injection (#208)

## Approach

Remove `public ctrl: JournalController` from each action/UI constructor and replace it with the specific sub-interfaces the class actually uses. `Ctrl.initServices(logger: ILogger)` becomes the single composition step — it creates all action objects in dependency order and passes narrow sub-interfaces. `Startup.registerLoggingChannel` triggers it by creating `ConsoleLogger` first, then passing it to `initServices`.

**Amendment vs spec:** The spec said `initServices(channel: vscode.OutputChannel)`; this plan changes the signature to `initServices(logger: ILogger)`. Reason: `Ctrl` should not know about `vscode.OutputChannel`; pushing `ConsoleLogger` construction into `Startup` is better SRP. Tests can pass `TestLogger` directly. Behaviour is identical.

Main trade-off: 14 test files all do `ctrl.logger = new TestLogger(false)` — they must be updated to `ctrl.initServices(new TestLogger(false))` instead. The change is mechanical but touches many files.

## Steps

### Step 1 — `ConsoleLogger`: remove `ctrl`, accept `config: IConfiguration`

`src/util/logger.ts` constructor change:
```typescript
// Before: constructor(public ctrl: JournalController, public channel: vscode.OutputChannel)
// After:  constructor(private config: IConfiguration, public channel: vscode.OutputChannel)
```
Remove the `ctrl` field entirely; the constructor already copies `ctrl.config.isDevelopmentModeEnabled()` into `this.devMode` — copy from `config` directly now. No other body changes needed.

### Step 2 — `Inject`: remove `ctrl`, accept narrow params

`src/actions/inject.ts`:
- Constructor: `constructor(private config: IConfiguration, private logger: ILogger)`
- Remove `public ctrl` field
- Replace all `this.ctrl.config.` → `this.config.`
- Replace all `this.ctrl.logger.` → `this.logger.`

### Step 3 — `Parser`: remove `ctrl`, accept narrow params

`src/actions/parser.ts`:
- Constructor: `constructor(private config: IConfiguration, private logger: ILogger)`
- Replace all `this.ctrl.config.` → `this.config.`
- Replace all `this.ctrl.logger.` → `this.logger.`

### Step 4 — `ScanEntries`: remove `ctrl`, accept narrow params

`src/provider/features/scan-entries.ts`:
- Constructor: `constructor(private config: IConfiguration, private logger: ILogger)`
- Replace all `this.ctrl.config.` → `this.config.`
- Replace all `this.ctrl.logger.` → `this.logger.`

### Step 5 — `Writer`: remove `ctrl`, accept narrow params

`src/actions/writer.ts`:
- Constructor: `constructor(private config: IConfiguration, private logger: ILogger, private inject: IInject)`
- Replace all `this.ctrl.config.` → `this.config.`
- Replace all `this.ctrl.logger.` → `this.logger.`
- Replace all `this.ctrl.inject.` → `this.inject.`

### Step 6 — `Dialogues`: remove `ctrl`, accept narrow params

`src/ext/dialogues.ts`:
- Constructor: `constructor(private config: IConfiguration, private logger: ILogger, private parser: IParser)`
- The scanner field is created internally: change `new ScanEntries(this.ctrl)` → `new ScanEntries(config, logger)` (Step 4 makes this possible)
- `getScanner()` return type and body unchanged
- Replace all `this.ctrl.config.` → `this.config.`
- Replace all `this.ctrl.logger.` → `this.logger.`
- Replace all `this.ctrl.parser.` → `this.parser.`

### Step 7 — `Reader`: remove `ctrl`, accept narrow params

`src/actions/reader.ts`:
- Constructor: `constructor(private config: IConfiguration, private logger: ILogger, private writer: IWriter, private ui: IDialogues)`
- Replace all `this.ctrl.config.` → `this.config.`
- Replace all `this.ctrl.logger.` → `this.logger.`
- Replace all `this.ctrl.writer.` → `this.writer.`
- Replace all `this.ctrl.ui.` → `this.ui.`

### Step 8 — `Ctrl`: add `initServices`, remove construction from constructor

`src/util/controller.ts`:
- **Constructor**: remove the five `new J.Actions.*` and `new J.Extension.Dialogues` lines; keep only `this._config = new Configuration(vscodeConfig)`
- **Add** `initServices(logger: ILogger): void` that creates all services in dependency order:
  ```
  1. this._logger = logger
  2. this._inject = new Inject(this._config, logger)
  3. this._writer = new Writer(this._config, logger, this._inject)
  4. this._parser = new Parser(this._config, logger)
  5. this._ui     = new Dialogues(this._config, logger, this._parser)
  6. this._reader = new Reader(this._config, logger, this._writer, this._ui)
  ```
- **Import** the concrete classes directly: `import { Parser } from '../actions/parser'`, `import { Writer } from '../actions/writer'`, etc. (replace `J.Actions.*` and `J.Extension.*` references inside `initServices`)
- **Remove** the `logger` setter (setter injection replaced by `initServices`)
- **Keep** all getters unchanged
- `_logger` field type stays `Logger | undefined`; getter guard unchanged

Note: `controller.ts` still has `import * as J from '../.'` (barrel) for the field types in the class body (#201 work). This is acceptable for now; the barrel import is only for type references.

### Step 9 — `Startup`: trigger `initServices` from `registerLoggingChannel`

`src/ext/startup.ts`, `registerLoggingChannel` method only:
```typescript
// Before:
ctrl.logger = new J.Util.ConsoleLogger(ctrl, channel);
ctrl.logger.debug("...");
return ctrl;

// After:
const logger = new J.Util.ConsoleLogger(ctrl.config, channel);
ctrl.initServices(logger);
ctrl.logger.debug("...");
return ctrl;
```
No other changes to `Startup`.

### Step 10 — Tests: replace two-line pattern with `initServices`

Every test file that does:
```typescript
const ctrl = new J.Util.Ctrl(config);
ctrl.logger = logger;
```
changes to:
```typescript
const ctrl = new J.Util.Ctrl(config);
ctrl.initServices(logger);
```

Files affected (14): `commands-entry.test.ts`, `commands-inject.test.ts`, `commands-note.test.ts`, `commands-prev-next.test.ts`, `commands-weekly.test.ts`, `input.test.ts`, `issue-168-entry-granularity.test.ts`, `issue-185-weekly-sync.test.ts`, `issue-51-remote-create.test.ts`, `notes-sync.test.ts`, `phase1-regression.test.ts`, `read-templates.test.ts`, `scan-entries-cache.test.ts`, `week-input.test.ts`.

`scan-entries-cache.test.ts` additionally creates `new ScanEntries(ctrl)` — change to `new ScanEntries(ctrl.config, ctrl.logger)`.

### Step 11 — Verify

```bash
npm run compile       # zero errors
npm run lint          # zero new warnings
npm test              # 126 tests pass
grep -rn "this\.ctrl" src/actions/ src/ext/dialogues.ts src/util/logger.ts src/provider/features/scan-entries.ts
# must return no output
```

## Test scenarios

**T1 — Compile validates all parameter types (unit: TypeScript)**
After each step, run `npm run compile` to confirm no type errors. TypeScript rejects a `config: IConfiguration` where `ILogger` is expected, so mismatches surface immediately.

**T2 — `Ctrl.initServices` correctly wires services (integration)**
`npm test` passes all 126 tests. Tests create `new Ctrl(config); ctrl.initServices(testLogger)` — identical runtime path to production, just with `TestLogger` instead of `ConsoleLogger`.

**T3 — Barrel-free constructor params (static)**
`grep -rn "this\.ctrl" src/actions/ src/ext/dialogues.ts src/util/logger.ts src/provider/features/scan-entries.ts` → no output.

**T4 — `logger` getter guard still active (unit)**
Before `initServices` is called, `ctrl.logger` throws `"Tried to access undefined logger"`. Confirmed by compile check: getter body is unchanged.

**T5 — `Startup` initialisation path unchanged (integration)**
Extension activate path: `Ctrl(config)` → `initialize()` → `registerLoggingChannel()` → `initServices(logger)` → all getters populated → commands registered. Covered by T2 (full suite exercises this path through Extension Host).

## Dependencies

No other PRs or branches must land first. #201 (barrel removal in `controller.ts`) is a parallel track and can land in either order.

## Risk

| Risk | Coverage |
|---|---|
| Missing constructor arg → tsc error | T1 (compile after each step) |
| Test file misses `initServices` call → `undefined` service at runtime | T2 (test failures) |
| `Dialogues` creates wrong `ScanEntries` args → runtime crash | T2 |
| `logger` getter called before `initServices` → error thrown | T4 |
| `Startup` wiring broken → extension won't activate | T5 |

## Rollback

`git revert <commit>` — pure structural refactor, no data migrations.

## Reference spec

[docs/specs/2026-05-17-208-constructor-injection.md](../specs/2026-05-17-208-constructor-injection.md)
