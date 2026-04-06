import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { generateEnumNameMap, generateEnumNumberMap } from '../enum-codegen.js'
import type { ProtoEnum } from '../enum-codegen.js'

const statusEnum: ProtoEnum = {
    name: 'Status',
    values: [
        { name: 'UNKNOWN', number: 0 },
        { name: 'ACTIVE', number: 1 }
    ]
}

describe('enum code generation helpers', () => {
    it('generates a name-to-number lookup map', () => {
        const code = generateEnumNameMap(statusEnum)

        assert.ok(code.includes('StatusName'))
        assert.ok(code.includes("'UNKNOWN': 0"))
        assert.ok(code.includes("'ACTIVE': 1"))
        assert.ok(code.includes('as const'))
    })

    it('generates a number-to-name lookup map', () => {
        const code = generateEnumNumberMap(statusEnum)

        assert.ok(code.includes('StatusNumber'))
        assert.ok(code.includes("0: 'UNKNOWN'"))
        assert.ok(code.includes("1: 'ACTIVE'"))
        assert.ok(code.includes('as const'))
    })
})
