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
import * as Path from 'path';
import { CHECKBOX, executions, highestKeys, keyName, scopeNames, TaskKey, withKey } from 'journal-core';
import { JournalIndex } from '../../shared/journal/journal-index';
import { planPages, scopeOfPage } from '../../shared/journal/plan-pages';
import { JournalController } from '../../shared/model/index';
import { SuperProductivityClient, SuperProductivitySettings } from './client';
import { MappingFile, TaskMapping } from './mapping';
import { ProjectMap, taskScope } from './projects';
import { betaLinks, withoutBetaLink } from './sync';

export type SessionDeps = Pick<JournalController, 'config' | 'keys' | 'fs' | 'logger' | 'ui'>;

/** What the journal knows about a page: the day of a daily entry, the scope of a file of a scope folder, the name of the file. */
export interface PageInfo {
    day?: string;
    scope?: string;
    file?: string;
}

/**
 * What a sync with Super Productivity works with, read once per command
 * (docs/specs/2026-11-13-scopes-keys-plans.md): the mapping of keys to tasks,
 * the keys handed out in this run, the pages of the journal.
 */
export class Session {
    public readonly scopeName: (name: string) => string | undefined;
    private highest?: Map<string, number>;

    private constructor(private readonly ctrl: SessionDeps, private readonly index: JournalIndex, private readonly file: MappingFile, public readonly mapping: TaskMapping) {
        this.scopeName = scopeNames(ctrl.config);
    }

    public static async open(ctrl: SessionDeps, index: JournalIndex, file: MappingFile): Promise<Session> {
        return new Session(ctrl, index, file, await file.load());
    }

    public save(): Promise<void> {
        return this.file.save(this.mapping);
    }

    /** The next key of the scope (undefined: the default scope); one after the other in this run. */
    public async nextKey(scope?: string): Promise<TaskKey> {
        this.highest ??= highestKeys(await this.ctrl.keys.texts());
        const name = scope?.toLowerCase() ?? '';
        const number = (this.highest.get(name) ?? 0) + 1;
        this.highest.set(name, number);
        return { scope, number };
    }

    /** The day, scope and file name of the page at `path`. */
    public async page(path: string): Promise<PageInfo> {
        const files = await this.index.get();
        const day = [...files.days].find(([, file]) => Path.normalize(file) === Path.normalize(path))?.[0];
        return { day, scope: scopeOfPage(this.ctrl.config, path), file: Path.basename(path) };
    }

    /** The entries and plans of the journal, and by key the day of its latest open line in the entries. */
    public async journal() {
        const pages = await planPages(this.index, this.ctrl.config);
        const plannedDay = new Map([...executions(pages.entries, this.scopeName)].filter(([, e]) => !e.done).map(([key, e]) => [key, e.day]));
        return { ...pages, plannedDay };
    }

    /**
     * Gives the lines keys where they have none (of their scope, see
     * `taskScope`, else of the default scope) and turns the links of the
     * betas (`<!-- sp:… -->`) into keys in the mapping (decision 24).
     * @returns the new texts of the lines it changed, and how many links it converted
     */
    public async keyLines(lines: readonly string[], indices: readonly number[], pageScope?: string): Promise<{ edits: Map<number, string>; converted: number }> {
        const edits = new Map<number, string>();
        const beta = new Map(betaLinks(lines).map(({ line, id }) => [line, id]));
        let converted = 0;
        for (const line of [...new Set([...indices, ...beta.keys()])].sort((a, b) => a - b)) {
            let text = lines[line];
            const box = CHECKBOX.exec(text);
            if (!box) { continue; }
            let key = keyName(text, this.scopeName);
            if (!key) {
                const next = await this.nextKey(taskScope(lines, line, this.scopeName, pageScope));
                text = text.slice(0, text.length - box[4].length) + withKey(box[4], next, this.scopeName);
                key = keyName(text, this.scopeName)!;
            }
            const id = beta.get(line);
            if (id !== undefined) {
                text = withoutBetaLink(text);
                if (!this.mapping.get(key)) { this.mapping.set(key, id); }
                converted++;
            }
            if (text !== lines[line]) { edits.set(line, text); }
        }
        return { edits, converted };
    }
}

/** The projects of Super Productivity and which scope stands for which. */
export async function projectMap(client: SuperProductivityClient, settings: SuperProductivitySettings): Promise<ProjectMap> {
    return new ProjectMap(await client.listProjects(), settings.projects);
}

/** The lines of a document. */
export function linesOf(document: vscode.TextDocument): string[] {
    return Array.from({ length: document.lineCount }, (_, i) => document.lineAt(i).text);
}

/** Replaces lines in the edit, unless they changed since they were read (`lines`). */
export function replaceLines(edit: vscode.WorkspaceEdit, document: vscode.TextDocument, lines: readonly string[], changes: Iterable<[number, string]>): void {
    for (const [line, text] of changes) {
        if (line < document.lineCount && document.lineAt(line).text === lines[line]) {
            edit.replace(document.uri, document.lineAt(line).range, text);
        }
    }
}
