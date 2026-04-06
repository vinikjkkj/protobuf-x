import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { diff } from '../diff.js'
import { equals, shallowEquals } from '../equals.js'
import { freeze } from '../freeze.js'
import { fromJSON } from '../json.js'
import { validate } from '../validate.js'
import type { FieldSchema } from '../validate.js'

class FakeMsg {
    constructor(private readonly value: number) {}

    equals(other: FakeMsg): boolean {
        return this.value === other.value
    }
}

describe('util advanced behavior', () => {
    it('handles diff edge cases for arrays and bytes', () => {
        assert.equal(diff({ items: [1, 2, 3] }, { items: [1, 2] }).length, 1)
        assert.equal(diff({ items: [1, 2, 3] }, { items: [1, 9, 3] }).length, 1)
        assert.equal(diff({ items: [1, 2, 3] }, { items: [1, 2, 3] }).length, 0)
        assert.equal(
            diff({ data: new Uint8Array([1, 2]) }, { data: new Uint8Array([1, 2]) }).length,
            0
        )
        assert.equal(
            diff({ data: new Uint8Array([1]) }, { data: new Uint8Array([1, 2]) }).length,
            1
        )
    })

    it('covers validate custom validators and extra type mismatches', () => {
        const customSchema: Record<string, FieldSchema> = {
            age: {
                type: 'number',
                validator: (value) =>
                    typeof value === 'number' && value < 0 ? 'Must be positive' : undefined
            }
        }
        assert.ok(
            validate({ age: -5 }, customSchema).some(
                (error) => error.message === 'Must be positive'
            )
        )
        assert.equal(validate({ age: 10 }, customSchema).length, 0)

        const schema: Record<string, FieldSchema> = {
            age: { type: 'number' },
            active: { type: 'boolean' },
            data: { type: 'bytes' },
            address: { type: 'message', schema: { city: { type: 'string' } } }
        }
        assert.ok(validate({ age: 'x' }, schema).some((error) => error.path === 'age'))
        assert.ok(validate({ active: 1 }, schema).some((error) => error.path === 'active'))
        assert.ok(validate({ data: 'x' }, schema).some((error) => error.path === 'data'))
        assert.ok(validate({ address: 'x' }, schema).some((error) => error.path === 'address'))
    })

    it('covers fromJSON recursion for arrays, objects and bytes', () => {
        assert.deepEqual(fromJSON({ items: [{ name: 'a' }, { name: 'b' }] }), {
            items: [{ name: 'a' }, { name: 'b' }]
        })
        assert.deepEqual(fromJSON({ tags: ['a', 'b', 'c'] }), { tags: ['a', 'b', 'c'] })
        assert.deepEqual(fromJSON({ user: { address: { city: 'NY' } } }), {
            user: { address: { city: 'NY' } }
        })
        const bytes = fromJSON({ data: 'AQID' }, new Set(['data']))
        assert.deepEqual([...(bytes.data as Uint8Array)], [1, 2, 3])
    })

    it('wraps equals() and freeze() for edge cases', () => {
        assert.equal(equals(new FakeMsg(1) as never, new FakeMsg(1) as never), true)
        assert.equal(equals(new FakeMsg(1) as never, new FakeMsg(2) as never), false)

        assert.equal(freeze(42), 42)
        assert.equal(freeze(null), null)
        assert.equal(freeze('hello'), 'hello')
        assert.equal(freeze(undefined), undefined)

        const obj = { a: 1, b: { c: 2 } }
        const frozen = freeze(obj)
        assert.ok(Object.isFrozen(frozen))
        assert.ok(Object.isFrozen(frozen.b))
    })

    it('still exposes shallow byte equality on Uint8Array fields', () => {
        assert.equal(
            shallowEquals({ d: new Uint8Array([1, 2]) }, { d: new Uint8Array([1, 2]) }),
            true
        )
        assert.equal(shallowEquals({ d: new Uint8Array([1]) }, { d: new Uint8Array([2]) }), false)
    })
})
