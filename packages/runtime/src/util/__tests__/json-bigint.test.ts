import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { toJSON } from '../json.js'

describe('toJSON bigint handling', () => {
    it('converts bigint values to decimal strings recursively', () => {
        const json = toJSON({
            total: 42n,
            nested: { delta: -7n },
            values: [1n, 2n, 3n],
            payloads: [new Uint8Array([1, 2, 3])]
        })

        assert.deepEqual(json, {
            total: '42',
            nested: { delta: '-7' },
            values: ['1', '2', '3'],
            payloads: ['AQID']
        })

        assert.equal(
            JSON.stringify(json),
            '{"total":"42","nested":{"delta":"-7"},"values":["1","2","3"],"payloads":["AQID"]}'
        )
    })
})
