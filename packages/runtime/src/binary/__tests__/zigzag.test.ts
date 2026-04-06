import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { zigzagEncode32, zigzagDecode32, zigzagEncode64, zigzagDecode64 } from '../zigzag.js'

describe('zigzag32', () => {
    const cases: [number, number][] = [
        [0, 0],
        [-1, 1],
        [1, 2],
        [-2, 3],
        [2147483647, 4294967294], // INT32_MAX
        [-2147483648, 4294967295] // INT32_MIN
    ]

    for (const [signed, unsigned] of cases) {
        it(`encodes ${signed} to ${unsigned}`, () => {
            assert.equal(zigzagEncode32(signed), unsigned)
        })

        it(`decodes ${unsigned} to ${signed}`, () => {
            assert.equal(zigzagDecode32(unsigned), signed)
        })
    }

    it('roundtrips all test values', () => {
        const values = [0, 1, -1, 100, -100, 2147483647, -2147483648]
        for (const v of values) {
            assert.equal(zigzagDecode32(zigzagEncode32(v)), v, `roundtrip failed for ${v}`)
        }
    })
})

describe('zigzag64', () => {
    it('encodes and decodes zero', () => {
        const [elo, ehi] = zigzagEncode64(0, 0)
        assert.equal(elo, 0)
        assert.equal(ehi, 0)
        const [dlo, dhi] = zigzagDecode64(elo, ehi)
        assert.equal(dlo, 0)
        assert.equal(dhi, 0)
    })

    it('encodes and decodes -1 (all bits set)', () => {
        // -1 in two's complement: lo=0xFFFFFFFF, hi=0xFFFFFFFF
        const [elo, ehi] = zigzagEncode64(0xffffffff, 0xffffffff)
        assert.equal(elo, 1) // zigzag(-1) = 1
        assert.equal(ehi, 0)
        const [dlo, dhi] = zigzagDecode64(elo, ehi)
        assert.equal(dlo, 0xffffffff)
        assert.equal(dhi, 0xffffffff)
    })

    it('encodes and decodes 1', () => {
        const [elo, ehi] = zigzagEncode64(1, 0)
        assert.equal(elo, 2)
        assert.equal(ehi, 0)
        const [dlo, dhi] = zigzagDecode64(elo, ehi)
        assert.equal(dlo, 1)
        assert.equal(dhi, 0)
    })

    it('roundtrips various values', () => {
        const cases: [number, number][] = [
            [0, 0],
            [1, 0],
            [0xffffffff, 0xffffffff], // -1
            [0xfffffffe, 0xffffffff], // -2
            [0x12345678, 0]
        ]
        for (const [lo, hi] of cases) {
            const [elo, ehi] = zigzagEncode64(lo, hi)
            const [dlo, dhi] = zigzagDecode64(elo, ehi)
            assert.equal(dlo, lo >>> 0, `lo roundtrip failed for [${lo}, ${hi}]`)
            assert.equal(dhi, hi >>> 0, `hi roundtrip failed for [${lo}, ${hi}]`)
        }
    })
})
