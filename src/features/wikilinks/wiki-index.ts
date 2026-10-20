// Copyright (C) 2026  Patrick Maué
//
// This file is part of vscode-journal.
//
// vscode-journal is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// vscode-journal is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with vscode-journal.  If not, see <http://www.gnu.org/licenses/>.
'use strict';

import * as vscode from 'vscode';
import { JournalController } from '../../shared/model/index';
import { JournalFiles, scanJournalFiles } from './journal-files';

/**
 * The journal's files for wiki links (#92), scanned once and again after a
 * journal file was created, deleted or renamed (or the settings changed).
 * `peek` returns the last scan without waiting, for the markdown preview,
 * which renders synchronously.
 */
export class WikiIndex implements vscode.Disposable {

    private files?: JournalFiles;
    private scanning?: Promise<JournalFiles>;
    private stale = true;
    private readonly disposables: vscode.Disposable[] = [];
    /** Called after a scan finished, e.g. to refresh the markdown preview. */
    public onScanned?: () => void;

    constructor(private readonly ctrl: JournalController) {
        const invalidate = () => { this.stale = true; };
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(ctrl.config.getBasePath()), `**/*.${ctrl.config.getFileExtension()}`), false, true, false);
        this.disposables.push(
            watcher, watcher.onDidCreate(invalidate), watcher.onDidDelete(invalidate),
            vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('journal')) { invalidate(); } }),
        );
    }

    /** The journal's files, scanned again if something changed since the last scan. */
    public async get(): Promise<JournalFiles> {
        if (!this.stale && this.files) { return this.files; }
        if (!this.scanning) {
            this.stale = false;
            this.scanning = scanJournalFiles(this.ctrl.fs, this.ctrl.config)
                .then(files => {
                    this.files = files;
                    this.onScanned?.();
                    return files;
                })
                .finally(() => { this.scanning = undefined; });
        }
        return this.scanning;
    }

    /** The last scan, without waiting; starts a scan if there is none or it is outdated. */
    public peek(): JournalFiles | undefined {
        if (this.stale || !this.files) {
            this.get().catch(error => this.ctrl.logger.error("Failed to scan the journal for wiki links.", error));
        }
        return this.files;
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
