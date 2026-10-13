import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Plugin that logs build start/end events for the VS Code problem matcher.
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',
	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				if (location) {
					console.error(`    ${location.file}:${location.line}:${location.column}:`);
				}
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * The MCP server (mcp-server/src/stdio.ts) as one file for the VSIX (#292).
 * It runs on VS Code's own Node (ELECTRON_RUN_AS_NODE): Node 22 in VS Code
 * 1.118, the oldest supported version. It needs nothing from node_modules.
 * @type {import('esbuild').BuildOptions}
 */
const mcpServer = {
	entryPoints: ['mcp-server/src/stdio.ts'],
	bundle: true,
	// top-level await in stdio.ts
	format: 'esm',
	target: 'node22',
	minify: production,
	sourcemap: !production,
	sourcesContent: false,
	platform: 'node',
	outfile: 'dist/mcp-server.mjs',
	// ES module builds first: the UMD build of jsonc-parser loads its parts with a require() esbuild can't follow
	mainFields: ['module', 'main'],
	// one moment.js, like the extension; CommonJS dependencies (journal-core) call require()
	alias: { moment: './mcp-server/node_modules/moment' },
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
	logLevel: 'silent',
	plugins: [esbuildProblemMatcherPlugin],
};

async function main() {
	const server = await esbuild.context(mcpServer);
	const ctx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		// one moment.js in the bundle: journal-core (packages/) would otherwise resolve its own copy
		alias: { moment: './node_modules/moment' },
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});

	if (watch) {
		await Promise.all([ctx.watch(), server.watch()]);
	} else {
		await Promise.all([ctx.rebuild(), server.rebuild()]);
		await Promise.all([ctx.dispose(), server.dispose()]);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
