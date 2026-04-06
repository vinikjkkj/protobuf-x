import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { encodeBase64, decodeBase64 } from '../base64.js'

describe('base64', () => {
    const cases: [Uint8Array, string][] = [
        [new Uint8Array([]), ''],
        [new Uint8Array([102]), 'Zg=='],
        [new Uint8Array([102, 111]), 'Zm8='],
        [new Uint8Array([102, 111, 111]), 'Zm9v'],
        [new Uint8Array([0, 1, 2, 3, 4, 5]), 'AAECAwQF'],
        [new Uint8Array([255, 254, 253]), '//79']
    ]

    for (const [bytes, b64] of cases) {
        it(`encodes [${[...bytes]}] to "${b64}"`, () => {
            assert.equal(encodeBase64(bytes), b64)
        })

        it(`decodes "${b64}" to [${[...bytes]}]`, () => {
            assert.deepEqual([...decodeBase64(b64)], [...bytes])
        })
    }

    it('roundtrips random data', () => {
        const data = new Uint8Array(256)
        for (let i = 0; i < 256; i++) data[i] = i
        const encoded = encodeBase64(data)
        const decoded = decodeBase64(encoded)
        assert.deepEqual([...decoded], [...data])
    })
})
