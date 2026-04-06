import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { encodeUtf8, decodeUtf8, utf8ByteLength } from '../utf8.js'

describe('utf8', () => {
    const cases: [string, number][] = [
        ['', 0],
        ['hello', 5],
        ['cafe\u0301', 6], // 'é' as combining character
        ['protobuf-x', 10],
        ['\u00e9', 2], // 'é' precomposed
        ['\u4e16\u754c', 6], // '世界' (Chinese)
        ['🚀', 4] // emoji (4-byte UTF-8)
    ]

    for (const [str, expectedLen] of cases) {
        it(`encodes/decodes "${str}" (${expectedLen} bytes)`, () => {
            const encoded = encodeUtf8(str)
            assert.equal(encoded.length, expectedLen)
            const decoded = decodeUtf8(encoded)
            assert.equal(decoded, str)
        })

        it(`utf8ByteLength("${str}") = ${expectedLen}`, () => {
            assert.equal(utf8ByteLength(str), expectedLen)
        })
    }

    it('decodes a subarray', () => {
        const buf = encodeUtf8('hello world')
        const sub = decodeUtf8(buf, 6, 11)
        assert.equal(sub, 'world')
    })
})
