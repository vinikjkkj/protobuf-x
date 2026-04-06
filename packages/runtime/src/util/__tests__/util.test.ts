import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { diff } from '../diff.js'
import { shallowEquals } from '../equals.js'
import { freeze } from '../freeze.js'
import { toJSON, fromJSON } from '../json.js'
import { patch } from '../patch.js'
import { validate } from '../validate.js'
import type { FieldSchema } from '../validate.js'

describe('diff', () => {
    it('returns empty array for identical objects', () => {
        const a = { name: 'Alice', age: 30 }
        assert.deepEqual(diff(a, a), [])
    })

    it('detects scalar changes', () => {
        const a = { name: 'Alice', age: 30 }
        const b = { name: 'Bob', age: 30 }
        const d = diff(a, b)
        assert.equal(d.length, 1)
        assert.equal(d[0]!.path, 'name')
        assert.equal(d[0]!.before, 'Alice')
        assert.equal(d[0]!.after, 'Bob')
    })

    it('detects nested changes', () => {
        const a = { addr: { city: 'NY' } }
        const b = { addr: { city: 'LA' } }
        const d = diff(a, b)
        assert.equal(d.length, 1)
        assert.equal(d[0]!.path, 'addr.city')
    })

    it('detects added and removed fields', () => {
        const a = { x: 1 } as Record<string, unknown>
        const b = { y: 2 } as Record<string, unknown>
        const d = diff(a, b)
        assert.equal(d.length, 2)
    })

    it('detects bytes differences', () => {
        const a = { data: new Uint8Array([1, 2, 3]) }
        const b = { data: new Uint8Array([1, 2, 4]) }
        const d = diff(a, b)
        assert.equal(d.length, 1)
        assert.equal(d[0]!.path, 'data')
    })
})

describe('freeze', () => {
    it('prevents mutation', () => {
        const obj = { a: 1, nested: { b: 2 } }
        freeze(obj)
        assert.throws(() => {
            ;(obj as { a: number }).a = 99
        })
        assert.throws(() => {
            ;(obj.nested as { b: number }).b = 99
        })
    })
})

describe('patch', () => {
    it('applies partial update', () => {
        const obj = { a: 1, b: 'hello' }
        patch(obj, { b: 'world' })
        assert.equal(obj.a, 1)
        assert.equal(obj.b, 'world')
    })
})

describe('shallowEquals', () => {
    it('returns true for equal objects', () => {
        assert.equal(shallowEquals({ a: 1, b: 'x' }, { a: 1, b: 'x' }), true)
    })

    it('returns false for different objects', () => {
        assert.equal(shallowEquals({ a: 1 }, { a: 2 }), false)
    })

    it('compares Uint8Array contents', () => {
        assert.equal(
            shallowEquals({ d: new Uint8Array([1, 2]) }, { d: new Uint8Array([1, 2]) }),
            true
        )
        assert.equal(shallowEquals({ d: new Uint8Array([1]) }, { d: new Uint8Array([2]) }), false)
    })
})

describe('toJSON / fromJSON', () => {
    it('converts Uint8Array to base64 and back', () => {
        const obj = { data: new Uint8Array([1, 2, 3]) }
        const json = toJSON(obj)
        assert.equal(json.data, 'AQID') // base64 of [1,2,3]

        const restored = fromJSON(json, new Set(['data']))
        assert.deepEqual([...(restored.data as Uint8Array)], [1, 2, 3])
    })

    it('handles nested objects', () => {
        const obj = { user: { name: 'Alice', age: 30 } }
        const json = toJSON(obj)
        assert.deepEqual(json, { user: { name: 'Alice', age: 30 } })
    })

    it('handles arrays', () => {
        const obj = { tags: ['a', 'b', 'c'] }
        const json = toJSON(obj)
        assert.deepEqual(json, { tags: ['a', 'b', 'c'] })
    })
})

describe('validate', () => {
    const schema: Record<string, FieldSchema> = {
        name: { type: 'string', required: true },
        age: { type: 'number' },
        active: { type: 'boolean' },
        data: { type: 'bytes' },
        tags: { type: 'repeated' },
        address: {
            type: 'message',
            schema: {
                city: { type: 'string', required: true }
            }
        }
    }

    it('returns no errors for valid object', () => {
        const errors = validate({ name: 'Alice', age: 30, active: true }, schema)
        assert.equal(errors.length, 0)
    })

    it('detects missing required field', () => {
        const errors = validate({}, schema)
        assert.ok(errors.some((e) => e.path === 'name' && e.message.includes('Required')))
    })

    it('detects wrong type', () => {
        const errors = validate({ name: 123 as unknown as string }, schema)
        assert.ok(errors.some((e) => e.path === 'name' && e.message.includes('string')))
    })

    it('validates nested messages', () => {
        const errors = validate({ name: 'X', address: { city: 123 } }, schema)
        assert.ok(errors.some((e) => e.path === 'address.city'))
    })

    it('detects non-array for repeated field', () => {
        const errors = validate({ name: 'X', tags: 'not-array' }, schema)
        assert.ok(errors.some((e) => e.path === 'tags'))
    })
})
