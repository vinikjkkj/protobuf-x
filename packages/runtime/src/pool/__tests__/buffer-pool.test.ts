import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { BufferPool } from '../buffer-pool.js'

describe('BufferPool', () => {
    it('allocates buffers from the slab', () => {
        const pool = new BufferPool(1024)
        const buf1 = pool.alloc(100)
        assert.equal(buf1.length, 100)
        assert.equal(pool.remaining, 924)
    })

    it('consecutive allocs share the same underlying buffer', () => {
        const pool = new BufferPool(1024)
        const buf1 = pool.alloc(100)
        const buf2 = pool.alloc(200)
        assert.equal(buf1.buffer, buf2.buffer) // same ArrayBuffer
        assert.equal(buf1.byteOffset, 0)
        assert.equal(buf2.byteOffset, 100)
    })

    it('allocates new slab when exhausted', () => {
        const pool = new BufferPool(256)
        const buf1 = pool.alloc(200)
        const buf2 = pool.alloc(200) // won't fit, new slab
        assert.notEqual(buf1.buffer, buf2.buffer)
        assert.equal(pool.remaining, 56)
    })

    it('handles oversized allocations', () => {
        const pool = new BufferPool(256)
        const buf = pool.alloc(512)
        assert.equal(buf.length, 512)
        // Pool's slab should be unaffected
        assert.equal(pool.remaining, 256)
    })

    it('reset reuses slab from beginning', () => {
        const pool = new BufferPool(1024)
        pool.alloc(500)
        assert.equal(pool.remaining, 524)
        pool.reset()
        assert.equal(pool.remaining, 1024)
    })

    it('allocated buffers are writable and independent', () => {
        const pool = new BufferPool(1024)
        const buf1 = pool.alloc(4)
        const buf2 = pool.alloc(4)
        buf1[0] = 0xff
        buf2[0] = 0x42
        assert.equal(buf1[0], 0xff)
        assert.equal(buf2[0], 0x42)
    })

    it('exposes the configured slab capacity', () => {
        assert.equal(new BufferPool().capacity, 65536)
        assert.equal(new BufferPool(1024).capacity, 1024)
        assert.equal(new BufferPool(16).capacity, 16)
    })
})
