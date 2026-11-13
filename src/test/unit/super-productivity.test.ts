import * as assert from 'assert';
import * as http from 'http';
import { AddressInfo } from 'net';
import { SuperProductivityClient, SuperProductivityError, SuperProductivityTask, TokenStore } from '../../features/superproductivity/client';
import { TaskMapping } from '../../features/superproductivity/mapping';
import { breadcrumb, INBOX_PROJECT, newTask, ProjectMap, projectMoves, taskScope } from '../../features/superproductivity/projects';
import { betaLinks, changedAfterCompletion, linkedTasks, planSync, tasksToImport, tasksToSend, taskText, withoutBetaLink } from '../../features/superproductivity/sync';

const TOKEN = 'valid-token';

/** Stand-in for the Local REST API of Super Productivity. */
function startApi(tasks: Map<string, SuperProductivityTask>): Promise<http.Server> {
    const server = http.createServer((req, res) => {
        const send = (status: number, body: object) => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(body));
        };
        if (req.headers.authorization !== `Bearer ${TOKEN}`) { return send(401, { ok: false }); }

        let raw = '';
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
            const body = raw ? JSON.parse(raw) : {};
            if (req.method === 'GET' && req.url === '/projects') {
                return send(200, { ok: true, data: [{ id: INBOX_PROJECT, title: 'Inbox' }, { id: 'p-acme', title: 'ACME' }] });
            }
            if (req.method === 'GET' && req.url === '/tasks?includeDone=true&source=all') {
                return send(200, { ok: true, data: [...tasks.values()] });
            }
            if (req.method === 'POST' && req.url === '/tasks') {
                // the journal's text is the title as it is, never short syntax
                if (body.isIgnoreShortSyntax !== true) { return send(400, { ok: false }); }
                const created = { id: `id-${tasks.size + 1}`, title: body.title, isDone: false, dueDay: body.dueDay === undefined ? '2026-11-13' : body.dueDay, projectId: body.projectId ?? INBOX_PROJECT, notes: body.notes };
                tasks.set(created.id, created);
                return send(201, { ok: true, data: created });
            }
            const task = tasks.get(req.url!.split('/')[2]);
            if (!task) { return send(404, { ok: false, error: { code: 'TASK_NOT_FOUND', message: 'Task not found' } }); }
            if (req.method === 'PATCH') { Object.assign(task, body); }
            return send(200, { ok: true, data: task });
        });
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function tokens(token?: string): TokenStore {
    return { get: async () => token, store: async value => { token = value; } };
}

const at = (hour: number, minute: number) => new Date(2026, 10, 12, hour, minute).getTime();
const task = (id: string, isDone: boolean, more: Partial<SuperProductivityTask> = {}): SuperProductivityTask => ({ id, title: id, isDone, ...more });

