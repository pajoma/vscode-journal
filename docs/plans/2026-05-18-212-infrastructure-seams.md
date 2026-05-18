# Plan: Infrastructure Abstraction Seams for Testability — #212

## Reference spec
[docs/specs/2026-05-18-212-infrastructure-seams.md](../specs/2026-05-18-212-infrastructure-seams.md)

## Approach
Introduce a platform-agnostic `IFileSystem` interface using string-based URI paths and custom stat types. Implement a `VscodeFileSystem` adapter for production and an `InMemoryFileSystem` for headless unit tests. Refactor `Writer`, `ScanEntries`, and `fileExists` to depend on the interface, enabling pure-Node testing of core domain logic.

## Steps

### 1 — Define Domain FS Types (`src/model/fs.ts`)
Create new file. Define `JFileType` (enum) and `JFileStat` (interface) with zero `vscode` imports. This establishes the platform-agnostic data structures for the filesystem.

### 2 — Define `IFileSystem` Interface (`src/model/interfaces.ts`)
Add `IFileSystem` to the central interfaces file. Use `string` for all path parameters to avoid `vscode.Uri` coupling. Update `JournalController` and `IDialogues` (if needed) to ensure zero `vscode` leaks in method signatures.

### 3 — Implement `VscodeFileSystem` Adapter (`src/vscode/vscode-fs.ts`)
Create production implementation that wraps `vscode.workspace.fs`.
- Convert `string` paths → `vscode.Uri.parse(path)`.
- Map `vscode.FileType` ↔ `JFileType`.
- Map `vscode.FileStat` → `JFileStat`.
- Ensure errors are re-thrown so that `.code === 'FileNotFound'` remains consistent.

### 4 — Thread `IFileSystem` through `Ctrl` (`src/util/controller.ts`)
- Add `fs: IFileSystem` property to `JournalController` interface.
- Add `private _fs?: IFileSystem` and `public get fs()` to `Ctrl`.
- Update `initServices(logger: ILogger)` to accept `fs: IFileSystem` (or construct `VscodeFileSystem` internally if appropriate for current architecture).
- **Update:** Based on #208 (constructor injection), update `Startup.initServices` to construct and pass the `fs` implementation.

### 5 — Refactor `fileExists` (`src/util/fs-exists.ts`)
- Change signature to `fileExists(fs: IFileSystem, path: string): Promise<boolean>`.
- Replace `vscode.workspace.fs.stat` with `fs.stat`.
- Catch `{ code: 'FileNotFound' }` for the false branch.

### 6 — Refactor `Writer` (`src/journal/writer.ts`)
- Add `private fs: IFileSystem` and `private ui: IDialogues` to constructor.
- Replace `vscode.workspace.fs.writeFile` with `fs.writeFile`.
- Replace `vscode.workspace.openTextDocument` with `this.ui.openDocument`.
- Convert `string` content → `Uint8Array` (Buffer.from) for the `writeFile` call.

### 7 — Refactor `ScanEntries` (`src/features/entries/scan-entries.ts`)
- Add `private fs: IFileSystem` to constructor.
- Replace `vscode.workspace.fs.readDirectory` and `.stat` calls with `fs` equivalents.
- Use `JFileType` for logic branches.

### 8 — Implement `InMemoryFileSystem` (`src/test/in-memory-fs.ts`)
Create test double for headless unit tests.
- Use `Map<string, Uint8Array>` for file storage.
- Use `Map<string, [string, JFileType][]>` for directory listings.
- Mock `stat` to return `JFileStat` from map keys.
- Throw `{ code: 'FileNotFound' }` for missing entries.

### 9 — Add Headless Unit Tests (`src/test/suite/*-unit.test.ts`)
- `writer-unit.test.ts`: Verify `createSaveLoadTextDocument` writes correct content to `InMemoryFileSystem`.
- `scan-entries-unit.test.ts`: Verify `walkDir` correctly traverses a mock directory tree.
- Run via `mocha` directly (headless).

## Test scenarios
- **Production Integration:** Existing tests must pass using `VscodeFileSystem`.
- **Headless Isolation:** `npm test -- --grep "-unit"` must pass in < 5s without the extension host.
- **Error Consistency:** Verify `fileExists` correctly handles missing files in both implementations.

## Rollback
`git revert <commit>` — structural refactor with no side effects on user data.
