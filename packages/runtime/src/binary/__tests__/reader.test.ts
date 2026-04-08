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

// ─────────────────────────────────────────────────────────────────────────────
// Malformed input rejection (regression for the lenient-decode bug). Per the
// proto wire spec, garbage bytes must produce an error — not a silent partial
// message. Three failure modes are covered:
//   1. Reserved field number 0 (any wire type) → must throw
//   2. Truncated length-delimited fields (length exceeds remaining buffer)
//   3. Truncated fixed/varint fields
// ─────────────────────────────────────────────────────────────────────────────

describe('BinaryReader malformed input rejection', () => {
    it('rejects field number 0 in skipTag (Bit64 wire)', () => {
        // [0x01] = tag 1 → field 0, wire 1 (Bit64). Field 0 is reserved.
        const r = new BinaryReader(new Uint8Array([0x01, 2, 3]))
        const tag = r.uint32()
        assert.throws(() => r.skipTag(tag), /field number 0 is reserved/)
    })

    it('rejects field number 0 in skipTag (Bit32 wire)', () => {
        // [0x05] = tag 5 → field 0, wire 5 (Bit32).
        const r = new BinaryReader(new Uint8Array([0x05, 1, 2, 3, 4]))
        const tag = r.uint32()
        assert.throws(() => r.skipTag(tag), /field number 0 is reserved/)
    })

    it('rejects truncated string field (length exceeds buffer)', () => {
        // tag=0x0a (field 1, LEN), length=5, but only 2 data bytes
        const r = new BinaryReader(new Uint8Array([0x0a, 0x05, 0x68, 0x65]))
        r.uint32() // consume tag
        assert.throws(() => r.string(), /Truncated string field/)
    })

    it('rejects truncated bytes field (length exceeds buffer)', () => {
        const r = new BinaryReader(new Uint8Array([0x05, 0x01, 0x02])) // len=5, only 2
        assert.throws(() => r.bytes(), /Truncated bytes field/)
    })

    it('rejects truncated nested message via subReader', () => {
        const r = new BinaryReader(new Uint8Array([0x05, 0x01])) // sub len=5, only 1
        assert.throws(() => r.subReader(), /Truncated nested message/)
    })

    it('rejects truncated fixed32', () => {
        const r = new BinaryReader(new Uint8Array([0x01, 0x02])) // need 4 bytes
        assert.throws(() => r.fixed32(), /Truncated fixed32/)
    })

    it('rejects truncated double', () => {
        const r = new BinaryReader(new Uint8Array([0x01, 0x02, 0x03])) // need 8 bytes
        assert.throws(() => r.double(), /Truncated double/)
    })

    it('rejects truncated float', () => {
        const r = new BinaryReader(new Uint8Array([0x01, 0x02])) // need 4 bytes
        assert.throws(() => r.float(), /Truncated float/)
    })

    it('rejects truncated bit64 in skip()', () => {
        const r = new BinaryReader(new Uint8Array([])) // empty
        assert.throws(() => r.skip(1), /Truncated bit64/)
    })

    it('rejects truncated bit32 in skip()', () => {
        const r = new BinaryReader(new Uint8Array([])) // empty
        assert.throws(() => r.skip(5), /Truncated bit32/)
    })

    it('rejects truncated length-delimited in skip()', () => {
        // skip(LEN): reads length=5, but no data bytes
        const r = new BinaryReader(new Uint8Array([0x05]))
        assert.throws(() => r.skip(2), /Truncated length-delimited/)
    })

    it('happy path: valid encoded message round-trips through reader', () => {
        // The bounds checks must not break legitimate decodes.
        const w = new BinaryWriter()
        w.tag(1, 2).string('hello')
        w.tag(2, 0).int32(42)
        w.tag(3, 5).fixed32(0xdeadbeef)
        const buf = w.finish()
        const r = new BinaryReader(buf)
        assert.equal(r.uint32(), 0x0a)
        assert.equal(r.string(), 'hello')
        assert.equal(r.uint32(), 0x10)
        assert.equal(r.int32(), 42)
        assert.equal(r.uint32(), 0x1d)
        assert.equal(r.fixed32(), 0xdeadbeef)
    })
})
