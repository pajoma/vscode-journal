import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as J from '../..';
import { ScanEntries } from '../../provider/features/scan-entries';
import { SCOPE_DEFAULT } from '../../ext';
import { JournalPageType, ScopeDirectory } from '../../model';
import { TestLogger } from '../test-logger';

async function seedEntry(base: string, year: number, month: number, day: number, content = '# Entry\n'): Promise<void> {
    const yy = String(year).padStart(4, '0');
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dir = vscode.Uri.file(path.join(base, yy, mm));
    await vscode.workspace.fs.createDirectory(dir);
    const file = vscode.Uri.file(path.join(base, yy, mm, `${dd}.md`));
    await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(content));
}

suite('Issue #187 — ScanEntries cache short-circuit and invalidation', () => {
    let originalBase: string | undefined;
    let tmpBase: string;
    let ctrl: J.Util.Ctrl;
    let scanner: ScanEntries;
    let walkCount: number;
    let originalWalkDir: any;

    setup(async () => {
        const config = vscode.workspace.getConfiguration('journal');
        originalBase = config.get<string>('base');

        tmpBase = path.join(os.tmpdir(), `issue187-base-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
        await config.update('base', tmpBase, vscode.ConfigurationTarget.Workspace);

        await seedEntry(tmpBase, 2025, 3, 5);
        await seedEntry(tmpBase, 2025, 3, 8);
        await seedEntry(tmpBase, 2025, 4, 1);

        const refreshed = vscode.workspace.getConfiguration('journal');
        ctrl = new J.Util.Ctrl(refreshed);
        ctrl.logger = new TestLogger(false);
        scanner = new ScanEntries(ctrl);

        walkCount = 0;
        originalWalkDir = (ScanEntries.prototype as any).walkDir;
        (ScanEntries.prototype as any).walkDir = async function (dir: string, threshold: number, callback: Function): Promise<void> {
            if (typeof dir === 'string' && dir.startsWith(tmpBase)) {
                walkCount++;
            }
            return originalWalkDir.call(this, dir, threshold, callback);
        };
    });

    teardown(async () => {
        (ScanEntries.prototype as any).walkDir = originalWalkDir;
        const config = vscode.workspace.getConfiguration('journal');
        await config.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
    });

    async function runScan(): Promise<void> {
        const directories = new Set<ScopeDirectory>([{ path: tmpBase, scope: SCOPE_DEFAULT }]);
        let resolveDone: () => void = () => { /* set below */ };
        const done = new Promise<void>(resolve => { resolveDone = resolve; });

        let pendingDirs = 0;
        let walkStarted = false;

        const callback = (_entries: any[], _picker: any, _type: any) => {
            // first callback signals at least one walk pass completed
            if (!walkStarted) {
                walkStarted = true;
            }
        };

        await scanner.getPreviouslyAccessedFiles(Date.now() - 1000 * 60 * 60 * 24 * 365, callback as any, null, JournalPageType.entry, directories);
        // scanDirectory is fire-and-forget inside getPreviouslyAccessedFiles; let the microtask queue drain
        await new Promise(resolve => setTimeout(resolve, 100));
        // silence unused warnings
        void pendingDirs; void resolveDone; void done;
    }

    test('first scan walks the filesystem', async () => {
        await runScan();
        assert.ok(walkCount > 0, `expected ScanEntries.walkDir to run on first scan, got ${walkCount}`);
    });

    test('second scan with populated cache does NOT walk the filesystem', async () => {
        await runScan();
        const firstCount = walkCount;
        assert.ok(firstCount > 0, 'precondition: first scan must have walked the FS');

        walkCount = 0;
        await runScan();

        assert.strictEqual(walkCount, 0, `expected zero walkDir calls on cached scan, got ${walkCount}`);
    });

    test('clearCache() restores dirty state — next scan walks again', async () => {
        await runScan();
        assert.ok(walkCount > 0);

        scanner.clearCache();

        walkCount = 0;
        await runScan();

        assert.ok(walkCount > 0, `expected fresh walk after clearCache, got ${walkCount}`);
    });
});
