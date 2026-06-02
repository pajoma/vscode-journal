import * as assert from 'assert';
import moment = require('moment');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { Container } from '../../app';
import { TestLogger } from '../test-logger';
import { suite, before, test } from 'mocha';
import { FakeWorkspaceConfig } from '../fake-workspace-config';


suite('Open Week Entries', () => {
	vscode.window.showInformationMessage('Start all tests.');
	let ctrl: Container;

	before(() => {
		ctrl = new Container(new FakeWorkspaceConfig({}), () => new TestLogger(false));
	});

	test("Input 'w13'", async () => {

		let input = await ctrl.parser.parseInput("w13");

		assert.ok(!input.hasOffset(), "Offset is set, is " + input.offset);
		assert.ok(!input.hasFlags(), "Input has flags " + JSON.stringify(input));
		assert.ok(!input.hasTask(), "Input has task flag " + JSON.stringify(input));
		assert.ok(!input.hasText(), "Input has no text " + JSON.stringify(input));
		assert.ok(input.hasWeek(), "Input has no week definition " + JSON.stringify(input));
	});


	test("Input 'w'", async () => {
		let ctrl = new Container(new FakeWorkspaceConfig({}), () => new TestLogger(false));

		let input = await ctrl.parser.parseInput("w");

		assert.ok(!input.hasOffset(), "Offset is set, is " + input.offset);
		assert.ok(!input.hasFlags(), "Input has flags " + JSON.stringify(input));
		assert.ok(!input.hasTask(), "Input has task flag " + JSON.stringify(input));
		assert.ok(!input.hasText(), "Input has no text " + JSON.stringify(input));
		assert.ok(input.hasWeek(), "Input has no week definition " + JSON.stringify(input));
		assert.ok(input.week >= 1 && input.week <= 53, `week out of valid range: ${input.week}`);
	});

	test("Input 'next week'", async () => {
		let ctrl = new Container(new FakeWorkspaceConfig({}), () => new TestLogger(false));

		const thisWeekInput = await ctrl.parser.parseInput("w");
		const nextWeekInput = await ctrl.parser.parseInput("next week");

		assert.ok(!nextWeekInput.hasOffset(), "Offset is set, is " + nextWeekInput.offset);
		assert.ok(!nextWeekInput.hasFlags(), "Input has flags " + JSON.stringify(nextWeekInput));
		assert.ok(!nextWeekInput.hasTask(), "Input has task flag " + JSON.stringify(nextWeekInput));
		assert.ok(!nextWeekInput.hasText(), "Input has no text " + JSON.stringify(nextWeekInput));
		assert.ok(nextWeekInput.hasWeek(), "Input has no week definition " + JSON.stringify(nextWeekInput));

		// Use relative comparison to avoid year-rollover flakiness (week 52 → week 1)
		const expectedNext = thisWeekInput.week === 52 ? 1 : thisWeekInput.week + 1;
		assert.strictEqual(nextWeekInput.week, expectedNext, `next week should be ${expectedNext}, got ${nextWeekInput.week}`);
	});

});
