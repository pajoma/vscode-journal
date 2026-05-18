# Spec: Infrastructure Abstraction Seams for Testability (#212)

## Goal

Introduce an `IFileSystem` interface that decouples `vscode.workspace.fs` from core domain logic, enabling pure-Node unit tests for file creation and directory walking without the VS Code Extension Host.

## Why Now

The test suite is entirely extension-host-bound: every test spins up a real VS Code process (~30 s suite run) because core logic calls `vscode.workspace.fs` directly. Introducing a seam here unblocks fast TDD cycles (~5 s) for the most I/O-heavy domain classes (`Writer`, `ScanEntries`, `fileExists`). This is the smallest architectural step with the highest return on test speed.

## Existing vs. New

The existing `IWriter`, `IReader`, `IInject`, `IDialogues` interfaces in `src/model/interfaces.ts` already serve as service-level seams. However they are insufficient for headless testing because:

- `Writer.createSaveLoadTextDocument` calls `vscode.workspace.fs.writeFile` and `vscode.workspace.openTextDocument` directly.
- `fileExists()` in `src/util/fs-exists.ts` calls `vscode.workspace.fs.stat` directly.
- `ScanEntries.walkDir()` calls `vscode.workspace.fs.readDirectory` and `.stat` directly.

The issue also mentions a `WorkspaceUI` interface. `IDialogues` in `src/model/interfaces.ts` already covers exactly that surface (`openDocument`, `showDocument`, `showError`, `getUserInput`). No new interface needed; the issue's `WorkspaceUI` name maps to `IDialogues`.

## In Scope

1. **Define `IFileSystem` interface** (`src/model/interfaces.ts`) with the following operations (mirroring `vscode.workspace.FileSystem` but typed in terms of plain `vscode.Uri` to stay VS Code-native without coupling to the concrete global):
   - `stat(uri: vscode.Uri): Promise<vscode.FileStat>`
   - `readFile(uri: vscode.Uri): Promise<Uint8Array>`
   - `writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void>`
   - `readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]>`
   - `createDirectory(uri: vscode.Uri): Promise<void>`
   - `delete(uri: vscode.Uri, options?: { recursive?: boolean }): Promise<void>`

2. **Provide `VscodeFileSystem`** (`src/vscode/vscode-fs.ts`) — thin wrapper delegating every method to `vscode.workspace.fs`. This is the production implementation.

3. **Thread `IFileSystem` into `Ctrl`** (`src/util/controller.ts`): add `fs: IFileSystem` getter. `Startup.initServices` passes `new VscodeFileSystem()`.

4. **Replace direct `vscode.workspace.fs` calls**:
   - `src/util/fs-exists.ts` — accept `IFileSystem` parameter or pull from `Ctrl`. Preferred: make `fileExists(fs: IFileSystem, uri: vscode.Uri)`.
   - `src/journal/writer.ts` — inject `IFileSystem` via constructor, replace `vscode.workspace.fs.writeFile` call.
   - `src/features/entries/scan-entries.ts` — inject `IFileSystem`, replace `.stat` and `.readDirectory` calls in `walkDir`.

5. **Ship an `InMemoryFileSystem` test double** (`src/test/in-memory-fs.ts`) — `Map<string, Uint8Array>` backing store; throws `FileNotFound` for missing paths; sufficient to drive unit tests of `Writer` and `ScanEntries`.

6. **Add headless unit tests** (no extension host) to prove the seam works:
   - `src/test/suite/writer-unit.test.ts` — verifies `createSaveLoadTextDocument` writes the correct bytes to the correct URI using `InMemoryFileSystem`.
   - `src/test/suite/scan-entries-unit.test.ts` — verifies `walkDir` traversal using an in-memory directory tree.

## Out of Scope

- Removing `vscode.TextDocument` from `IWriter`/`IReader` return types — that requires Phase 2.1 DI to be complete first.
- Renaming `IDialogues` to `WorkspaceUI` — no functional value right now; document the mapping instead.
- Mocking `vscode.workspace.applyEdit` in `Inject` — the WorkspaceEdit surface is edit-buffer-level, not filesystem-level; a separate seam (Phase 2.1 concern).
- Full constructor-injection removal of `Ctrl` (Phase 2.1, tracked separately).

## Acceptance Criteria

1. `IFileSystem` is defined in `src/model/interfaces.ts` and re-exported via `src/index.ts` (under `J.Model` or dedicated `J.Infra`).
2. `VscodeFileSystem` passes all current integration tests unchanged (no behaviour change).
3. `InMemoryFileSystem` exists in `src/test/` and is used by at least the two new unit test files.
4. The two new test files run with `npm test -- --grep "writer-unit\|scan-entries-unit"` **without** the extension host (`node -e` or mocha direct), completing in < 5 s.
5. `npm run compile-tests` and `npm test` pass with zero new errors.
6. No raw `vscode.workspace.fs` call remains in `Writer`, `fileExists`, or `ScanEntries` (grep check).

## Entities / Contracts

### `IFileSystem` (new, `src/model/interfaces.ts`)

```ts
export interface IFileSystem {
    stat(uri: vscode.Uri): Promise<vscode.FileStat>;
    readFile(uri: vscode.Uri): Promise<Uint8Array>;
    writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void>;
    readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]>;
    createDirectory(uri: vscode.Uri): Promise<void>;
    delete(uri: vscode.Uri, options?: { recursive?: boolean }): Promise<void>;
}
```

### `VscodeFileSystem` (new, `src/vscode/vscode-fs.ts`)

Delegates every method to `vscode.workspace.fs`. No logic; purely a type-boundary adapter.

### `fileExists(fs: IFileSystem, uri: vscode.Uri): Promise<boolean>`

Signature changes — callers must pass `ctrl.fs`. Catches `FileNotFound`; rethrows others.

### `Writer` constructor change

```ts
constructor(
    private config: IConfiguration,
    private logger: ILogger,
    private inject: IInject,
    private fs: IFileSystem,       // new
)
```

### `ScanEntries` constructor change

```ts
constructor(
    private config: IConfiguration,
    private logger: ILogger,
    private fs: IFileSystem,       // new
)
```

### `JournalController` (extension to `src/model/interfaces.ts`)

```ts
export interface JournalController {
    // ... existing ...
    fs: IFileSystem;               // new
}
```

## Constraints

- `vscode.Uri` stays in the interface (not plain strings) — remote-filesystem semantics require it; switching to strings would regress Remote SSH support.
- `InMemoryFileSystem` lives under `src/test/`, not `src/` — never shipped in the extension bundle.
- Do not introduce a `FileNotFound` error class — reuse the `vscode.FileSystemError.FileNotFound` factory or throw `{ code: 'FileNotFound' }` in the test double so `fileExists` catch logic is unchanged.

## Open Questions

None — scope is well-defined.

## Related Issues

- Blocks: none
- Blocked by: none
- Related: #208 (DI / Phase 2.1 removes `Ctrl` service locator; this spec introduces the FS seam as a preparatory step compatible with both the current and future DI state)
