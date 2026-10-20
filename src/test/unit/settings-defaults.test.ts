import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { SETTINGS_DEFAULTS } from 'journal-core';

const ROOT = path.resolve(__dirname, '../../..');

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

/** journal-core applies these defaults outside VS Code (MCP server), so they must be the manifest's (#250). */
suite('journal-core settings defaults', () => {
    test('equal the defaults declared in package.json', () => {
        const manifest = manifestDefaults();
        for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
            assert.ok(key in manifest, `journal.${key} is not declared in package.json`);
            assert.deepStrictEqual(value, manifest[key], `journal.${key}`);
        }
    });
});
