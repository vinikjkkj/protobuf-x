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
            '.tmp/'
        ]
    }
]
