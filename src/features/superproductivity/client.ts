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

/** `journal.superProductivity.*` */
export interface SuperProductivitySettings {
    enabled: boolean;
    /** Address of the Local REST API, without trailing slash. */
    url: string;
    /** Tag (without `#`) → title or id of a project, for tags that are not the title of their project. */
    projects: Record<string, string>;
}

export const DEFAULT_URL = 'http://127.0.0.1:3876';

/** Where the token of the Local REST API is kept (the secret storage of VS Code). */
export interface TokenStore {
    get(): Promise<string | undefined>;
    store(token: string): Promise<void>;
}

/** The part of a task in Super Productivity the journal works with. */
export interface SuperProductivityTask {
    id: string;
    title: string;
    isDone: boolean;
    /** Time of the completion (ms). */
    doneOn?: number | null;
    /** Time of the last change (ms); missing on tasks never changed. */
    modified?: number;
    /** The day it is planned for, `YYYY-MM-DD`; none: not planned. */
    dueDay?: string | null;
    /** Set on sub-tasks. */
    parentId?: string | null;
    /** The project; `INBOX_PROJECT` for the inbox. */
    projectId?: string | null;
    /** The description. */
    notes?: string;
}

export interface SuperProductivityProject {
    id: string;
    title: string;
}

/** Where a new task goes: `dueDay` `YYYY-MM-DD` (null: not planned; none: today), `projectId` (none: the inbox), `notes` its description. */
export interface NewTask {
    dueDay?: string | null;
    projectId?: string;
    notes?: string;
}

export type FailureReason = 'no-token' | 'unreachable' | 'rejected' | 'failed';

/** A request that did not succeed; the commands turn the reason into a message. */
export class SuperProductivityError extends Error {
    constructor(public readonly reason: FailureReason, detail?: string) {
        super(detail ? `${reason}: ${detail}` : reason);
    }
}

interface ApiResponse<T> {
    ok: boolean;
    data?: T;
    error?: { code: string; message: string };
}

const TIMEOUT_MS = 5000;

/**
 * Client of the Local REST API of the Super Productivity desktop app. No
 * vscode: settings and token come in, so it runs in the node unit tests.
 */
export class SuperProductivityClient {

    constructor(private readonly settings: () => SuperProductivitySettings, private readonly tokens: TokenStore) { }

    /**
     * Creates a task, see {@link NewTask}. The title is kept as it is: `#tag`,
     * `30m` and the like in it are not read as short syntax.
     */
    public async createTask(title: string, where: NewTask = {}): Promise<SuperProductivityTask> {
        const task = await this.request<SuperProductivityTask>('POST', '/tasks', { title, isIgnoreShortSyntax: true, ...where });
        if (!task) { throw new SuperProductivityError('failed', 'no task returned'); }
        return task;
    }

    /** All tasks, open and done, the archived ones included. */
    public async listTasks(): Promise<SuperProductivityTask[]> {
        return await this.request<SuperProductivityTask[]>('GET', '/tasks?includeDone=true&source=all') ?? [];
    }

    /** Undefined if the task does not exist (any more). */
    public getTask(id: string): Promise<SuperProductivityTask | undefined> {
        return this.request<SuperProductivityTask>('GET', `/tasks/${encodeURIComponent(id)}`);
    }

    /** Completes or reopens the task; undefined if it does not exist (any more). */
    public setTaskState(id: string, isDone: boolean): Promise<SuperProductivityTask | undefined> {
        return this.request<SuperProductivityTask>('PATCH', `/tasks/${encodeURIComponent(id)}`, { isDone });
    }

    /** The projects, the inbox included. */
    public async listProjects(): Promise<SuperProductivityProject[]> {
        return await this.request<SuperProductivityProject[]>('GET', '/projects') ?? [];
    }

    /** Moves the task to the project; undefined if it does not exist (any more). */
    public setProject(id: string, projectId: string): Promise<SuperProductivityTask | undefined> {
        return this.request<SuperProductivityTask>('PATCH', `/tasks/${encodeURIComponent(id)}`, { projectId });
    }

    /** Plans the task for another day (`YYYY-MM-DD`); undefined if it does not exist (any more). */
    public setDueDay(id: string, dueDay: string): Promise<SuperProductivityTask | undefined> {
        return this.request<SuperProductivityTask>('PATCH', `/tasks/${encodeURIComponent(id)}`, { dueDay });
    }

    /** The data of the response; undefined for 404. */
    private async request<T>(method: string, path: string, body?: object): Promise<T | undefined> {
        const token = await this.tokens.get();
        if (!token) { throw new SuperProductivityError('no-token'); }

        let response: Response;
        try {
            response = await fetch(this.settings().url + path, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } catch (error) {
            throw new SuperProductivityError('unreachable', error instanceof Error ? error.message : String(error));
        }

        if (response.status === 404) { return undefined; }
        if (response.status === 401 || response.status === 403) { throw new SuperProductivityError('rejected'); }

        // error responses are not always JSON
        const result = await response.json().catch(() => undefined) as ApiResponse<T> | undefined;
        if (!response.ok || !result?.ok) {
            throw new SuperProductivityError('failed', `${response.status} ${result?.error?.message ?? ''}`.trim());
        }
        return result.data;
    }
}
