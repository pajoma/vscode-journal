import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { readdirSync } from 'node:fs';

// package-by-feature (#234, #252): a feature must not import another feature;
// cross-feature work goes through shared/ (interfaces on JournalController, events)
const features = readdirSync(new URL('./src/features', import.meta.url), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
const kernelBoundary = { regex: '^(\\.\\./)+(features|app)(/|$)', message: 'shared/ is the kernel: it must not import features or app/.' };
const featureBoundaries = features.map(feature => ({
    files: [`src/features/${feature}/**/*.ts`],
    rules: {
        'no-restricted-imports': ['error', {
            patterns: [{
                regex: `^(\\.\\./)+(features/)?(${features.filter(f => f !== feature).join('|')})(/|$)`,
                message: `Feature "${feature}" must not import another feature; use shared/ (JournalController interfaces or events).`,
            }, {
                regex: '^(\\.\\./)+app(/|$)',
                message: 'Features must not import app/ (composition root); depend on JournalController instead.',
            }],
        }],
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
        // modules re-exported by shared/index.ts must not import it (import cycle, #257)
        files: ['src/shared/lang.ts', 'src/shared/{strings,dates,fs,logging}/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                // repeat the kernel boundary: a later block replaces the rule options of earlier ones
                patterns: [kernelBoundary, { regex: '^\\.\\.?/index$', message: 'Import from the source module, not the shared/ barrel (import cycle).' }],
            }],
        },
    },
    {
        ignores: ['out/**', 'dist/**', '**/*.d.ts', 'node_modules/**'],
    },
];
