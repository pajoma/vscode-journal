import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Parser } from '../../features/smart-input/parser';
import { Configuration } from '../../shared/config/configuration';
import { NoteInput } from '../../shared/model/index';
import { normalizeFilename } from '../../shared/strings/strings';
import { resolveDate } from '../../shared/templates/template-engine';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { TestLogger } from '../test-logger';

interface Case { name: string; settings: Record<string, unknown>; expected: string; }

interface Fixtures {
    date: string;
    entries: Case[];
    weeks: (Case & { week: number })[];
    notes: (Case & { scope: string; title: string; folders?: string[] })[];
    filenames: [string, string][];
    templates: { template: string; locale: string; expected: string }[];
}

const ROOT = path.resolve(__dirname, '../../..');
const FIXTURES: Fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/test/fixtures/journal-format.json'), 'utf8'));
const [YEAR, MONTH, DAY] = FIXTURES.date.split('-').map(Number);
const DATE = new Date(YEAR, MONTH - 1, DAY);

/** The defaults of package.json, as VS Code returns them for settings the user did not set. */
function manifestDefaults(): Record<string, unknown> {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const defaults: Record<string, unknown> = {};
    for (const section of [pkg.contributes.configuration].flat()) {
        for (const [key, schema] of Object.entries<{ default?: unknown }>(section.properties)) {
            if (key.startsWith('journal.')) { defaults[key.slice('journal.'.length)] = schema.default; }
        }
    }
    return defaults;
}

function configuration(settings: Record<string, unknown>, folders: string[] = []): { config: Configuration; base: string } {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-format-'));
    const config = new Configuration(new FakeWorkspaceConfig({ ...manifestDefaults(), ...settings, base }));
    config.setScopeFolders(folders);
    return { config, base };
}

const relative = (base: string, file: string) => path.relative(base, file).split(path.sep).join('/');

/** The same cases run in the MCP server's contract test, so both write the same files (#250). */
suite('Journal format shared with the MCP server (#250)', () => {

    for (const c of FIXTURES.entries) {
        test(`entry path: ${c.name}`, async () => {
            const { config, base } = configuration(c.settings);
            const [dir, file] = await Promise.all([config.getResolvedEntryPath(DATE), config.getEntryFilePattern(DATE)]);
            assert.strictEqual(relative(base, path.join(dir.value!, file.value!)), c.expected);
        });
    }

    for (const c of FIXTURES.weeks) {
        test(`week path: ${c.name}`, async () => {
            const { config, base } = configuration(c.settings);
            const [dir, file] = await Promise.all([config.getWeekPathPattern(c.week), config.getWeekFilePattern(c.week)]);
            assert.strictEqual(relative(base, path.join(dir.value!, file.value!)), c.expected);
        });
    }

    for (const c of FIXTURES.notes) {
        test(`note path: ${c.name}`, async () => {
            const { config, base } = configuration(c.settings, c.folders);
            const input = new NoteInput();
            input.text = `#${c.scope} ${c.title}`;
            input.date = DATE;
            const file = await new Parser(config, new TestLogger(false)).resolveNotePathForInput(input);
            assert.strictEqual(input.scope, c.scope, 'scope detected');
            assert.strictEqual(relative(base, file), c.expected);
        });
    }

    test('file names', () => {
        for (const [input, expected] of FIXTURES.filenames) {
            assert.strictEqual(normalizeFilename(input), expected, input);
        }
    });

    test('template variables', () => {
        for (const c of FIXTURES.templates) {
            assert.strictEqual(resolveDate(c.template, DATE, c.locale), c.expected, `${c.template} (${c.locale})`);
        }
    });
});
