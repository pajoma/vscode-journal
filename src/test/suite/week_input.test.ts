import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as J from '../..';
import { TestLogger } from '../TestLogger';

suite('Open Journal Entries', () => {
	vscode.window.showInformationMessage('Start all tests.');


	test("Input 'next monday'", async () => {
		let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false); 


		let parser = new J.Actions.Parser(ctrl);
		let input = await parser.parseInput("next monday"); 


		assert.ok(input.offset > 0, "Offset not > 0, is "+input.offset); 
	});


});
