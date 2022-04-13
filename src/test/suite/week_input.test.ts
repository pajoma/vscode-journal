import * as assert from 'assert';
import moment = require('moment');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as J from '../..';
import { TestLogger } from '../TestLogger';
import {suite, before,test} from 'mocha';


suite.skip('Open Week Entries', () => {
	vscode.window.showInformationMessage('Start all tests.');
	let ctrl: J.Util.Ctrl; 

	before(() => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);

	}); 

	test("Input 'w13'", async () => {

		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("w13");

		assert.ok(! input.hasOffset(), "Offset is set, is " + input.offset);
		assert.ok(! input.hasFlags(), "Input has flags " + JSON.stringify(input));
		assert.ok(! input.hasTask(), "Input has task flag " + JSON.stringify(input));
		assert.ok(! input.hasText(), "Input has no text " + JSON.stringify(input));
		assert.ok(input.hasWeek(), "Input has no week definition " + JSON.stringify(input));
	});


	test("Input 'w'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);

		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("w");
		let currentWeek = moment().week();

		assert.ok(!input.hasOffset(), "Offset is set, is " + input.offset);
		assert.ok(!input.hasFlags(), "Input has flags " + JSON.stringify(input));
		assert.ok(!input.hasTask(), "Input has task flag " + JSON.stringify(input));
		assert.ok(!input.hasText(), "Input has no text " + JSON.stringify(input));
		assert.ok(input.hasWeek(), "Input has no week definition " + JSON.stringify(input));

		assert.strictEqual(input.week, currentWeek, "weeks mismatch");
	});

	test("Input 'next week'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);

		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("next week");

		let currentWeek = moment().week();

		assert.ok(!input.hasOffset(), "Offset is set, is " + input.offset);
		assert.ok(!input.hasFlags(), "Input has flags " + JSON.stringify(input));
		assert.ok(!input.hasTask(), "Input has task flag " + JSON.stringify(input));
		assert.ok(!input.hasText(), "Input has no text " + JSON.stringify(input));
		assert.ok(input.hasWeek(), "Input has no week definition " + JSON.stringify(input));

		assert.strictEqual(input.week, currentWeek + 1, "weeks mismatch");
	});

});
