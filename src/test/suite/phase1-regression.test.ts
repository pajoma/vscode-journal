import * as assert from 'assert';
import * as vscode from 'vscode';
import { Logger } from '../../util';
import { Container } from '../../app';
import { Configuration } from '../../vscode';
import { MatchInput } from '../../journal/match-input';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

suite('Phase 1 — Regression Tests', () => {

    // ── 1.1  Weekly template name mismatch (#167) ─────────────────────────
    test('#167 — getWeeklyTemplate resolves the "weekly" template from config', async () => {
        const conf = new Configuration(new FakeWorkspaceConfig({}));

        // The default template in package.json is named "weekly"
        const tpl = await conf.getWeeklyTemplate(7);
        assert.ok(tpl, "getWeeklyTemplate returned falsy");
        assert.ok(tpl.value, "Template value is empty");
        assert.ok(tpl.value!.includes("7"), `Expected week number 7 in template value, got: ${tpl.value}`);
    });

    // ── 1.2  MatchInput stale today (#170) ────────────────────────────────
    suite('#170 — MatchInput date freshness & validation', () => {
        let logger: Logger;
        let locale: string;

        setup(() => {
            logger = new TestLogger(false);
            locale = 'en';
        });

        test('parseInput refreshes today on every call', async () => {
            const matcher = new MatchInput(logger, locale);

            // Artificially stale the date
            matcher.today = new Date(2000, 0, 1);

            await matcher.parseInput("+0");

            // After parseInput, today should be refreshed to the real current date
            const now = new Date();
            assert.strictEqual(matcher.today.getFullYear(), now.getFullYear(),
                "today was not refreshed to the current year");
            assert.strictEqual(matcher.today.getMonth(), now.getMonth(),
                "today was not refreshed to the current month");
            assert.strictEqual(matcher.today.getDate(), now.getDate(),
                "today was not refreshed to the current day");
        });

        test('resolveISOString rejects month 13 (0-indexed 12)', async () => {
            const matcher = new MatchInput(logger, locale);
            await assert.rejects(
                () => matcher.parseInput("13-01"),
                /Invalid value for month/,
                "Should reject month 13"
            );
        });

        test('resolveISOString rejects day 0', async () => {
            const matcher = new MatchInput(logger, locale);
            await assert.rejects(
                () => matcher.parseInput("01-00"),
                /Invalid value for day/,
                "Should reject day 0"
            );
        });

        test('resolveISOString accepts month 12 (0-indexed 11)', async () => {
            const matcher = new MatchInput(logger, locale);
            // month 12, day 15 → should NOT throw
            const input = await matcher.parseInput("12-15");
            assert.ok(input.hasOffset(), "Should parse valid month-day input");
        });

        test('resolveISOString computes correct offset for a known date', async () => {
            const matcher = new MatchInput(logger, locale);
            // Use a fixed past date to avoid midnight-boundary flakiness
            const input = await matcher.parseInput("2020-06-15");
            assert.ok(input.offset < 0, `Offset for 2020-06-15 should be negative, got ${input.offset}`);
        });

        test('shortcut "tomorrow" yields offset +1', async () => {
            const matcher = new MatchInput(logger, locale);
            const input = await matcher.parseInput("tomorrow");
            assert.strictEqual(input.offset, 1);
        });

        test('shortcut "yesterday" yields offset -1', async () => {
            const matcher = new MatchInput(logger, locale);
            const input = await matcher.parseInput("yesterday");
            assert.strictEqual(input.offset, -1);
        });
    });

    // ── 1.3  Remote workspace support (#94) ───────────────────────────────
    suite('#94 — vscode.workspace.fs file creation', () => {
        test('createSaveLoadTextDocument writes and opens a file via vscode.workspace.fs', async () => {
            const ctrl = new Container(new FakeWorkspaceConfig({}), () => new TestLogger(false));

            const tmpDir = require('os').tmpdir();
            const testPath = require('path').join(tmpDir, `journal-test-${Date.now()}.md`);

            const doc = await ctrl.writer.createSaveLoadTextDocument(testPath, "# Test\n");
            assert.ok(doc, "createSaveLoadTextDocument returned falsy");
            assert.strictEqual(doc.uri.fsPath, testPath, "Document path mismatch");
            assert.ok(doc.getText().includes("# Test"), "File content mismatch");

            // Clean up
            try { await vscode.workspace.fs.delete(vscode.Uri.file(testPath)); } catch { /* ignore */ }
        });

        test('extensionKind is set to workspace in package.json', () => {
            const ext = vscode.extensions.getExtension("pajoma.vscode-journal");
            // In test environment the extension may not be published, so check package.json directly
            if (ext) {
                const pkg = ext.packageJSON;
                assert.ok(
                    Array.isArray(pkg.extensionKind) && pkg.extensionKind.includes("workspace"),
                    "extensionKind should include 'workspace'"
                );
            } else {
                // Fallback: read raw package.json
                const fs = require('fs');
                const path = require('path');
                const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                assert.ok(
                    Array.isArray(pkg.extensionKind) && pkg.extensionKind.includes("workspace"),
                    "extensionKind should include 'workspace'"
                );
            }
        });
    });
});
