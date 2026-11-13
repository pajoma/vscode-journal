import * as assert from 'assert';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AddressInfo } from 'net';
import { Container } from '../../app/index';
import { SuperProductivityClient, SuperProductivitySettings, SuperProductivityTask } from '../../features/superproductivity/client';
import { SendTaskCommand } from '../../features/superproductivity/commands/send-task';
import { SyncJournalCommand } from '../../features/superproductivity/commands/sync-journal';
import { SyncTasksCommand } from '../../features/superproductivity/commands/sync-tasks';
import { SuperProductivityFollower } from '../../features/superproductivity/follower';
import { MappingFile } from '../../features/superproductivity/mapping';
import { INBOX_PROJECT } from '../../features/superproductivity/projects';
import { refreshScopeFolders } from '../../features/scopes/scope-folders';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

/** A stand-in for the Local REST API of Super Productivity, with the tasks it holds. */
async function startApi(tasks: Map<string, SuperProductivityTask>): Promise<{ server: http.Server; url: string }> {
    const server = http.createServer((req, res) => {
        const send = (status: number, body: object) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
        let raw = '';
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
            const body = raw ? JSON.parse(raw) : {};
            if (req.url === '/projects') { return send(200, { ok: true, data: [{ id: INBOX_PROJECT, title: 'Inbox' }, { id: 'p-acme', title: 'ACME' }] }); }
            if (req.url?.startsWith('/tasks?')) { return send(200, { ok: true, data: [...tasks.values()] }); }
            if (req.method === 'POST') {
                const task = { id: `id-${tasks.size + 1}`, title: body.title, isDone: false, dueDay: body.dueDay === undefined ? '2026-11-13' : body.dueDay, projectId: body.projectId ?? INBOX_PROJECT, notes: body.notes };
                tasks.set(task.id, task);
                return send(201, { ok: true, data: task });
            }
            const task = tasks.get(req.url!.split('/')[2]);
            if (!task) { return send(404, { ok: false }); }
            if (req.method === 'PATCH') { Object.assign(task, body); }
            return send(200, { ok: true, data: task });
        });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

/** Super Productivity linked by keys (docs/specs/2026-11-13-scopes-keys-plans.md, decisions 20-24). */
suite('Super Productivity', function () {
    this.slow(3000);
    let tmpBase: string;
    let ctrl: Container;
    let tasks: Map<string, SuperProductivityTask>;
    let api: { server: http.Server; url: string };
    let client: SuperProductivityClient;
    let mapping: MappingFile;
    const settings = (): SuperProductivitySettings => ({ enabled: true, url: api.url, projects: {} });

    async function write(file: string, text: string): Promise<vscode.Uri> {
        const uri = vscode.Uri.file(path.join(tmpBase, file));
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text));
        return uri;
    }
    const text = async (uri: vscode.Uri) => (await vscode.workspace.openTextDocument(uri)).getText();

    setup(async () => {
        tmpBase = path.join(os.tmpdir(), `sp-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, 'scopes', 'acme')));
        ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase, templates: [{ name: 'task', template: '- [ ] ${input}', after: '## Tasks' }] }), () => new TestLogger(false));
        await refreshScopeFolders(ctrl);
        tasks = new Map();
        api = await startApi(tasks);
        client = new SuperProductivityClient(settings, { get: async () => 'token', store: async () => undefined });
        mapping = new MappingFile(ctrl.fs, () => ctrl.config.getBasePath());
    });

    teardown(async () => {
        api.server.close();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
    });

    test('a page sync: keys and sends open tasks, turns beta links into keys, imports, keeps the links in the mapping file', async () => {
        await write('2026/11/12.md', '# Thursday\n\n- [ ] #acme:4 older\n');
        tasks.set('beta-1', { id: 'beta-1', title: 'old link', isDone: false });
        tasks.set('planned', { id: 'planned', title: 'from Super Productivity', isDone: false, dueDay: '2026-11-13', projectId: 'p-acme' });
        const entry = await write('2026/11/13.md', '# Friday\n\n## Tasks\n- [ ] call #acme today\n- [ ] call the bank\n- [ ] linked by the beta <!-- sp:beta-1 -->\n');
        const sync = new (SyncTasksCommand as any)(ctrl, client, settings, ctrl.index, mapping) as SyncTasksCommand;

        const counts = await sync.execute(await vscode.workspace.openTextDocument(entry));
        assert.deepStrictEqual([counts?.sent, counts?.converted, counts?.imported], [2, 1, 1]);
        assert.strictEqual(await text(entry), '# Friday\n\n## Tasks\n- [ ] call #acme:5 today\n- [ ] :1 call the bank\n- [ ] :2 linked by the beta\n- [ ] #acme:6 from Super Productivity\n');
        const sent = [...tasks.values()].filter(t => t.id.startsWith('id-'));
        assert.deepStrictEqual(sent.map(t => [t.title, t.dueDay, t.projectId]), [['#acme:5 call today', '2026-11-13', 'p-acme'], [':1 call the bank', '2026-11-13', INBOX_PROJECT]]);
        assert.strictEqual(new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(tmpBase, '.vscode', 'superproductivity.json')))),
            '{\n  ":1": "id-4",\n  ":2": "beta-1",\n  "#acme:5": "id-3",\n  "#acme:6": "planned"\n}\n');
    });

    test('a plan sync sends only the items without sub-items, unplanned, with their place in the plan', async () => {
        const plan = await write('scopes/acme/Plan.md', '# Plan\n\n## Phase 1\n- [ ] interviews\n  - [ ] guide\n- [ ] report\n');
        const sync = new (SyncTasksCommand as any)(ctrl, client, settings, ctrl.index, mapping) as SyncTasksCommand;
        await sync.execute(await vscode.workspace.openTextDocument(plan));
        assert.strictEqual(await text(plan), '# Plan\n\n## Phase 1\n- [ ] interviews\n  - [ ] #acme:1 guide\n- [ ] #acme:2 report\n');
        assert.deepStrictEqual([...tasks.values()].map(t => [t.title, t.dueDay, t.projectId, t.notes]), [
            ['#acme:1 guide', null, 'p-acme', 'acme › Plan › Phase 1 › interviews\n\nPlan.md'],
            ['#acme:2 report', null, 'p-acme', 'acme › Plan › Phase 1\n\nPlan.md'],
        ]);
    });

    test('state: done there is done in the journal, done in the journal is done there; the latest day is planned there', async () => {
        await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tmpBase, '.vscode', 'superproductivity.json')), Buffer.from('{ ":1": "a", ":2": "b", ":3": "c" }'));
        tasks.set('a', { id: 'a', title: ':1 a', isDone: true, doneOn: new Date(2026, 10, 13, 9, 30).getTime() });
        tasks.set('b', { id: 'b', title: ':2 b', isDone: false });
        tasks.set('c', { id: 'c', title: ':3 c', isDone: false, dueDay: '2026-11-12' });
        await write('2026/11/12.md', '# Thursday\n\n- [>] :3 moved on (moved: 2026-11-16)\n');
        await write('2026/11/16.md', '# Monday\n\n- [ ] :3 moved on\n');
        const entry = await write('2026/11/13.md', '# Friday\n\n- [ ] :1 a\n- [x] :2 b\n');

        const counts = await (new (SyncJournalCommand as any)(ctrl, client, settings, ctrl.index, mapping) as SyncJournalCommand).execute();
        assert.deepStrictEqual([counts?.completedInJournal, counts?.completed, counts?.moved], [1, 1, 1]);
        assert.strictEqual(await text(entry), '# Friday\n\n- [x] :1 a (done: 2026-11-13 09:30)\n- [x] :2 b\n');
        assert.deepStrictEqual([tasks.get('b')!.isDone, tasks.get('c')!.dueDay], [true, '2026-11-16']);
    });

    test('the code actions are followed there: complete, reopen, plan for a day; send links a single task', async () => {
        const entry = await write('2026/11/13.md', '# Friday\n\n- [ ] call the bank\n');
        const send = new (SendTaskCommand as any)(ctrl, client, settings, ctrl.index, mapping) as SendTaskCommand;
        assert.strictEqual(await send.execute(entry, 2), ':1');
        assert.strictEqual(await send.execute(entry, 2), undefined, 'linked already');

        const follower = new SuperProductivityFollower(ctrl, client, settings, mapping);
        try {
            await follower.follow({ path: entry.fsPath, keys: [':1'], change: 'done' });
            assert.strictEqual(tasks.get('id-1')!.isDone, true);
            await follower.follow({ path: entry.fsPath, keys: [':1'], change: 'reopened' });
            assert.strictEqual(tasks.get('id-1')!.isDone, false);
            await follower.follow({ path: entry.fsPath, keys: [':1', ':99'], change: { day: '2026-11-16' } });
            assert.strictEqual(tasks.get('id-1')!.dueDay, '2026-11-16');
        } finally {
            follower.dispose();
        }
    });
});
