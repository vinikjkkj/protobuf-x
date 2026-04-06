import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const baseConfig = require('@vinikjkkj/eslint-config')

/** @type {import('eslint').Linter.Config[]} */
export default [
    ...baseConfig,
    {
        rules: {
            'no-restricted-globals': ['error', 'DataView'],
            'no-bitwise': 'off'
        }
    },
    { ignores: ['**/dist/', '**/*.cjs'] }
]
