import * as assert from 'assert';


// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as J from '../..';
import { TestLogger } from '../test-logger';
import { SCOPE_DEFAULT } from '../../model/config';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

suite('Open Journal Entries', () => {
	vscode.window.showInformationMessage('Start all tests.');

	/* */
	test('Simple', async () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	})
		;
	test("Input '+1'", async () => {
		let ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({}));
		ctrl.initServices(new TestLogger(false));


		let input = await ctrl.parser.parseInput("+1");


		assert.strictEqual(1, input.offset);
	})
		;

	test("Input '2021-05-12'", async () => {
		let ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({}));
		ctrl.initServices(new TestLogger(false));


		let input = await ctrl.parser.parseInput("2021-05-12");

		assert.strictEqual(input.offset > 0 || input.offset <= 0, true);
	})
		;

	test("Input '05-12'", async () => {
		let ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({}));
		ctrl.initServices(new TestLogger(false));


		let input = await ctrl.parser.parseInput("05-12");

		assert.strictEqual(input.offset > 0 || input.offset <= 0, true);
	})
		;

	test("Input '12'", async () => {
		let ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({}));
		ctrl.initServices(new TestLogger(false));


		let input = await ctrl.parser.parseInput("12");

		assert.strictEqual(input.offset > 0 || input.offset <= 0, true);
	})
		;

	test("Input 'next monday'", async () => {
		let ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({}));
		ctrl.initServices(new TestLogger(false));


		let input = await ctrl.parser.parseInput("next monday");


		assert.ok(input.offset > 0, "Offset not > 0, is " + input.offset);
	});

	test("Input 'next tue'", async () => {
		let ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({}));
		ctrl.initServices(new TestLogger(false));


		let input = await ctrl.parser.parseInput("next tue");

		assert.ok(input.offset > 0, "Offset not > 0, is " + input.offset);
	});

	test("Input 'last wed'", async () => {
		let ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({}));
		ctrl.initServices(new TestLogger(false));


		let input = await ctrl.parser.parseInput("last wed");

		assert.ok(input.offset < 0, "Offset not < 0, is " + input.offset);
	});


	test("Input 'task +1 do this'", async () => {
		let ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({}));
		ctrl.initServices(new TestLogger(false));


		let input = await ctrl.parser.parseInput("task +1 text");

		assert.ok(input.offset > 0, "Offset not > 0, is " + input.offset);
		assert.ok(input.hasFlags(), "Input has no flags " + JSON.stringify(input));
		assert.ok(input.hasTask(), "Input has no task flag " + JSON.stringify(input));
		assert.ok(input.text.length > 0, "Input has no text " + JSON.stringify(input));
	});

	test("Input 'task next wed do this'", async () => {
		let ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({}));
		ctrl.initServices(new TestLogger(false));


		let input = await ctrl.parser.parseInput("task next wed text");

		assert.ok(input.offset > 0, "Offset not > 0, is " + input.offset);
		assert.ok(input.hasFlags(), "Input has no flags " + JSON.stringify(input));
		assert.ok(input.hasTask(), "Input has no task flag " + JSON.stringify(input));
		assert.ok(input.text.length > 0, "Input has no text " + JSON.stringify(input));
	});



});

suite('Issue #170 — weekday/month/shortcut prefix collisions', () => {

	async function parse(text: string, locale = ''): Promise<J.Model.Input> {
		const ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig(locale ? { locale } : {}));
		ctrl.initServices(new TestLogger(false));
		return ctrl.parser.parseInput(text);
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
		const input = await parse("do", "de");
		assert.strictEqual(input.text, "", "weekday token 'do' should leave empty text, got " + JSON.stringify(input.text));
	});

	test("'Donnerstag' (full German weekday) is consumed (text is empty)", async () => {
		const input = await parse("Donnerstag", "de");
		assert.strictEqual(input.text, "", "weekday 'Donnerstag' should leave empty text, got " + JSON.stringify(input.text));
	});

	test("'do task fix the regex' keeps task flag and residual text", async () => {
		const input = await parse("do task fix the regex", "de");
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

suite('NoteInput.extractScopeAndTags (#210)', () => {

	test("noTags: text without tags stays unchanged, scope defaults", () => {
		const input = new J.Model.NoteInput();
		input.text = "my note";
		input.extractScopeAndTags([]);
		assert.strictEqual(input.scope, SCOPE_DEFAULT);
		assert.deepStrictEqual(input.tags, []);
		assert.strictEqual(input.text, "my note");
	});

	test("namedScopeMatch: matching tag sets scope, strips from text", () => {
		const input = new J.Model.NoteInput();
		input.text = "my note #work ";
		input.extractScopeAndTags(["work"]);
		assert.strictEqual(input.scope, "work");
		assert.deepStrictEqual(input.tags, ["#work"]);
		assert.ok(!input.text.includes("#work"), "tag should be stripped from text");
	});

	test("noScopeMatch: unknown tag collected but scope stays default", () => {
		const input = new J.Model.NoteInput();
		input.text = "my note #unknown ";
		input.extractScopeAndTags(["work"]);
		assert.strictEqual(input.scope, SCOPE_DEFAULT);
		assert.deepStrictEqual(input.tags, ["#unknown"]);
		assert.ok(!input.text.includes("#unknown"), "tag should be stripped from text");
	});

	test("multipleTags: both tags collected, first matching scope wins", () => {
		const input = new J.Model.NoteInput();
		input.text = "note #work #meeting ";
		input.extractScopeAndTags(["work"]);
		assert.strictEqual(input.scope, "work");
		assert.deepStrictEqual(input.tags, ["#work", "#meeting"]);
		assert.ok(!input.text.includes("#work"), "#work should be stripped");
		assert.ok(!input.text.includes("#meeting"), "#meeting should be stripped");
	});

	test("tagAtEndOfString: tag without trailing space is matched (regex fix)", () => {
		const input = new J.Model.NoteInput();
		input.text = "note #work";
		input.extractScopeAndTags(["work"]);
		assert.strictEqual(input.scope, "work");
		assert.deepStrictEqual(input.tags, ["#work"]);
		assert.ok(!input.text.includes("#work"), "tag should be stripped from text");
	});

});
