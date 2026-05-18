import * as vscode from 'vscode';
import * as Path from 'path';
import * as J from '../..';
import { getDatesOfISOWeek, replaceVariableValue } from '../../util';
import { resolveDate } from '../../journal/template-engine';
import { fileExists } from '../../util/fs-exists';

export class SyncDailyLinks {

    constructor(public ctrl: J.Util.Ctrl) { }

    /**
     * Orchestrates the full sync cycle for a weekly document: find existing
     * daily entries → render the link block → apply the block into the doc.
     * Short-circuits silently when weeklySync.enabled is false.
     */
    public async sync(
        weeklyDoc: vscode.TextDocument,
        week: number,
        year: number,
        scope?: string
    ): Promise<void> {
        const syncConfig = this.ctrl.config.getWeeklySyncConfig(scope);
        if (!syncConfig.enabled) { return; }

        const dailies = await this.findDailyEntriesForWeek(week, year, scope);
        const block = await this.renderBlock(weeklyDoc, dailies, scope);
        const applied = await this.applyBlock(weeklyDoc, syncConfig.anchor, block);
        if (applied) {
            this.ctrl.logger.debug("SyncDailyLinks: updated daily-entry links in", weeklyDoc.fileName);
        }
    }

    /**
     * Returns the URIs of existing daily entry files for the given week/year,
     * sorted by date ascending. Uses stat-first fileExists — no speculative opens.
     */
    public async findDailyEntriesForWeek(
        week: number,
        year: number,
        scope?: string
    ): Promise<vscode.Uri[]> {
        const dates = getDatesOfISOWeek(week, year);
        const result: vscode.Uri[] = [];

        for (const date of dates) {
            const pathTpl = await this.ctrl.config.getResolvedEntryPath(date, scope);
            const fileTpl = await this.ctrl.config.getEntryFilePattern(date, scope);
            if (!pathTpl.value || !fileTpl.value) { continue; }

            const fullPath = Path.normalize(Path.join(pathTpl.value, fileTpl.value));
            const uri = vscode.Uri.file(fullPath);
            if (await fileExists(uri)) {
                result.push(uri);
            }
        }

        return result;
    }

    /**
     * Renders the link block (no I/O). Returns a string with one link line per
     * existing daily entry, ordered per the configured sortOrder.
     */
    public async renderBlock(
        weeklyDoc: vscode.TextDocument,
        dailies: vscode.Uri[],
        scope?: string
    ): Promise<string> {
        const syncConfig = this.ctrl.config.getWeeklySyncConfig(scope);
        const tpl = await this.ctrl.config.getDailyLinkInlineTemplate(scope);
        const weeklyDir = Path.parse(weeklyDoc.uri.fsPath).dir;
        const locale = this.ctrl.config.getLocale();

        const lines: string[] = [];
        for (const uri of dailies) {
            const date = await J.Journal.getDateFromURIAndConfig(uri.fsPath, this.ctrl.config);
            const relativePath = Path.relative(weeklyDir, uri.fsPath).replace(/\\/g, '/');

            let line = tpl.template;
            line = resolveDate(line, date, locale);
            line = replaceVariableValue("link", relativePath, line);
            // ${title} substitution: filename without extension
            const title = Path.parse(uri.fsPath).name.replace(/_/g, ' ');
            line = replaceVariableValue("title", title, line);
            lines.push(line);
        }

        if (syncConfig.sortOrder === "descending") {
            lines.reverse();
        }

        return lines.join('\n');
    }

    /**
     * Replaces (or inserts) the content under the anchor heading in weeklyDoc.
     * The replaced range is from the line after the anchor up to (not including)
     * the next markdown heading at any level, or end of document.
     * Returns true if the document was modified, false if it was already correct.
     */
    public async applyBlock(
        weeklyDoc: vscode.TextDocument,
        anchor: string,
        block: string
    ): Promise<boolean> {
        const text = weeklyDoc.getText();
        const lines = text.split('\n');

        // Find anchor line (exact match after trimming trailing whitespace).
        const anchorLineIdx = lines.findIndex(l => l.trimEnd() === anchor);
        if (anchorLineIdx === -1) {
            this.ctrl.logger.debug(
                "SyncDailyLinks: anchor not found in", weeklyDoc.fileName,
                "— configure '## Daily Entries' or set journal.weeklySync.anchor"
            );
            return false;
        }

        // Find end of block: next markdown heading or end of doc.
        let blockEndLineIdx = lines.length;
        for (let i = anchorLineIdx + 1; i < lines.length; i++) {
            if (/^#+\s/.test(lines[i])) {
                blockEndLineIdx = i;
                break;
            }
        }

        // Existing block content between anchor+1 and blockEnd (exclusive).
        const existingLines = lines.slice(anchorLineIdx + 1, blockEndLineIdx);
        const existingBlock = existingLines
            .map(l => l.trimEnd())
            .join('\n')
            .trim();
        const newBlock = block.trim();

        if (existingBlock === newBlock) {
            return false; // idempotent — nothing to do
        }

        // Replacement: blank line, content, blank line (for markdown tidiness).
        const replacement = '\n' + (newBlock.length > 0 ? newBlock + '\n' : '') + '\n';

        const startPos = weeklyDoc.lineAt(anchorLineIdx + 1).range.start;
        const endLine = blockEndLineIdx < weeklyDoc.lineCount
            ? blockEndLineIdx
            : weeklyDoc.lineCount - 1;
        const endPos = blockEndLineIdx < weeklyDoc.lineCount
            ? weeklyDoc.lineAt(blockEndLineIdx).range.start
            : weeklyDoc.lineAt(endLine).range.end;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(weeklyDoc.uri, new vscode.Range(startPos, endPos), replacement);
        await vscode.workspace.applyEdit(edit);
        await this.ctrl.ui.saveDocument(weeklyDoc);
        return true;
    }
}
