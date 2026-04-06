import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { BinaryReader } from '../../binary/reader.js'
import { BinaryWriter } from '../../binary/writer.js'
import type { MessageDescriptor } from '../../types/descriptors.js'
import { Message } from '../base.js'

class Inner extends Message<Inner> {
    x = 0

    constructor(init?: Partial<Inner>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor: MessageDescriptor = {
        name: 'Inner',
        fields: [],
        oneofs: [],
        nestedTypes: new Map(),
        nestedEnums: new Map()
    }

    static encode(msg: Inner, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.x !== 0) {
            w.raw(new Uint8Array([0x08]))
            w.uint32(msg.x)
        }
        return w
    }

    static decode(buf: Uint8Array): Inner {
        const r = BinaryReader.create(buf)
        const msg = new Inner()
        while (r.hasMore()) {
            const tag = r.uint32()
            if (tag >>> 3 === 1) msg.x = r.uint32()
            else r.skip(tag & 7)
        }
        return msg
    }
}

class Outer extends Message<Outer> {
    name = ''
    inner: Inner | undefined = undefined
    tags: string[] = []
    data: Uint8Array = new Uint8Array(0)

    constructor(init?: Partial<Outer>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor: MessageDescriptor = {
        name: 'Outer',
        fields: [],
        oneofs: [],
        nestedTypes: new Map(),
        nestedEnums: new Map()
    }

    static encode(msg: Outer, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.name !== '') {
            w.raw(new Uint8Array([0x0a]))
            w.string(msg.name)
        }
        if (msg.inner) {
            w.raw(new Uint8Array([0x12]))
            w.fork()
            Inner.encode(msg.inner, w)
            w.join()
        }
        for (const t of msg.tags) {
            w.raw(new Uint8Array([0x1a]))
            w.string(t)
        }
        if (msg.data.length > 0) {
            w.raw(new Uint8Array([0x22]))
            w.bytes(msg.data)
        }
        return w
    }

    static decode(buf: Uint8Array): Outer {
        const r = BinaryReader.create(buf)
        const msg = new Outer()
        while (r.hasMore()) {
            const tag = r.uint32()
            switch (tag >>> 3) {
                case 1:
                    msg.name = r.string()
                    break
                case 2:
                    msg.inner = Inner.decode(r.bytes())
                    break
                case 3:
                    msg.tags.push(r.string())
                    break
                case 4:
                    msg.data = r.bytes()
                    break
                default:
                    r.skip(tag & 7)
            }
        }
        return msg
    }
}

describe('Message advanced behavior', () => {
    it('serializes bytes, nested messages and repeated message fields to JSON', () => {
        class Container extends Message<Container> {
            items: Inner[] = []

            constructor(init?: Partial<Container>) {
                super()
                if (init) Object.assign(this, init)
            }

            static readonly descriptor: MessageDescriptor = {
                name: 'Container',
                fields: [],
                oneofs: [],
                nestedTypes: new Map(),
                nestedEnums: new Map()
            }

            static encode(_msg: Container, w?: BinaryWriter): BinaryWriter {
                return w ?? BinaryWriter.create()
            }

            static decode(): Container {
                return new Container()
            }
        }

        const msg = new Outer({
            name: 'test',
            inner: new Inner({ x: 42 }),
            data: new Uint8Array([1, 2, 3])
        })
        const json = msg.toJSON()
        assert.equal(json.data, 'AQID')
        assert.deepEqual(json.inner, { x: 42 })

        const container = new Container({ items: [new Inner({ x: 1 }), new Inner({ x: 2 })] })
        assert.deepEqual(container.toJSON().items, [{ x: 1 }, { x: 2 }])
    })

    it('handles Uint8Array base64 remainder branches', () => {
        assert.equal(new Outer({ data: new Uint8Array([0xff]) }).toJSON().data, '/w==')
        assert.equal(new Outer({ data: new Uint8Array([0xff, 0xfe]) }).toJSON().data, '//4=')
        assert.equal(new Outer({ data: new Uint8Array([1, 2, 3, 4]) }).toJSON().data, 'AQIDBA==')
        assert.equal(new Outer({ data: new Uint8Array([1, 2, 3, 4, 5]) }).toJSON().data, 'AQIDBAU=')
    })

    it('merges repeated and nested message fields correctly', () => {
        const msg = new Outer({ tags: ['a', 'b'], inner: new Inner({ x: 1 }) })
        msg.merge({ tags: ['c'], inner: new Inner({ x: 5 }) } as Partial<Outer>)
        assert.deepEqual(msg.tags, ['a', 'b', 'c'])
        assert.equal(msg.inner?.x, 5)

        const empty = new Outer({ name: 'test' })
        empty.merge({ inner: new Inner({ x: 10 }), name: undefined } as Partial<Outer>)
        assert.equal(empty.inner?.x, 10)
        assert.equal(empty.name, 'test')
    })

    it('freezes primitive and nested object properties deeply', () => {
        class NestMsg extends Message<NestMsg> {
            nested: Record<string, unknown> = {}
            name = ''
            count = 0
            active = false

            constructor(init?: Partial<NestMsg>) {
                super()
                if (init) Object.assign(this, init)
            }

            static readonly descriptor: MessageDescriptor = {
                name: 'NestMsg',
                fields: [],
                oneofs: [],
                nestedTypes: new Map(),
                nestedEnums: new Map()
            }

            static encode(_msg: NestMsg, w?: BinaryWriter): BinaryWriter {
                return w ?? BinaryWriter.create()
            }

            static decode(): NestMsg {
                return new NestMsg()
            }
        }

        const msg = new NestMsg({
            nested: { x: 1, y: { z: 2 } },
            name: 'test',
            count: 42,
            active: true
        })
        const frozen = msg.freeze()
        assert.ok(Object.isFrozen(frozen))
        assert.ok(Object.isFrozen(msg.nested))
        assert.ok(Object.isFrozen((msg.nested as { y: object }).y))
        assert.equal(frozen.name, 'test')
        assert.equal(frozen.count, 42)
        assert.equal(frozen.active, true)
    })

    it('clones and compares complex messages correctly', () => {
        const a = new Outer({
            name: 'complex',
            inner: new Inner({ x: 99 }),
            tags: ['x', 'y'],
            data: new Uint8Array([10, 20])
        })
        const b = new Outer({
            name: 'complex',
            inner: new Inner({ x: 99 }),
            tags: ['x', 'y'],
            data: new Uint8Array([10, 20])
        })

        const cloned = a.clone()
        assert.equal(a.equals(b), true)
        assert.notEqual(cloned, a)
        assert.equal(cloned.name, 'complex')
    })
})
