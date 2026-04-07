import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const baseConfig = require('@vinikjkkj/eslint-config')

/** @type {import('eslint').Linter.Config[]} */
export default [
    ...baseConfig,
    {
        rules: {
            'no-restricted-globals': ['error', 'DataView'],
            'no-bitwise': 'off',
            // Allow double quotes for strings that contain single quotes,
            // matching Prettier's `singleQuote: true` + escape-avoidance behavior.
            quotes: ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }]
        }
    },
    {
        ignores: [
            '**/dist/',
            '**/*.cjs',
            '**/node_modules/',
            'coverage/',
            'benchmarks/generated/',
            // Imports from `benchmarks/generated/` (gitignored), so the file
            // can't be type-checked or type-linted in CI. Mirrored in
            // tsconfig.json's exclude list.
            'benchmarks/generated-compare.bench.ts',
            '.tmp/'
        ]
    }
]
