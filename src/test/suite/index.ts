import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

function findTestFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...findTestFiles(fullPath));
		} else if (entry.isFile() && entry.name.endsWith('.test.js')) {
			results.push(fullPath);
		}
	}
	return results;
}

export function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});

	const testsRoot = path.join(__dirname, '..');
	const testFiles = findTestFiles(testsRoot);
	testFiles.forEach(f => mocha.addFile(f));

	return new Promise((c, e) => {
		try {
			mocha.run(failures => {
				if (failures > 0) {
					e(new Error(`${failures} tests failed.`));
				} else {
					c();
				}
			});
		} catch (err) {
			console.error(err);
			e(err);
		}
	});
}
