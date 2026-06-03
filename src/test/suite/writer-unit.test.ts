'use strict';

import * as assert from 'assert';
import { Writer } from '../../features/entries/writer';
import { TestLogger } from '../test-logger';
import { IConfiguration, HeaderTemplate, ScopedTemplate } from '../../shared/model/index';

suite('writer-unit — Writer content builder', () => {

    function makeWriter(entryValue: string, weeklyValue: string): Writer {
        const stubConfig: Partial<IConfiguration> = {
            getEntryTemplate: async (_date: Date) => ({ value: entryValue } as HeaderTemplate),
            getWeeklyTemplate: async (_week: Number) => ({ value: weeklyValue } as ScopedTemplate),
        };
        return new Writer(stubConfig as IConfiguration, new TestLogger(false));
    }

    test('buildEntryContent renders the configured entry template', async () => {
        const writer = makeWriter('# 2026-06-03\n\n', '');
        const content = await writer.buildEntryContent(new Date());
        assert.strictEqual(content, '# 2026-06-03\n\n');
    });

    test('buildWeeklyContent renders the configured weekly template', async () => {
        const writer = makeWriter('', '# Week 23\n\n## Tasks\n');
        const content = await writer.buildWeeklyContent(23);
        assert.strictEqual(content, '# Week 23\n\n## Tasks\n');
    });

    test('build*Content falls back to empty string when the template value is undefined', async () => {
        const stubConfig: Partial<IConfiguration> = {
            getEntryTemplate: async () => ({} as HeaderTemplate),
            getWeeklyTemplate: async () => ({} as ScopedTemplate),
        };
        const writer = new Writer(stubConfig as IConfiguration, new TestLogger(false));
        assert.strictEqual(await writer.buildEntryContent(new Date()), '');
        assert.strictEqual(await writer.buildWeeklyContent(1), '');
    });
});
