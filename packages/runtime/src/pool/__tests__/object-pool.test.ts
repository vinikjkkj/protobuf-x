import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { ObjectPool } from '../object-pool.js'

describe('ObjectPool', () => {
    it('acquires pre-allocated objects', () => {
        let created = 0
        const pool = new ObjectPool(() => {
            created++
            return { value: 0 }
        }, 4)
        assert.equal(created, 4)
        assert.equal(pool.size, 4)

        const obj = pool.acquire()
        assert.equal(pool.size, 3)
        assert.ok(obj)
    })

    it('creates new objects when pool is empty', () => {
        let created = 0
        const pool = new ObjectPool(() => {
            created++
            return { value: created }
        }, 1)
        pool.acquire() // takes the pre-allocated one
        const obj = pool.acquire() // creates a new one
        assert.equal(created, 2)
        assert.ok(obj)
    })

    it('recycles released objects', () => {
        const pool = new ObjectPool(() => ({ value: 0 }), 0)
        const obj = pool.acquire()
        obj.value = 42
        pool.release(obj)
        assert.equal(pool.size, 1)

        const reused = pool.acquire()
        assert.equal(reused, obj) // same reference
    })

    it('calls reset() on release if available', () => {
        let resetCalled = false
        const pool = new ObjectPool(
            () => ({
                value: 0,
                reset() {
                    resetCalled = true
                    this.value = 0
                }
            }),
            0
        )

        const obj = pool.acquire()
        obj.value = 42
        pool.release(obj)
        assert.equal(resetCalled, true)
        assert.equal(obj.value, 0)
    })

    it('respects maxSize limit', () => {
        const pool = new ObjectPool(() => ({ value: 0 }), 0, 2)
        const objs = [pool.acquire(), pool.acquire(), pool.acquire()]
        for (const obj of objs) pool.release(obj)
        assert.equal(pool.size, 2) // only 2 kept, 3rd discarded
    })

    it('drain empties the pool', () => {
        const pool = new ObjectPool(() => ({ value: 0 }), 8)
        assert.equal(pool.size, 8)
        pool.drain()
        assert.equal(pool.size, 0)
    })
})