suite('Super Productivity', () => {
    const scopeName = (name: string) => ['acme', 'web'].find(scope => scope === name.toLowerCase());
    const mapping = TaskMapping.parse(JSON.stringify({ '#acme:1': 'a', '#acme:2': 'b', '#ACME:3': 'c', ':4': 'd', ':5': 'e', ':6': 'f', ':7': 'g', ':8': 'h', '#acme:9': 'i' }));

    suite('mapping', () => {
        test('keys, case ignored; written sorted, one entry per line', () => {
            assert.strictEqual(mapping.get('#Acme:3'), 'c');
            assert.strictEqual(mapping.get('#acme:99'), undefined);
            const m = TaskMapping.parse('{ ":2": "y", "#acme:10": "x", "#acme:2": "w", "bad": 3 }');
            m.set('#Web:1', 'z');
            assert.strictEqual(m.toString(), '{\n  ":2": "y",\n  "#acme:2": "w",\n  "#acme:10": "x",\n  "#web:1": "z"\n}\n');
            assert.deepStrictEqual([...m.taskIds()].sort(), ['w', 'x', 'y', 'z']);
        });

        test('an unreadable file is an empty mapping', () => {
            assert.strictEqual(TaskMapping.parse('not json').size, 0);
            assert.strictEqual(TaskMapping.parse('[1]').size, 0);
        });
    });

    suite('sync', () => {
        const LINES = [
            '## Tasks',
            '- [ ] #acme:1 open, done there',
            '- [x] #acme:2 done, reopened there (done: 2026-11-12 12:12)',
            '- [x] #acme:3 done, open and untouched there (done: 2026-11-12 12:12)',
            '- [X] :4 done by hand, open there',
            '- [ ] :5 open on both sides, planned later in the journal',
            '- [x] :6 done on both sides (done: 2026-11-12 12:12)',
            '- [ ] :7 deleted there',
            '- [>] :8 moved (moved: 2026-11-13)',
            '- [/] #acme:9 in progress, done there',
            '- [ ] :10 not linked',
            '- [ ] not keyed',
        ];
        const TASKS = new Map<string, SuperProductivityTask | undefined>([
            ['a', task('a', true, { doneOn: at(9, 30) })],
            ['b', task('b', false, { modified: at(12, 13) })],
            ['c', task('c', false, { modified: at(12, 11) })],
            ['d', task('d', false, { modified: at(15, 0) })],
            ['e', task('e', false, { dueDay: '2026-11-12' })],
            ['f', task('f', true)],
            ['g', undefined],
            ['h', task('h', false)],
            ['i', task('i', true, { doneOn: at(10, 0) })],
        ]);

        test('finds the linked tasks by their key; moved ones are left to their copy', () => {
            assert.deepStrictEqual(linkedTasks(LINES, mapping, scopeName).map(t => `${t.key}=${t.id}:${t.isDone}`),
                ['#acme:1=a:false', '#acme:2=b:true', '#acme:3=c:true', ':4=d:true', ':5=e:false', ':6=f:true', ':7=g:false', '#acme:9=i:false']);
        });

        test('completes in the journal what was completed there, also a plan item in progress', () => {
            const plan = planSync(LINES, TASKS, mapping, scopeName);
            assert.deepStrictEqual(plan.edits.filter(e => e.line === 1 || e.line === 9), [
                { line: 1, text: '- [x] #acme:1 open, done there (done: 2026-11-12 09:30)' },
                { line: 9, text: '- [x] #acme:9 in progress, done there (done: 2026-11-12 10:00)' },
            ]);
            assert.strictEqual(plan.completedInJournal, 2);
        });

        test('reopens in the journal what was reopened there after its completion', () => {
            const plan = planSync(LINES, TASKS, mapping, scopeName);
            assert.deepStrictEqual(plan.edits.find(e => e.line === 2), { line: 2, text: '- [ ] #acme:2 done, reopened there' });
            assert.strictEqual(plan.reopenedInJournal, 1);
            assert.deepStrictEqual(planSync(['- [x] #acme:2 plan item (done: 2026-11-12 12:12) [[2026-11-12]]'], TASKS, mapping, scopeName).edits,
                [{ line: 0, text: '- [ ] #acme:2 plan item' }], 'with the link to the day of a plan item');
        });

        test('completes there what was completed in the journal later or without a time; counts the missing', () => {
            const plan = planSync(LINES, TASKS, mapping, scopeName);
            assert.deepStrictEqual(plan.complete, ['c', 'd']);
            assert.strictEqual(plan.missing, 1);
        });

        test('plans open tasks there for their latest day in the journal, never earlier', () => {
            const planned = new Map([[':5', '2026-11-16'], ['#acme:1', '2026-11-20']]);
            assert.deepStrictEqual(planSync(LINES, TASKS, mapping, scopeName, planned).reschedule, [{ id: 'e', day: '2026-11-16' }]);
            assert.deepStrictEqual(planSync(LINES, TASKS, mapping, scopeName, new Map([[':5', '2026-11-10']])).reschedule, []);
        });

        test('compares the last change with the completion time of the line', () => {
            const line = '- [x] :1 some text (done: 2026-11-12 12:12)';
            assert.strictEqual(changedAfterCompletion(task('x', false, { modified: at(12, 13) }), line), true);
            assert.strictEqual(changedAfterCompletion(task('x', false, { modified: at(12, 11) }), line), false);
            assert.strictEqual(changedAfterCompletion(task('x', false), line), false);
            assert.strictEqual(changedAfterCompletion(task('x', false, { modified: at(12, 13) }), '- [x] :1 some text'), false);
        });

        test('sends the open tasks that are not linked; from a plan only the items without sub-items', () => {
            assert.deepStrictEqual(tasksToSend(LINES, mapping, scopeName, false), [10, 11]);
            const plan = ['- [ ] interviews', '  - [ ] guide', '  - [x] invite', '- [/] report', '- [ ] #acme:1 linked'];
            assert.deepStrictEqual(tasksToSend(plan, mapping, scopeName, true), [1, 3]);
            assert.deepStrictEqual(tasksToSend(plan, mapping, scopeName, false), [0, 1, 3]);
        });

        test('imports the tasks planned for the day that are linked nowhere', () => {
            const tasks = [
                task('planned', false, { dueDay: '2026-11-13' }),
                task('done that day', true, { dueDay: '2026-11-13' }),
                task('overdue', false, { dueDay: '2026-11-10' }),
                task('later', false, { dueDay: '2026-11-14' }),
                task('unplanned', false),
                task('linked', false, { dueDay: '2026-11-13' }),
                task('sub-task', false, { dueDay: '2026-11-13', parentId: 'planned' }),
            ];
            const imported = (day: string) => tasksToImport(tasks, day, '2026-11-13', new Set(['linked'])).map(t => t.id);
            assert.deepStrictEqual(imported('2026-11-13'), ['planned', 'done that day', 'overdue']);
            assert.deepStrictEqual(imported('2026-11-14'), ['later']);
        });

        test('the text of a task, without checkbox and the fixed parts of the template', () => {
            assert.strictEqual(taskText('- [ ] November 12, 2026 - Task: write notes', '- [] ${d:LL} - Task: ${input}'), 'write notes');
            assert.strictEqual(taskText('  - [ ] #acme:3 write notes', '- [ ] ${input}'), '#acme:3 write notes');
        });

        test('finds and removes the links of the beta', () => {
            const lines = ['- [ ] call <!-- sp:XTE9v9X8NR5m -->', 'see <!-- sp:x --> outside a task', '- [ ] plain'];
            assert.deepStrictEqual(betaLinks(lines), [{ line: 0, id: 'XTE9v9X8NR5m' }]);
            assert.strictEqual(withoutBetaLink(lines[0]), '- [ ] call');
        });
    });

    suite('projects', () => {
        const PROJECTS = new ProjectMap([
            { id: INBOX_PROJECT, title: 'Inbox' },
            { id: 'p-acme', title: 'ACME' },
            { id: 'p-web', title: 'Website Relaunch' },
        ], { web: 'Website Relaunch', gone: 'No such project' });

        test('the project of a scope: by its title, case ignored, or by the setting', () => {
            assert.strictEqual(PROJECTS.project('acme')?.id, 'p-acme');
            assert.strictEqual(PROJECTS.project('web')?.id, 'p-web');
            assert.strictEqual(PROJECTS.project('gone'), undefined);
            assert.strictEqual(PROJECTS.scope('p-web', ['acme', 'web']), 'web');
            assert.strictEqual(PROJECTS.scope(INBOX_PROJECT, ['acme', 'web']), undefined);
        });

        const LINES = [
            '# Plan',
            '## Phase 1: Discovery',
            '- [ ] #acme:1 interviews',
            '  - [ ] guide',
            '    - [ ] ask #web about it',
            '## Phase 2',
            '- [ ] call the bank #urgent',
        ];

        test('the scope of a task: its own, else of its parent task, else of the page', () => {
            assert.strictEqual(taskScope(LINES, 3, scopeName), 'acme');
            assert.strictEqual(taskScope(LINES, 4, scopeName), 'web');
            assert.strictEqual(taskScope(LINES, 6, scopeName), undefined, 'a tag that names no scope');
            assert.strictEqual(taskScope(LINES, 6, scopeName, 'acme'), 'acme');
        });

        test('the place of a plan item: scope, headings, parent tasks', () => {
            assert.strictEqual(breadcrumb(LINES, 3, 'acme', scopeName), 'acme › Plan › Phase 1: Discovery › interviews');
            assert.strictEqual(breadcrumb(LINES, 6, 'acme', scopeName), 'acme › Plan › Phase 2');
        });

        test('a new task: the key first in the title, the project of its scope, its place in a plan', () => {
            assert.deepStrictEqual(newTask(LINES, 3, { scope: 'acme', number: 7 }, 'guide #acme:7', { scope: 'acme', file: 'Plan.md' }, PROJECTS, scopeName), {
                title: '#acme:7 guide',
                where: { dueDay: null, projectId: 'p-acme', notes: 'acme › Plan › Phase 1: Discovery › interviews\n\nPlan.md' },
            });
            assert.deepStrictEqual(newTask(['- [ ] :3 call the bank'], 0, { number: 3 }, ':3 call the bank', { day: '2026-11-13', file: '13.md' }, PROJECTS, scopeName), {
                title: ':3 call the bank',
                where: { dueDay: '2026-11-13' },
            });
        });

        test('moves linked tasks from the inbox to the project of their scope, no others', () => {
            const lines = ['- [ ] #acme:1 a', '- [ ] #acme:2 b', '- [x] #acme:3 c', '- [ ] :4 d'];
            const tasks = new Map([
                ['a', task('a', false, { projectId: INBOX_PROJECT })],
                ['b', task('b', false, { projectId: 'p-other' })],
                ['c', task('c', false, { projectId: INBOX_PROJECT })],
                ['d', task('d', false, { projectId: INBOX_PROJECT })],
            ]);
            assert.deepStrictEqual(projectMoves(lines, tasks, mapping, PROJECTS, scopeName), [{ id: 'a', projectId: 'p-acme' }]);
        });
    });

    suite('client', () => {
        const stored = new Map<string, SuperProductivityTask>();
        let server: http.Server;
        let url: string;
        const client = (token?: string, address = url) => new SuperProductivityClient(() => ({ enabled: true, url: address, projects: {} }), tokens(token));
        const failsWith = (reason: string) => (error: unknown) => error instanceof SuperProductivityError && error.reason === reason;

        suiteSetup(async () => {
            server = await startApi(stored);
            url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        });

        suiteTeardown(() => { server.close(); });

        test('creates a task, completes and reopens it', async () => {
            const sp = client(TOKEN);
            const created = await sp.createTask('some text');
            assert.deepStrictEqual([created.title, created.isDone], ['some text', false]);

            assert.strictEqual((await sp.setTaskState(created.id, true))?.isDone, true);
            assert.strictEqual((await sp.getTask(created.id))?.isDone, true);
            assert.strictEqual((await sp.setTaskState(created.id, false))?.isDone, false);
        });

        test('creates a task for a day, lists it and plans it for another day', async () => {
            const sp = client(TOKEN);
            const created = await sp.createTask('#not a tag', { dueDay: '2026-11-12' });
            assert.deepStrictEqual([created.title, created.dueDay], ['#not a tag', '2026-11-12']);
            assert.strictEqual((await sp.setDueDay(created.id, '2026-11-16'))?.dueDay, '2026-11-16');
            assert.ok((await sp.listTasks()).some(t => t.id === created.id && t.dueDay === '2026-11-16'));
        });

        test('lists the projects, creates a task in one, unplanned, and moves it', async () => {
            const sp = client(TOKEN);
            assert.deepStrictEqual((await sp.listProjects()).map(p => p.id), [INBOX_PROJECT, 'p-acme']);
            const created = await sp.createTask('milestone', { dueDay: null, projectId: 'p-acme', notes: 'acme › Phase 1' });
            assert.deepStrictEqual([created.dueDay, created.projectId, created.notes], [null, 'p-acme', 'acme › Phase 1']);
            assert.strictEqual((await sp.setProject(created.id, INBOX_PROJECT))?.projectId, INBOX_PROJECT);
        });

        test('returns undefined for an unknown task', async () => {
            assert.strictEqual(await client(TOKEN).getTask('unknown'), undefined);
        });

        test('fails without a token', async () => {
            await assert.rejects(client().getTask('unknown'), failsWith('no-token'));
        });

        test('fails when the token is rejected', async () => {
            await assert.rejects(client('wrong-token').getTask('unknown'), failsWith('rejected'));
        });

        test('fails when Super Productivity is not running', async () => {
            await assert.rejects(client(TOKEN, 'http://127.0.0.1:1').getTask('unknown'), failsWith('unreachable'));
        });
    });
});
