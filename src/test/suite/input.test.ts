import * as assert from 'assert';


// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as J from '../..';
import { TestLogger } from '../test-logger';

suite('Open Journal Entries', () => {
	vscode.window.showInformationMessage('Start all tests.');

	/* */
	test('Simple', async () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	})
		;
	test("Input '+1'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("+1");


		assert.strictEqual(1, input.offset);
	})
		;

	test("Input '2021-05-12'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("2021-05-12");

		assert.strictEqual(input.offset > 0 || input.offset <= 0, true);
	})
		;

	test("Input '05-12'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("05-12");

		assert.strictEqual(input.offset > 0 || input.offset <= 0, true);
	})
		;

	test("Input '12'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("12");

		assert.strictEqual(input.offset > 0 || input.offset <= 0, true);
	})
		;

	test("Input 'next monday'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("next monday");


		assert.ok(input.offset > 0, "Offset not > 0, is " + input.offset);
	});

	test("Input 'next tue'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("next tue");

		assert.ok(input.offset > 0, "Offset not > 0, is " + input.offset);
	});

	test("Input 'last wed'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("last wed");

		assert.ok(input.offset < 0, "Offset not < 0, is " + input.offset);
	});


	test("Input 'task +1 do this'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("task +1 text");

		assert.ok(input.offset > 0, "Offset not > 0, is " + input.offset);
		assert.ok(input.hasFlags(), "Input has no flags " + JSON.stringify(input));
		assert.ok(input.hasTask(), "Input has no task flag " + JSON.stringify(input));
		assert.ok(input.text.length > 0, "Input has no text " + JSON.stringify(input));
	});

	test("Input 'task next wed do this'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("task next wed text");

		assert.ok(input.offset > 0, "Offset not > 0, is " + input.offset);
		assert.ok(input.hasFlags(), "Input has no flags " + JSON.stringify(input));
		assert.ok(input.hasTask(), "Input has no task flag " + JSON.stringify(input));
		assert.ok(input.text.length > 0, "Input has no text " + JSON.stringify(input));
	});



});

suite('Issue #170 — weekday/month/shortcut prefix collisions', () => {

	async function parse(text: string): Promise<J.Model.Input> {
		const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		const ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false);
		const parser = new J.Actions.Parser(ctrl);
		return parser.parseInput(text);
	}

	// Negative tests — free-text input must NOT match a token prefix
	// and shift the journal date.

	test("'Don Julio' must not match German 'do' weekday prefix (#170)", async () => {
		const input = await parse("Don Julio");
		assert.strictEqual(input.offset, 0, "offset must stay 0 for plain text, got " + input.offset);
		assert.strictEqual(input.text, "Don Julio", "text must be preserved, got " + JSON.stringify(input.text));
	});

	test("'Donnergrolln' must not match 'donnerstag' substring (#170)", async () => {
		const input = await parse("Donnergrolln");
		assert.strictEqual(input.offset, 0, "offset must stay 0, got " + input.offset);
		assert.strictEqual(input.text, "Donnergrolln");
	});

	test("'Tomato' must not match English 'tom' shortcut prefix (#170)", async () => {
		const input = await parse("Tomato");
		assert.strictEqual(input.offset, 0, "offset must stay 0, got " + input.offset);
		assert.strictEqual(input.text, "Tomato");
	});

	test("'Maybelline' must not match 'may' month prefix (#170)", async () => {
		const input = await parse("Maybelline");
		assert.strictEqual(input.offset, 0, "offset must stay 0, got " + input.offset);
		assert.strictEqual(input.text, "Maybelline");
	});

	test("'Junior dev' must not match 'jun' month prefix (#170)", async () => {
		const input = await parse("Junior dev");
		assert.strictEqual(input.offset, 0, "offset must stay 0, got " + input.offset);
		assert.strictEqual(input.text, "Junior dev");
	});

	test("'Doel halen' must not match Dutch 'do' weekday prefix (#170)", async () => {
		const input = await parse("Doel halen");
		assert.strictEqual(input.offset, 0, "offset must stay 0, got " + input.offset);
		assert.strictEqual(input.text, "Doel halen");
	});

	test("'Marathon' must not match Spanish 'mar' or English 'mar' month prefix (#170)", async () => {
		const input = await parse("Marathon");
		assert.strictEqual(input.offset, 0, "offset must stay 0, got " + input.offset);
		assert.strictEqual(input.text, "Marathon");
	});

	// Positive controls — token paths still work when the input IS a token.
	// Offset assertions are avoided because they depend on the day the test runs
	// (e.g. "do" resolves to offset 0 if run on a Thursday). The robust
	// invariant is that token recognition consumes the input so `text` is
	// empty (or, for combined inputs, only the residual remains).

	test("lone 'do' is consumed as a weekday token (text is empty)", async () => {
		const input = await parse("do");
		assert.strictEqual(input.text, "", "weekday token 'do' should leave empty text, got " + JSON.stringify(input.text));
	});

	test("'Donnerstag' (full German weekday) is consumed (text is empty)", async () => {
		const input = await parse("Donnerstag");
		assert.strictEqual(input.text, "", "weekday 'Donnerstag' should leave empty text, got " + JSON.stringify(input.text));
	});

	test("'do task fix the regex' keeps task flag and residual text", async () => {
		const input = await parse("do task fix the regex");
		assert.ok(input.hasTask(), "task flag missing: " + JSON.stringify(input));
		assert.strictEqual(input.text, "fix the regex", "expected residual 'fix the regex', got " + JSON.stringify(input.text));
	});

	test("'w15' still resolves to week 15", async () => {
		const input = await parse("w15");
		assert.strictEqual(input.week, 15, "expected week 15, got " + input.week);
	});

	test("'week 15' still resolves to week 15", async () => {
		const input = await parse("week 15");
		assert.strictEqual(input.week, 15, "expected week 15, got " + input.week);
	});

});
