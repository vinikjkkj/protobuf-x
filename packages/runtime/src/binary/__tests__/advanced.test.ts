import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { BinaryReader } from '../reader.js'
import { decodeVarint32, decodeVarint64, varint64Size } from '../varint.js'
import { tagFieldNumber, tagWireType, WireType } from '../wire-type.js'
import { BinaryWriter } from '../writer.js'

describe('BinaryReader advanced behavior', () => {
    it('reads sfixed32', () => {
        const w = BinaryWriter.create()
        w.sfixed32(-42)
        const r = BinaryReader.create(w.finish())
        assert.equal(r.sfixed32(), -42)
    })

    it('reads uint64, sint64 and sfixed64 values', () => {
        let w = BinaryWriter.create()
        w.uint64(0xdeadbeef, 0x01)
        let r = BinaryReader.create(w.finish())
        assert.deepEqual(r.uint64(), [0xdeadbeef, 0x01])

        w = BinaryWriter.create()
        w.sint64(1, 0)
        r = BinaryReader.create(w.finish())
        assert.deepEqual(r.sint64(), [1, 0])

        w = BinaryWriter.create()
        w.fixed64(0x12345678, 0x9abcdef0)
        r = BinaryReader.create(w.finish())
        assert.deepEqual(r.sfixed64(), [0x12345678, 0x9abcdef0])
    })

    it('creates subReaders over nested messages', () => {
        const inner = BinaryWriter.create()
        inner.uint32(42)

        const outer = BinaryWriter.create()
        outer.bytes(inner.finish())

        const sub = BinaryReader.create(outer.finish()).subReader()
        assert.equal(sub.uint32(), 42)
    })

    it('reads and skips deprecated group fields', () => {
        const w = BinaryWriter.create()
        w.tag(1, WireType.StartGroup)
        w.tag(2, WireType.Varint).uint32(42)
        w.tag(1, WireType.EndGroup)
        w.tag(3, WireType.Varint).uint32(7)

        const buf = w.finish()

        const r = BinaryReader.create(buf)
        const groupTag = r.uint32()
        assert.equal(tagFieldNumber(groupTag), 1)
        assert.equal(tagWireType(groupTag), WireType.StartGroup)

        const group = r.group(1)
        const groupReader = BinaryReader.create(group)
        const nestedTag = groupReader.uint32()
        assert.equal(tagFieldNumber(nestedTag), 2)
        assert.equal(tagWireType(nestedTag), WireType.Varint)
        assert.equal(groupReader.uint32(), 42)

        const trailingTag = r.uint32()
        assert.equal(tagFieldNumber(trailingTag), 3)
        assert.equal(r.uint32(), 7)

        const r2 = BinaryReader.create(buf)
        r2.skipTag(r2.uint32())
        assert.equal(tagFieldNumber(r2.uint32()), 3)
        assert.equal(r2.uint32(), 7)
    })

    it('exposes unread bytes as a zero-copy view', () => {
        const w = BinaryWriter.create()
        w.uint32(150).bytes(new Uint8Array([9, 8, 7]))

        const buf = w.finish()
        const r = BinaryReader.create(buf)
        assert.equal(r.uint32(), 150)

        const view = r.view()
        assert.deepEqual([...view], [3, 9, 8, 7])
        assert.equal(view.buffer, buf.buffer)

        const sub = BinaryReader.create(view).subReader()
        assert.deepEqual([...sub.view()], [9, 8, 7])
    })

    it('skips varint and 64-bit fields and rejects unknown wire types', () => {
        let w = BinaryWriter.create()
        w.uint32(999).uint32(42)
        let r = BinaryReader.create(w.finish())
        r.skip(WireType.Varint)
        assert.equal(r.uint32(), 42)

        w = BinaryWriter.create()
        w.fixed64(0, 0).uint32(42)
        r = BinaryReader.create(w.finish())
        r.skip(WireType.Bit64)
        assert.equal(r.uint32(), 42)

        assert.throws(() => BinaryReader.create(new Uint8Array([0])).skip(99), /Unknown wire type/)
    })
})

describe('BinaryWriter advanced behavior', () => {
    it('roundtrips uint64, sint64 and sfixed32 writes', () => {
        let w = BinaryWriter.create()
        w.uint64(0xffffffff, 0x01)
        let r = BinaryReader.create(w.finish())
        assert.deepEqual(r.uint64(), [0xffffffff, 0x01])

        w = BinaryWriter.create()
        w.sint64(0xfffffffe, 0xffffffff)
        r = BinaryReader.create(w.finish())
        assert.deepEqual(r.sint64(), [0xfffffffe, 0xffffffff])

        w = BinaryWriter.create()
        w.sfixed32(-100)
        r = BinaryReader.create(w.finish())
        assert.equal(r.sfixed32(), -100)
    })

    it('joins empty and non-empty subwriters on an empty parent', () => {
        const emptyParent = BinaryWriter.create()
        emptyParent.fork()
        emptyParent.join()
        const emptyJoined = emptyParent.finish()
        assert.deepEqual([...emptyJoined], [0])

        const parent = BinaryWriter.create()
        parent.fork()
        parent.uint32(1).uint32(2).uint32(3)
        parent.join()
        const buf = parent.finish()
        assert.deepEqual([...buf], [3, 1, 2, 3])
    })
})

describe('wire-type helpers', () => {
    it('extracts the field number and wire type from tags', () => {
        assert.equal(tagFieldNumber(0x08), 1)
        assert.equal(tagFieldNumber(0x12), 2)
        assert.equal(tagWireType(0x08), WireType.Varint)
        assert.equal(tagWireType(0x0a), WireType.LengthDelimited)
        assert.equal(tagWireType(0x0d), WireType.Bit32)
        assert.equal(tagWireType(0x09), WireType.Bit64)
    })
})

describe('varint edge cases', () => {
    it('rejects overlong varint32 and varint64 encodings', () => {
        const buf = new Uint8Array(11).fill(0x80)
        assert.throws(() => decodeVarint32(buf, 0), /too long/i)
        assert.throws(() => decodeVarint64(buf, 0), /too long/i)
    })

    it('covers varint64 size branches for large hi values', () => {
        assert.equal(varint64Size(0, 0x07), 5)
        assert.equal(varint64Size(0, 0x08), 6)
        assert.equal(varint64Size(0, 0x400), 7)
        assert.equal(varint64Size(0, 0x20000), 8)
        assert.equal(varint64Size(0, 0x1000000), 9)
        assert.equal(varint64Size(0, 0x80000000), 10)
        assert.equal(varint64Size(127, 0), 1)
        assert.equal(varint64Size(128, 0), 2)
    })
})
