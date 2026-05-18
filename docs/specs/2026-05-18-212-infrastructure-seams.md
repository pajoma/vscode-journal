# Spec: Infrastructure Abstraction Seams for Testability (#212)

## Goal

Introduce an `IFileSystem` interface (free of `vscode.*` types) that decouples `vscode.workspace.fs` from core domain logic, enabling pure-Node unit tests for file creation and directory walking without the VS Code Extension Host.

## Why Now

The test suite is entirely extension-host-bound: every test spins up a real VS Code process (~30 s suite run) because core logic calls `vscode.workspace.fs` directly. Introducing a seam here unblocks fast TDD cycles (< 5 s plain-Node) for the most I/O-heavy domain classes (`Writer`, `ScanEntries`, `fileExists`). This is the smallest architectural step with the highest return on test speed.

## Existing vs. New

The existing `IWriter`, `IReader`, `IInject`, `IDialogues` interfaces in `src/model/interfaces.ts` already serve as service-level seams. However they are insufficient for headless testing because:

- `Writer.createSaveLoadTextDocument` calls `vscode.workspace.fs.writeFile` and `vscode.workspace.openTextDocument` directly (inconsistently — `Reader` already delegates the `openDocument` step to `IDialogues`).
- `fileExists()` in `src/util/fs-exists.ts` calls `vscode.workspace.fs.stat` directly.
- `ScanEntries.walkDir()` calls `vscode.workspace.fs.readDirectory` and `.stat` directly.

The issue also mentions a `WorkspaceUI` interface. `IDialogues` in `src/model/interfaces.ts` already covers exactly that surface (`openDocument`, `showDocument`, `showError`, `getUserInput`). No new interface needed; the issue's `WorkspaceUI` name maps to `IDialogues`.

## Amendment (post-review)

Initial spec used `vscode.Uri` and `vscode.FileStat`/`vscode.FileType` in the `IFileSystem` interface. This was correctly identified as a type leak: `vscode.Uri` is a runtime class from the Extension Host, so any file importing the interface would still require the extension host for plain-Node tests.

