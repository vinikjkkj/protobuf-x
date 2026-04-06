import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { WireType } from '../wire-type.js'
import { BinaryWriter } from '../writer.js'

describe('BinaryWriter', () => {
    it('produces empty buffer for no writes', () => {
        const w = BinaryWriter.create()
        const buf = w.finish()
        assert.equal(buf.length, 0)
    })

    it('writes raw bytes', () => {
        const w = BinaryWriter.create()
        w.raw(new Uint8Array([0x0a, 0x0b, 0x0c]))
        const buf = w.finish()
        assert.deepEqual([...buf], [0x0a, 0x0b, 0x0c])
    })

    it('tracks length correctly', () => {
        const w = BinaryWriter.create()
        assert.equal(w.length, 0)
        w.uint32(300) // 2 bytes
        assert.equal(w.length, 2)
        w.string('hi') // 1 (len) + 2 (bytes) = 3
        assert.equal(w.length, 5)
    })

    it('chains method calls', () => {
        const w = BinaryWriter.create()
        const result = w.uint32(1).string('test').bool(true)
        assert.equal(result, w)
    })

    it('writes field tags', () => {
        const w = BinaryWriter.create()
        w.tag(1, WireType.Varint)
        w.tag(2, WireType.LengthDelimited)
        const buf = w.finish()
        assert.equal(buf[0], 0x08) // field 1, varint
        assert.equal(buf[1], 0x12) // field 2, length-delimited
    })

    it('fork/join writes sub-message with length prefix', () => {
        const w = BinaryWriter.create()
        w.uint32(42) // some field before
        w.fork()
        w.uint32(1).uint32(2)
        w.join()
        w.uint32(99) // some field after

        const buf = w.finish()
        // 42 as varint, then length of sub (2 bytes), then 1, 2, then 99
        assert.equal(buf[0], 42)
        assert.equal(buf[1], 2) // length prefix
        assert.equal(buf[2], 1)
        assert.equal(buf[3], 2)
        assert.equal(buf[4], 99)
    })

    it('reset allows reuse', () => {
        const w = BinaryWriter.create()
        w.uint32(42)
        assert.equal(w.length, 1)
        w.reset()
        assert.equal(w.length, 0)
        w.uint32(99)
        const buf = w.finish()
        assert.deepEqual([...buf], [99])
    })

    it('writes negative int32 as 10-byte varint', () => {
        const w = BinaryWriter.create()
        w.int32(-1)
        const buf = w.finish()
        assert.equal(buf.length, 10) // negative int32 = 10 bytes (sign-extended to 64 bits)
    })

    it('writes multiple types in sequence', () => {
        const w = BinaryWriter.create()
        w.tag(1, WireType.Varint).uint32(150)
        w.tag(2, WireType.LengthDelimited).string('testing')
        w.tag(3, WireType.Bit32).fixed32(0x12345678)

        const buf = w.finish()
        assert.ok(buf.length > 0)

        // Verify field 1: tag 0x08, value 150 (0x96 0x01)
        assert.equal(buf[0], 0x08)
        assert.equal(buf[1], 0x96)
        assert.equal(buf[2], 0x01)
    })
})
