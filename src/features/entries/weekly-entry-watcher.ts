import * as vscode from 'vscode';
import * as J from '../..';
import { getDatesOfISOWeek } from '../../util/dates';
import { getWeekFromURIAndConfig } from '../../journal/paths';
import { SyncDailyLinks } from '../sync/sync-daily-links';

/**
 * Listens for active-editor changes and maintains a narrow FileSystemWatcher
 * over the seven daily-entry paths of the currently active weekly file.
 * FS events are debounced (500 ms) before triggering SyncDailyLinks.sync.
 * Disposed alongside the extension when pushed onto context.subscriptions.
 */
export class WeeklyEntryWatcher implements vscode.Disposable {

    private activeWatcher: vscode.FileSystemWatcher | undefined;
    private activeUri: string | undefined;
    private debounceHandle: ReturnType<typeof setTimeout> | undefined;
    private readonly editorListener: vscode.Disposable;

    constructor(
        public ctrl: J.Util.Ctrl,
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
        if (!editor) {
            this.disposeActiveWatcher();
            return;
        }

        const weekInfo = await getWeekFromURIAndConfig(
            editor.document.uri,
            this.ctrl.config
        );
        if (!weekInfo) {
            this.disposeActiveWatcher();
            return;
        }

        const uriStr = editor.document.uri.toString();
        if (uriStr === this.activeUri) {
            return; // Same weekly file regained focus — watcher still valid.
        }

        this.disposeActiveWatcher();
        this.activeUri = uriStr;

        const { week, year, scope } = weekInfo;

        // Register a watcher scoped to the 7 daily file paths of this week.
        this.registerDailyWatcher(editor.document, week, year, scope);

        // Initial sync on open.
        this.sync.sync(editor.document, week, year, scope === 'default' ? undefined : scope)
            .catch(err => this.ctrl.logger.error("WeeklyEntryWatcher: initial sync failed:", err));
    }

    private async registerDailyWatcher(
        weeklyDoc: vscode.TextDocument,
        week: number,
        year: number,
        scope: string
    ): Promise<void> {
        const scopeId = scope === 'default' ? undefined : scope;
        const dates = getDatesOfISOWeek(week, year);

        // Resolve all seven daily entry paths.
        const patterns: string[] = [];
        for (const date of dates) {
            const pathTpl = await this.ctrl.config.getResolvedEntryPath(date, scopeId);
            const fileTpl = await this.ctrl.config.getEntryFilePattern(date, scopeId);
            if (pathTpl.value && fileTpl.value) {
                // Use individual file globs — narrowest possible scope for performance.
                patterns.push(pathTpl.value + '/' + fileTpl.value);
            }
        }

        if (patterns.length === 0) { return; }

        // VSCode does not support multi-pattern FileSystemWatcher natively, so we
        // register one watcher per day and merge their events via the shared debounce.
        const disposables: vscode.Disposable[] = [];
        for (const pattern of patterns) {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            const handler = () => this.scheduleSync(weeklyDoc, week, year, scopeId);
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
        doc: vscode.TextDocument,
        week: number,
        year: number,
        scope?: string
    ): void {
        this.clearDebounce();
        this.debounceHandle = setTimeout(() => {
            this.sync.sync(doc, week, year, scope)
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
        this.activeUri = undefined;
    }
}