Changes from the initial draft:
1. `IFileSystem` now uses `string` paths (URI string representation, e.g., `file:///…`) and defines its own `JFileStat` / `JFileType` in the model — zero `vscode.*` imports in the interface.
2. `Writer.createSaveLoadTextDocument` delegates `openTextDocument` to `IDialogues.openDocument` (aligning with `Reader`'s pattern) — eliminates the remaining direct `vscode` call from `Writer`.
3. `IWorkspaceEditor` / `WorkspaceEdit` seam is **out of scope** — `Inject.ts` operates on already-open editor buffers, which is editor I/O, not filesystem I/O. Different seam, separate issue.
4. Removing all `vscode.*` types from `IWriter`/`IReader`/`IInject`/`IDialogues` (the `TextDocument`, `Position`, `TextEditor` surface) is Phase 2.1 work — deferred. `IFileSystem` itself is fully clean.

## In Scope

1. **Define `JFileType` and `JFileStat`** in `src/model/fs.ts` (new file, no `vscode` import):
   ```ts
   export enum JFileType { Unknown = 0, File = 1, Directory = 2, SymbolicLink = 64 }
   export interface JFileStat { type: JFileType; ctime: number; mtime: number; size: number; }
   ```

2. **Define `IFileSystem` interface** in `src/model/interfaces.ts` — all paths are `string` (URI string form):
   - `stat(path: string): Promise<JFileStat>`
   - `readFile(path: string): Promise<Uint8Array>`
   - `writeFile(path: string, content: Uint8Array): Promise<void>`
   - `readDirectory(path: string): Promise<[string, JFileType][]>`
   - `createDirectory(path: string): Promise<void>`
   - `delete(path: string, options?: { recursive?: boolean }): Promise<void>`

3. **Provide `VscodeFileSystem`** (`src/vscode/vscode-fs.ts`) — converts `string → vscode.Uri.parse(path)` for every call, maps `vscode.FileType ↔ JFileType` and `vscode.FileStat → JFileStat`. Production implementation. Zero vscode imports visible to callers.

4. **Thread `IFileSystem` into `Ctrl`** (`src/util/controller.ts`): add `fs: IFileSystem` getter. `Startup.initServices` constructs `new VscodeFileSystem()`.

5. **Replace direct `vscode.workspace.fs` calls**:
   - `src/util/fs-exists.ts` — change to `fileExists(fs: IFileSystem, path: string): Promise<boolean>`. Catch `{ code: 'FileNotFound' }` instead of `vscode.FileSystemError`.
   - `src/journal/writer.ts` — inject `IFileSystem` (for `writeFile`) and `IDialogues` (for `openDocument`) via constructor, removing the two direct `vscode` calls.
   - `src/features/entries/scan-entries.ts` — inject `IFileSystem`, replace `.stat` and `.readDirectory` calls; map `JFileType.Directory` instead of `vscode.FileType.Directory`.

6. **Ship `InMemoryFileSystem` test double** (`src/test/in-memory-fs.ts`) — `Map<string, Uint8Array>` backing store + `Map<string, [string, JFileType][]>` for directory entries. Throws `{ code: 'FileNotFound' }` for missing paths. Zero vscode imports.

7. **Add pure-Node unit tests** (no extension host, run via `node` / mocha-direct):
   - `src/test/suite/writer-unit.test.ts` — verifies `createSaveLoadTextDocument` writes correct bytes at the correct path, with stubbed `IDialogues.openDocument`.
   - `src/test/suite/scan-entries-unit.test.ts` — verifies `walkDir` traversal against an in-memory directory tree.

## Out of Scope

- Removing `vscode.TextDocument` from `IWriter`/`IReader` return types — Phase 2.1.
- Introducing `JournalDocument` type — Phase 2.1.
- Renaming `IDialogues` to `WorkspaceUI` — no functional value now.
- `IWorkspaceEditor` / `WorkspaceEdit` seam for `Inject.ts` — editor-buffer I/O, not filesystem I/O; separate seam, separate issue.
- Full constructor-injection removal of `Ctrl` — Phase 2.1, issue #208.

## Acceptance Criteria

1. `JFileType`, `JFileStat`, `IFileSystem` defined in `src/model/` with zero `vscode` imports (grep-verifiable).
2. `VscodeFileSystem` passes all current integration tests unchanged (no behaviour change).
3. `InMemoryFileSystem` in `src/test/in-memory-fs.ts` — zero vscode imports; used by both new test files.
4. `npm test -- --grep "writer-unit|scan-entries-unit"` runs plain-Node (no Extension Host), completing < 5 s.
5. `npm run compile-tests` and `npm test` pass with zero new errors.
6. No raw `vscode.workspace.fs` call remains in `Writer`, `fileExists`, or `ScanEntries` (grep check).
7. `Writer.createSaveLoadTextDocument` no longer calls `vscode.workspace.openTextDocument` directly.

## Entities / Contracts

### `JFileType` and `JFileStat` (new, `src/model/fs.ts`)

```ts
export enum JFileType { Unknown = 0, File = 1, Directory = 2, SymbolicLink = 64 }
export interface JFileStat {
    type: JFileType;
    ctime: number;
    mtime: number;
    size: number;
}
```

### `IFileSystem` (new, `src/model/interfaces.ts`)

```ts
export interface IFileSystem {
    stat(path: string): Promise<JFileStat>;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, content: Uint8Array): Promise<void>;
    readDirectory(path: string): Promise<[string, JFileType][]>;
    createDirectory(path: string): Promise<void>;
    delete(path: string, options?: { recursive?: boolean }): Promise<void>;
}
```

### `VscodeFileSystem` (new, `src/vscode/vscode-fs.ts`)

Converts `string → vscode.Uri.parse(path)`. Maps `vscode.FileType ↔ JFileType` and `vscode.FileStat → JFileStat`. No logic beyond mapping; purely a type-boundary adapter.

### `fileExists(fs: IFileSystem, path: string): Promise<boolean>`

Calls `fs.stat(path)`; catches `{ code: 'FileNotFound' }` → `false`; rethrows others. No `vscode.FileSystemError` reference.

### `Writer` constructor change

```ts
constructor(
    private config: IConfiguration,
    private logger: ILogger,
    private inject: IInject,
    private fs: IFileSystem,       // new
    private ui: IDialogues,        // new (was absent; openDocument delegated here)
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

### `JournalController` extension

```ts
export interface JournalController {
    // ... existing ...
    fs: IFileSystem;               // new
}
```

## Constraints

- `VscodeFileSystem` uses `vscode.Uri.parse(path)` — preserves remote-URI semantics for Remote SSH / Codespaces.
- `InMemoryFileSystem` lives under `src/test/`, never in the extension bundle.
- `{ code: 'FileNotFound' }` is the error shape used by `InMemoryFileSystem`; `VscodeFileSystem` re-throws `vscode.FileSystemError` as-is (its `.code` is already `'FileNotFound'`), so `fileExists` catch logic is stable.
- Enum values of `JFileType` mirror `vscode.FileType` numeric values to simplify the mapping in `VscodeFileSystem`.

## Open Questions

None.

## Related Issues

- Blocks: none
- Blocked by: none
- Related: #208 (Phase 2.1 DI; this spec is a compatible preparatory step)
