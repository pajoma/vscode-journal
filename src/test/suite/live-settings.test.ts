import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container, LiveWorkspaceConfig } from '../../app/index';
import { TestLogger } from '../test-logger';

/** #253: settings changes apply without reloading the window. */
suite('Live settings', () => {
    const wsConfig = () => vscode.workspace.getConfiguration('journal');
    let originalBase: string | undefined;

    suiteSetup(() => { originalBase = wsConfig().get<string>('base'); });
    suiteTeardown(async () => { await wsConfig().update('base', originalBase, vscode.ConfigurationTarget.Workspace); });

    test('a container sees changed settings', async () => {
        const ctrl = new Container(new LiveWorkspaceConfig(), () => new TestLogger(false));
        const first = path.join(os.tmpdir(), 'live-settings-a');
        const second = path.join(os.tmpdir(), 'live-settings-b');

        await wsConfig().update('base', first, vscode.ConfigurationTarget.Workspace);
        assert.strictEqual(ctrl.config.getBasePath(), path.normalize(first));

        await wsConfig().update('base', second, vscode.ConfigurationTarget.Workspace);
        assert.strictEqual(ctrl.config.getBasePath(), path.normalize(second));
    });

    test('the activated extension sees changed settings', async () => {
        const extension = vscode.extensions.getExtension('pajoma.vscode-journal');
        assert.ok(extension, 'extension not found');
        const api = await extension!.activate();

        const changed = path.join(os.tmpdir(), `live-settings-${Date.now()}`);
        await wsConfig().update('base', changed, vscode.ConfigurationTarget.Workspace);
        assert.strictEqual(api.getJournalConfiguration().getBasePath(), path.normalize(changed));
    });
});
