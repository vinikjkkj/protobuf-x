import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import {
    encodeVarint32,
    decodeVarint32,
    encodeVarint64,
    decodeVarint64,
    varint32Size,
    varint64Size
} from '../varint.js'

describe('varint32', () => {
    const cases: [number, number[]][] = [
        [0, [0x00]],
        [1, [0x01]],
        [127, [0x7f]],
        [128, [0x80, 0x01]],
        [300, [0xac, 0x02]],
        [16384, [0x80, 0x80, 0x01]],
        [0xffffffff, [0xff, 0xff, 0xff, 0xff, 0x0f]]
    ]

    for (const [value, expected] of cases) {
        it(`encodes ${value}`, () => {
            const buf = new Uint8Array(10)
            const end = encodeVarint32(value, buf, 0)
            assert.equal(end, expected.length)
            assert.deepEqual([...buf.subarray(0, end)], expected)
        })

        it(`decodes ${value}`, () => {
            const buf = new Uint8Array(expected)
            const [decoded, end] = decodeVarint32(buf, 0)
            assert.equal(decoded, value >>> 0)
            assert.equal(end, expected.length)
        })
    }

    it('roundtrips all varint32 size boundaries', () => {
        const values = [
            0, 1, 127, 128, 16383, 16384, 2097151, 2097152, 268435455, 268435456, 0xffffffff
        ]
        for (const v of values) {
            const buf = new Uint8Array(10)
            const end = encodeVarint32(v, buf, 0)
            const [decoded] = decodeVarint32(buf, 0)
            assert.equal(decoded, v >>> 0, `roundtrip failed for ${v}`)
            assert.equal(end, varint32Size(v), `size mismatch for ${v}`)
        }
    })

    it('encodes/decodes at non-zero offset', () => {
        const buf = new Uint8Array(20)
        buf[0] = 0xff // garbage before
        const end = encodeVarint32(300, buf, 5)
        const [decoded, newPos] = decodeVarint32(buf, 5)
        assert.equal(decoded, 300)
        assert.equal(newPos, end)
    })
})

describe('varint64', () => {
    it('encodes and decodes zero', () => {
        const buf = new Uint8Array(10)
        const end = encodeVarint64(0, 0, buf, 0)
        assert.equal(end, 1)
        const [lo, hi, pos] = decodeVarint64(buf, 0)
        assert.equal(lo, 0)
        assert.equal(hi, 0)
        assert.equal(pos, 1)
    })

    it('encodes and decodes max uint64', () => {
        const buf = new Uint8Array(10)
        const end = encodeVarint64(0xffffffff, 0xffffffff, buf, 0)
        assert.equal(end, 10)
        const [lo, hi, pos] = decodeVarint64(buf, 0)
        assert.equal(lo, 0xffffffff)
        assert.equal(hi, 0xffffffff)
        assert.equal(pos, 10)
    })

    it('roundtrips various 64-bit values', () => {
        const cases: [number, number][] = [
            [1, 0],
            [0, 1],
            [0xffffffff, 0],
            [0, 0xffffffff],
            [0x12345678, 0x9abcdef0]
        ]
        for (const [lo, hi] of cases) {
            const buf = new Uint8Array(10)
            encodeVarint64(lo, hi, buf, 0)
            const [dlo, dhi] = decodeVarint64(buf, 0)
            assert.equal(dlo, lo >>> 0, `lo mismatch for [${lo}, ${hi}]`)
            assert.equal(dhi, hi >>> 0, `hi mismatch for [${lo}, ${hi}]`)
        }
    })
})

describe('varint sizes', () => {
    it('varint32Size returns correct sizes', () => {
        assert.equal(varint32Size(0), 1)
        assert.equal(varint32Size(127), 1)
        assert.equal(varint32Size(128), 2)
        assert.equal(varint32Size(16383), 2)
        assert.equal(varint32Size(16384), 3)
        assert.equal(varint32Size(0xffffffff), 5)
    })

    it('varint64Size returns correct sizes', () => {
        assert.equal(varint64Size(0, 0), 1)
        assert.equal(varint64Size(0xffffffff, 0), 5)
        assert.equal(varint64Size(0xffffffff, 0xffffffff), 10)
    })
})
