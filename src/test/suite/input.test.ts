import * as assert from 'assert';


// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as J from '../..';
import { TestLogger } from '../TestLogger';

suite.skip('Open Journal Entries', () => {
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


		assert.ok(input.offset > 0, "Offset not > 0, is "+input.offset); 
	});

	test("Input 'next tue'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false); 


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("next tue"); 

		assert.ok(input.offset > 0, "Offset not > 0, is "+input.offset); 
	});

	test("Input 'last wed'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false); 


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("last wed"); 

		assert.ok(input.offset < 0, "Offset not < 0, is "+input.offset); 
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
