import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { BinaryReader } from '../reader.js'
import { BinaryWriter } from '../writer.js'

describe('BinaryReader', () => {
    it('reads uint32', () => {
        const w = BinaryWriter.create()
        w.uint32(0).uint32(1).uint32(300).uint32(0xffffffff)
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        assert.equal(r.uint32(), 0)
        assert.equal(r.uint32(), 1)
        assert.equal(r.uint32(), 300)
        assert.equal(r.uint32(), 0xffffffff)
        assert.equal(r.hasMore(), false)
    })

    it('reads int32 (including negative)', () => {
        const w = BinaryWriter.create()
        w.int32(0).int32(1).int32(-1).int32(-100).int32(2147483647).int32(-2147483648)
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        assert.equal(r.int32(), 0)
        assert.equal(r.int32(), 1)
        assert.equal(r.int32(), -1)
        assert.equal(r.int32(), -100)
        assert.equal(r.int32(), 2147483647)
        assert.equal(r.int32(), -2147483648)
    })

    it('reads sint32', () => {
        const w = BinaryWriter.create()
        w.sint32(0).sint32(1).sint32(-1).sint32(2147483647).sint32(-2147483648)
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        assert.equal(r.sint32(), 0)
        assert.equal(r.sint32(), 1)
        assert.equal(r.sint32(), -1)
        assert.equal(r.sint32(), 2147483647)
        assert.equal(r.sint32(), -2147483648)
    })

    it('reads bool', () => {
        const w = BinaryWriter.create()
        w.bool(true).bool(false).bool(true)
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        assert.equal(r.bool(), true)
        assert.equal(r.bool(), false)
        assert.equal(r.bool(), true)
    })

    it('reads fixed32', () => {
        const w = BinaryWriter.create()
        w.fixed32(0).fixed32(1).fixed32(0xdeadbeef)
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        assert.equal(r.fixed32(), 0)
        assert.equal(r.fixed32(), 1)
        assert.equal(r.fixed32(), 0xdeadbeef)
    })

    it('reads fixed64', () => {
        const w = BinaryWriter.create()
        w.fixed64(0xdeadbeef, 0xcafebabe)
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        const [lo, hi] = r.fixed64()
        assert.equal(lo, 0xdeadbeef)
        assert.equal(hi, 0xcafebabe)
    })

    it('reads float', () => {
        const w = BinaryWriter.create()
        w.float(3.140000104904175) // float32 precision
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        const val = r.float()
        assert.ok(Math.abs(val - 3.14) < 0.001, `Expected ~3.14, got ${val}`)
    })

    it('reads double', () => {
        const w = BinaryWriter.create()
        w.double(3.141592653589793)
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        assert.equal(r.double(), 3.141592653589793)
    })

    it('reads string', () => {
        const w = BinaryWriter.create()
        w.string('hello').string('').string('protobuf-x 🚀')
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        assert.equal(r.string(), 'hello')
        assert.equal(r.string(), '')
        assert.equal(r.string(), 'protobuf-x 🚀')
    })

    it('reads bytes (zero-copy)', () => {
        const w = BinaryWriter.create()
        const data = new Uint8Array([1, 2, 3, 4, 5])
        w.bytes(data)
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        const result = r.bytes()
        assert.deepEqual([...result], [1, 2, 3, 4, 5])
        // Verify zero-copy: result shares the same underlying buffer
        assert.equal(result.buffer, buf.buffer)
    })

    it('skips unknown fields', () => {
        const w = BinaryWriter.create()
        w.uint32(42).string('skip me').fixed32(0xdeadbeef).uint32(99)
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        assert.equal(r.uint32(), 42)
        r.skip(2) // LengthDelimited (string)
        r.skip(5) // Bit32 (fixed32)
        assert.equal(r.uint32(), 99)
    })

    it('hasMore returns correct state', () => {
        const w = BinaryWriter.create()
        w.uint32(1)
        const buf = w.finish()
        const r = BinaryReader.create(buf)
        assert.equal(r.hasMore(), true)
        r.uint32()
        assert.equal(r.hasMore(), false)
    })
})
