import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { BinaryReader } from '../../binary/reader.js'
import { BinaryWriter } from '../../binary/writer.js'
import type { MessageDescriptor } from '../../types/descriptors.js'
import { Message } from '../base.js'

// Minimal test message class
class TestMsg extends Message<TestMsg> {
    name = ''
    age = 0

    constructor(init?: Partial<TestMsg>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor: MessageDescriptor = {
        name: 'TestMsg',
        fields: [],
        oneofs: [],
        nestedTypes: new Map(),
        nestedEnums: new Map()
    }

    static encode(msg: TestMsg, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.name !== '') {
            w.raw(new Uint8Array([0x0a])) // field 1, LEN
            w.string(msg.name)
        }
        if (msg.age !== 0) {
            w.raw(new Uint8Array([0x10])) // field 2, VARINT
            w.uint32(msg.age)
        }
        return w
    }

    static decode(buf: Uint8Array, length?: number): TestMsg {
        const r = BinaryReader.create(buf, length)
        const msg = new TestMsg()
        while (r.hasMore()) {
            const tag = r.uint32()
            switch (tag >>> 3) {
                case 1:
                    msg.name = r.string()
                    break
                case 2:
                    msg.age = r.uint32()
                    break
                default:
                    r.skip(tag & 7)
            }
        }
        return msg
    }
}

describe('Message base class', () => {
    it('encode/decode roundtrip via instance methods', () => {
        const msg = new TestMsg({ name: 'Alice', age: 30 })
        const bytes = msg.toBinary()
        const decoded = TestMsg.decode(bytes)
        assert.equal(decoded.name, 'Alice')
        assert.equal(decoded.age, 30)
    })

    it('clone produces equal but distinct instance', () => {
        const msg = new TestMsg({ name: 'Bob', age: 25 })
        const cloned = msg.clone()
        assert.equal(cloned.name, 'Bob')
        assert.equal(cloned.age, 25)
        assert.notEqual(cloned, msg)
    })

    it('equals returns true for identical messages', () => {
        const a = new TestMsg({ name: 'Test', age: 42 })
        const b = new TestMsg({ name: 'Test', age: 42 })
        assert.equal(a.equals(b), true)
    })

    it('equals returns false for different messages', () => {
        const a = new TestMsg({ name: 'A', age: 1 })
        const b = new TestMsg({ name: 'B', age: 2 })
        assert.equal(a.equals(b), false)
    })

    it('merge overwrites scalar fields', () => {
        const msg = new TestMsg({ name: 'Original', age: 10 })
        msg.merge({ name: 'Updated' })
        assert.equal(msg.name, 'Updated')
        assert.equal(msg.age, 10) // unchanged
    })

    it('toJSON produces plain object', () => {
        const msg = new TestMsg({ name: 'JSON', age: 99 })
        const json = msg.toJSON()
        assert.deepEqual(json, { name: 'JSON', age: 99 })
    })

    it('patch applies partial update', () => {
        const msg = new TestMsg({ name: 'Before', age: 1 })
        msg.patch({ age: 2 })
        assert.equal(msg.name, 'Before')
        assert.equal(msg.age, 2)
    })

    it('freeze makes message immutable', () => {
        const msg = new TestMsg({ name: 'Frozen', age: 0 })
        msg.freeze()
        assert.throws(() => {
            ;(msg as { name: string }).name = 'Mutated'
        })
    })
})
