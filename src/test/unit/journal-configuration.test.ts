import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { HostEnvironment, JournalConfiguration, SettingsWithDefaults } from 'journal-core';

const WORKSPACE = path.resolve(os.tmpdir(), 'journal-workspace');
const HOST: HostEnvironment = { language: 'en', workspaceRoot: () => WORKSPACE };
const DATE = new Date(2026, 9, 9);

function config(settings: Record<string, unknown>): JournalConfiguration {
    return new JournalConfiguration(new SettingsWithDefaults(settings), HOST);
}

/** Rules that changed when the extension and the MCP server got one configuration (#250). */
suite('JournalConfiguration (journal-core)', () => {

    test('a leading "~" in journal.base is the home directory', () => {
        assert.strictEqual(config({ base: '~/journal' }).getBasePath(), path.join(os.homedir(), 'journal'));
    });

    test('a relative journal.base and a relative scope base are relative to the workspace', () => {
        const c = config({ base: 'journal', scopes: [{ name: 'work', base: 'clients/work' }] });
        assert.strictEqual(c.getBasePath(), path.join(WORKSPACE, 'journal'), 'journal.base');
        assert.strictEqual(c.getBasePath('work'), path.join(WORKSPACE, 'clients', 'work'), 'scope base');
    });

    test('${homeDir} is resolved in entry paths', () => {
        const c = config({ base: WORKSPACE, patterns: { entries: { path: '${homeDir}/journal/${year}', file: '${day}.${ext}' } } });
        assert.strictEqual(c.getResolvedEntryPath(DATE).value, path.join(os.homedir(), 'journal', '2026'));
    });

    test('a variable that occurs twice is replaced everywhere', () => {
        const c = config({ base: WORKSPACE, patterns: { notes: { path: '${base}', file: '${input}-${input}.${ext}' } } });
        assert.strictEqual(c.getNotesFilePattern(DATE, 'a').value, 'a-a.md');
    });

    test('the legacy journal.tpl-<name>-after setting places a legacy template', () => {
        // the user replaced journal.templates without a memo entry, so journal.tpl-memo applies
        const memo = config({ templates: [], 'tpl-memo': '- M: ${input}', 'tpl-memo-after': '## Memos' }).getMemoInlineTemplate();
        assert.deepStrictEqual([memo.template, memo.after], ['- M: ${input}', '## Memos']);
    });
});
