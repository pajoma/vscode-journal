import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/suite/**/*.test.js',
	workspaceFolder: './test/ws_unittests',
	mocha: {
		ui: 'tdd',
		timeout: 20000,
	},
});
