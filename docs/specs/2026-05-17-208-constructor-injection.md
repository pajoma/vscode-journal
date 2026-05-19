---
issue: "#208"
date: 2026-05-17
slug: 208-constructor-injection
plan: docs/plans/2026-05-17-208-constructor-injection.md
---

# Spec: Decompose `Ctrl` god object via constructor injection (#208)

## Goal

Replace `constructor(public ctrl: JournalController)` in the six action/UI modules with explicit narrow-interface parameters so each class declares exactly which services it needs.

## Why now

`#207` gave every class a typed abstraction (`JournalController`) but they still receive the entire controller object. This preserves all the blast-radius and hidden-dependency problems identified in the issue: a change to any service on `Ctrl` potentially recompiles every downstream class, and it is impossible to tell from a constructor signature alone which services a class actually uses. Now that sub-interfaces are defined, the next logical step is to wire them directly.

## In scope

Narrow constructor injection for the six modules updated in #207 plus `ScanEntries`:

| Class | Current | After |
|---|---|---|
| `Inject` | `ctrl: JournalController` | `config: IConfiguration, logger: ILogger` |
| `Parser` | `ctrl: JournalController` | `config: IConfiguration, logger: ILogger` |
| `Writer` | `ctrl: JournalController` | `config: IConfiguration, logger: ILogger, inject: IInject` |
| `Reader` | `ctrl: JournalController` | `config: IConfiguration, logger: ILogger, writer: IWriter, ui: IDialogues` |
| `Dialogues` | `ctrl: JournalController` | `config: IConfiguration, logger: ILogger, parser: IParser` |
| `ConsoleLogger` | `ctrl: JournalController, channel` | `config: IConfiguration, channel` |
| `ScanEntries` | `ctrl: JournalController` | `config: IConfiguration, logger: ILogger` |

`Ctrl` becomes a two-phase object:
- **Phase 1 (constructor):** creates `Configuration` only; all other fields `undefined`
- **Phase 2 (`initServices(logger, channel)`):** creates all service instances in dependency order, passing narrow sub-interfaces; `Ctrl` fields become fully populated

`Startup.registerLoggingChannel` triggers Phase 2 by calling `ctrl.initServices(channel)`. Internally `Ctrl.initServices` creates `ConsoleLogger` first (since `Configuration` is already available), then creates each action class with its specific dependencies.

The `logger` getter on `Ctrl` retains its "throw if unset" guard — behaviour is unchanged; logger must be initialized before any commands run.

## Out of scope

- `src/provider/commands/*` — these receive `ctrl: Ctrl` (concrete); narrowing them is separate Phase 2.3 work
- `src/ext/startup.ts` API surface — `run()`, `registerCommands()` etc. signatures unchanged
- No behavior changes; pure structural refactor

## Acceptance criteria

1. None of the seven updated classes has a `ctrl` constructor parameter or field
2. `Ctrl` has an `initServices(channel: vscode.OutputChannel): void` method; its constructor no longer instantiates action classes
3. `Startup.registerLoggingChannel` calls `ctrl.initServices(channel)` instead of `ctrl.logger = new ConsoleLogger(ctrl, channel)`
4. `npm run compile` zero errors
5. `npm run lint` zero new warnings
6. `npm test` 126 tests pass (no regressions)
7. Grep: `grep -rn "this\.ctrl" src/actions/ src/ext/dialogues.ts src/util/logger.ts src/provider/features/scan-entries.ts` → no output

## Entities / contracts

### `Ctrl` constructor + `initServices`

```typescript
// Phase 1 — constructor (called by Startup constructor)
constructor(vscodeConfig: vscode.WorkspaceConfiguration) {
    this._config = new Configuration(vscodeConfig);
}

// Phase 2 — called by Startup.registerLoggingChannel after channel exists
initServices(channel: vscode.OutputChannel): void {
    const logger = new ConsoleLogger(this._config, channel);
    const inject = new Inject(this._config, logger);
    const writer = new Writer(this._config, logger, inject);
    const parser = new Parser(this._config, logger);
    const ui   = new Dialogues(this._config, logger, parser);
    const reader = new Reader(this._config, logger, writer, ui);
    this._logger = logger;
    this._inject = inject;
    this._writer = writer;
    this._parser = parser;
    this._ui     = ui;
    this._reader = reader;
}
```

`ScanEntries` is not constructed in `Ctrl`; it continues to be created inside `Dialogues.constructor` (now as `new ScanEntries(config, logger)`).

### Updated constructors (bare signatures)

```typescript
new Inject(config: IConfiguration, logger: ILogger)
new Writer(config: IConfiguration, logger: ILogger, inject: IInject)
new Parser(config: IConfiguration, logger: ILogger)
new Reader(config: IConfiguration, logger: ILogger, writer: IWriter, ui: IDialogues)
new Dialogues(config: IConfiguration, logger: ILogger, parser: IParser)
new ConsoleLogger(config: IConfiguration, channel: vscode.OutputChannel)
new ScanEntries(config: IConfiguration, logger: ILogger)
```

### `Ctrl` field access by consumers

Getters (`ctrl.config`, `ctrl.logger`, `ctrl.parser`, etc.) remain unchanged. Providers and commands that receive `ctrl: Ctrl` continue to compile without modification.

## Constraints

- `Startup` must not be changed except in `registerLoggingChannel` (swap `new ConsoleLogger(ctrl, channel)` for `ctrl.initServices(channel)`) to keep the PR diff minimal
- `Ctrl` constructor must remain callable with only `vscode.WorkspaceConfiguration` — `Startup` constructor does `new Ctrl(this.config)` today
- All field types on `Ctrl` that were private become `private` (not public) — getters are the public API
- TypeScript `strict` + `noImplicitReturns` — all getter guards remain

## Open questions

None.

## Related issues

- Builds on: #207 (introduced `JournalController` interface and sub-interfaces)
- Related: #201 (barrel removal in `controller.ts` — independent track)
- See `docs/PLAN.md` Phase 2 (DI replacement)
