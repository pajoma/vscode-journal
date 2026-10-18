import * as vscode from 'vscode';
import { JournalController } from '../../shared/model/index';
import { daysOfWeek } from 'journal-core';
import { getWeekFromPath } from '../../shared/paths';
import { SyncDailyLinks } from './sync-daily-links';

/**
 * Listens for active-editor changes and maintains a narrow FileSystemWatcher
 * over the seven daily-entry paths of the currently active weekly file.
 * FS events are debounced (500 ms) before triggering SyncDailyLinks.sync.
 * Disposed alongside the extension when pushed onto context.subscriptions.
 */
export class WeeklyEntryWatcher implements vscode.Disposable {

    private activeWatcher: vscode.FileSystemWatcher | undefined;
    private activePath: string | undefined;
    private debounceHandle: ReturnType<typeof setTimeout> | undefined;
    private readonly editorListener: vscode.Disposable;

    constructor(
        public ctrl: JournalController,
        public sync: SyncDailyLinks
    ) {
        this.editorListener = vscode.window.onDidChangeActiveTextEditor(
            e => this.handleEditorChange(e)
        );
        // Handle whatever is already open when the watcher is created.
        this.handleEditorChange(vscode.window.activeTextEditor);
    }

    public dispose(): void {
        this.clearDebounce();
        this.disposeActiveWatcher();
        this.editorListener.dispose();
    }

    private async handleEditorChange(
        editor: vscode.TextEditor | undefined
    ): Promise<void> {
        // only the file itself: not, for instance, the git: side of a diff editor
        if (!editor || editor.document.uri.scheme !== 'file') {
            this.disposeActiveWatcher();
            return;
        }

        const weeklyPath = editor.document.uri.fsPath;
        const weekInfo = getWeekFromPath(weeklyPath, this.ctrl.config);
        if (!weekInfo) {
            this.disposeActiveWatcher();
            return;
        }

        if (weeklyPath === this.activePath) {
            return; // Same weekly file regained focus — watcher still valid.
        }

        this.disposeActiveWatcher();
        this.activePath = weeklyPath;

        const { week, year, scope } = weekInfo;

        // Register a watcher scoped to the 7 daily file paths of this week.
        this.registerDailyWatcher(weeklyPath, week, year, scope);

        // Initial sync on open.
        this.sync.sync(weeklyPath, week, year, scope === 'default' ? undefined : scope)
            .catch(err => this.ctrl.logger.error("WeeklyEntryWatcher: initial sync failed:", err));
    }

    private registerDailyWatcher(
        weeklyPath: string,
        week: number,
        year: number,
        scope: string
    ): void {
        const scopeId = scope === 'default' ? undefined : scope;
        const dates = daysOfWeek(week, year, this.ctrl.config.getLocale());

        // The seven daily entry paths, as individual file globs: the narrowest scope for performance.
        const patterns = dates.map(date =>
            this.ctrl.config.getResolvedEntryPath(date, scopeId).value + '/' + this.ctrl.config.getEntryFilePattern(date, scopeId).value);

        // VSCode does not support multi-pattern FileSystemWatcher natively, so we
        // register one watcher per day and merge their events via the shared debounce.
        const disposables: vscode.Disposable[] = [];
        for (const pattern of patterns) {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            const handler = () => this.scheduleSync(weeklyPath, week, year, scopeId);
            disposables.push(
                watcher.onDidCreate(handler),
                watcher.onDidChange(handler),
                watcher.onDidDelete(handler),
                watcher
            );
        }

        // Wrap all disposables into a single composite disposable.
        this.activeWatcher = { dispose: () => disposables.forEach(d => d.dispose()) } as vscode.FileSystemWatcher;
    }

    private scheduleSync(
        weeklyPath: string,
        week: number,
        year: number,
        scope?: string
    ): void {
        this.clearDebounce();
        this.debounceHandle = setTimeout(() => {
            this.sync.sync(weeklyPath, week, year, scope)
                .catch(err => this.ctrl.logger.error("WeeklyEntryWatcher: debounced sync failed:", err));
        }, 500);
    }

    private clearDebounce(): void {
        if (this.debounceHandle !== undefined) {
            clearTimeout(this.debounceHandle);
            this.debounceHandle = undefined;
        }
    }

    private disposeActiveWatcher(): void {
        this.clearDebounce();
        if (this.activeWatcher) {
            this.activeWatcher.dispose();
            this.activeWatcher = undefined;
        }
        this.activePath = undefined;
    }
}
