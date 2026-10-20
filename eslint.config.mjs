import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { readdirSync } from 'node:fs';

// package-by-feature (#234, #252): a feature must not import another feature;
// cross-feature work goes through shared/ (interfaces on JournalController, events)
const features = readdirSync(new URL('./src/features', import.meta.url), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
const noVscode = { name: 'vscode', message: 'This module must run without VS Code; the VS Code side lives in shared/editor (#239, #251).' };
const kernelBoundary = { regex: '^(\\.\\./)+(features|app)(/|$)', message: 'shared/ is the kernel: it must not import features or app/.' };
/** Import patterns a feature must not use: other features and app/. */
const featurePatterns = feature => [{
    regex: `^(\\.\\./)+(features/)?(${features.filter(f => f !== feature).join('|')})(/|$)`,
    message: `Feature "${feature}" must not import another feature; use shared/ (JournalController interfaces or events).`,
}, {
    regex: '^(\\.\\./)+app(/|$)',
    message: 'Features must not import app/ (composition root); depend on JournalController instead.',
}];
const featureBoundaries = features.map(feature => ({
    files: [`src/features/${feature}/**/*.ts`],
    rules: {
        'no-restricted-imports': ['error', { patterns: featurePatterns(feature) }],
    },
}));

export default [
    {
        files: ['src/**/*.ts'],
        plugins: {
            '@typescript-eslint': typescriptEslint,
        },
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2022,
            sourceType: 'module',
        },
        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                { selector: 'import', format: ['camelCase', 'PascalCase'] },
            ],
            curly: 'warn',
            eqeqeq: 'warn',
            'no-throw-literal': 'warn',
            semi: ['warn', 'always'],
        },
    },
    ...featureBoundaries,
    {
        // only the composition root (src/app) knows features; the kernel knows neither
        files: ['src/shared/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [kernelBoundary],
            }],
        },
    },
    {
        // the shared/ barrel and the modules it re-exports run without VS Code (#281) and must not import the barrel (import cycle, #257)
        files: ['src/shared/index.ts', 'src/shared/lang.ts', 'src/shared/strings/**/*.ts', 'src/shared/fs/fs-exists.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                // repeat the kernel boundary: a later block replaces the rule options of earlier ones
                paths: [noVscode],
                patterns: [kernelBoundary, { regex: '^\\.\\.?/index$', message: 'Import from the source module, not the shared/ barrel (import cycle).' }],
            }],
        },
    },
    {
        // the configuration, paths, model and text run outside VS Code (MCP server, node unit tests; #239, #251)
        files: ['src/shared/{model,config,text}/**/*.ts', 'src/shared/paths.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                paths: [noVscode],
                patterns: [kernelBoundary],
            }],
        },
    },
    {
        // the entries domain returns paths and text; shared/editor applies them (#239)
        files: ['src/features/entries/{reader,writer,inject}.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                paths: [noVscode],
                patterns: featurePatterns('entries'),
            }],
        },
    },
    {
        ignores: ['out/**', 'dist/**', '**/*.d.ts', 'node_modules/**'],
    },
];
