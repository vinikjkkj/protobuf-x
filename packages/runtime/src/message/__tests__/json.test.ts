import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { BinaryWriter } from '../../binary/writer.js'
import type { MessageDescriptor } from '../../types/descriptors.js'
import { Message } from '../base.js'

class ChildMsg extends Message<ChildMsg> {
    count = 0n

    constructor(init?: Partial<ChildMsg>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor: MessageDescriptor = {
        name: 'ChildMsg',
        fields: [],
        oneofs: [],
        nestedTypes: new Map(),
        nestedEnums: new Map()
    }

    static encode(_msg: ChildMsg, w?: BinaryWriter): BinaryWriter {
        return w ?? BinaryWriter.create()
    }

    static decode(): ChildMsg {
        return new ChildMsg()
    }
}

class ParentMsg extends Message<ParentMsg> {
    total = 0n
    child?: ChildMsg
    values: bigint[] = []
    children: ChildMsg[] = []
    data = new Uint8Array(0)

    constructor(init?: Partial<ParentMsg>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor: MessageDescriptor = {
        name: 'ParentMsg',
        fields: [],
        oneofs: [],
        nestedTypes: new Map(),
        nestedEnums: new Map()
    }

    static encode(_msg: ParentMsg, w?: BinaryWriter): BinaryWriter {
        return w ?? BinaryWriter.create()
    }

    static decode(): ParentMsg {
        return new ParentMsg()
    }
}

describe('Message.toJSON', () => {
    it('serializes bigint fields into JSON-safe strings', () => {
        const msg = new ParentMsg({
            total: 9n,
            child: new ChildMsg({ count: -3n }),
            values: [1n, 2n],
            children: [new ChildMsg({ count: 4n })],
            data: new Uint8Array([1, 2, 3])
        })

        const json = msg.toJSON()

        assert.deepEqual(json, {
            total: '9',
            child: { count: '-3' },
            values: ['1', '2'],
            children: [{ count: '4' }],
            data: 'AQID'
        })
        assert.deepEqual(JSON.parse(JSON.stringify(json)), {
            total: '9',
            child: { count: '-3' },
            values: ['1', '2'],
            children: [{ count: '4' }],
            data: 'AQID'
        })
    })
})
