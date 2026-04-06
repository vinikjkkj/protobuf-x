import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { BinaryReader } from '../../binary/reader.js'
import { BinaryWriter } from '../../binary/writer.js'
import type { MessageDescriptor } from '../../types/descriptors.js'
import type { ExtensionFieldInfo } from '../../types/extension.js'
import { Message } from '../base.js'

// Minimal extendable message class for testing
class ExtendableMsg extends Message<ExtendableMsg> {
    name = ''

    constructor(init?: Partial<ExtendableMsg>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor: MessageDescriptor = {
        name: 'ExtendableMsg',
        fields: [],
        oneofs: [],
        nestedTypes: new Map(),
        nestedEnums: new Map(),
        extensionRanges: [{ from: 100, to: 199 }]
    }

    static encode(msg: ExtendableMsg, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.name !== '') {
            w.raw(new Uint8Array([0x0a])) // field 1, LEN
            w.string(msg.name)
        }
        return w
    }

    static decode(buf: Uint8Array, length?: number): ExtendableMsg {
        const r = BinaryReader.create(buf, length)
        const msg = new ExtendableMsg()
        while (r.hasMore()) {
            const tag = r.uint32()
            switch (tag >>> 3) {
                case 1:
                    msg.name = r.string()
                    break
                default:
                    r.skip(tag & 7)
                    break
            }
        }
        return msg
    }
}

// A string extension field at field number 100
const extraName: ExtensionFieldInfo<string> = {
    fieldNumber: 100,
    fieldName: 'extra_name',
    extendee: 'ExtendableMsg',
    defaultValue: '',
    encode(value: string, writer: BinaryWriter): void {
        writer.uint32((100 << 3) | 2) // field 100, LEN
        writer.string(value)
    },
    decode(reader: BinaryReader): string {
        return reader.string()
    }
}

// An int32 extension field at field number 101
const extraAge: ExtensionFieldInfo<number> = {
    fieldNumber: 101,
    fieldName: 'extra_age',
    extendee: 'ExtendableMsg',
    defaultValue: 0,
    encode(value: number, writer: BinaryWriter): void {
        writer.uint32((101 << 3) | 0) // field 101, VARINT
        writer.uint32(value)
    },
    decode(reader: BinaryReader): number {
        return reader.uint32()
    }
}

describe('Message extensions', () => {
    it('returns undefined for unset extension', () => {
        const msg = new ExtendableMsg({ name: 'test' })
        assert.equal(msg.getExtension(extraName), undefined)
        assert.equal(msg.hasExtension(extraName), false)
    })

    it('sets and gets a string extension', () => {
        const msg = new ExtendableMsg({ name: 'test' })
        msg.setExtension(extraName, 'hello')
        assert.equal(msg.getExtension(extraName), 'hello')
        assert.equal(msg.hasExtension(extraName), true)
    })

    it('sets and gets a numeric extension', () => {
        const msg = new ExtendableMsg()
        msg.setExtension(extraAge, 42)
        assert.equal(msg.getExtension(extraAge), 42)
        assert.equal(msg.hasExtension(extraAge), true)
    })

    it('clears an extension', () => {
        const msg = new ExtendableMsg()
        msg.setExtension(extraName, 'hello')
        assert.equal(msg.hasExtension(extraName), true)
        msg.clearExtension(extraName)
        assert.equal(msg.hasExtension(extraName), false)
        assert.equal(msg.getExtension(extraName), undefined)
    })

    it('supports multiple extensions on the same message', () => {
        const msg = new ExtendableMsg({ name: 'base' })
        msg.setExtension(extraName, 'extended')
        msg.setExtension(extraAge, 25)
        assert.equal(msg.getExtension(extraName), 'extended')
        assert.equal(msg.getExtension(extraAge), 25)
        assert.equal(msg.name, 'base')
    })

    it('overwrites an extension value', () => {
        const msg = new ExtendableMsg()
        msg.setExtension(extraName, 'first')
        msg.setExtension(extraName, 'second')
        assert.equal(msg.getExtension(extraName), 'second')
    })

    it('exposes internal extensions map via _getExtensionsMap', () => {
        const msg = new ExtendableMsg()
        assert.equal(msg._getExtensionsMap(), undefined)

        msg.setExtension(extraName, 'test')
        const map = msg._getExtensionsMap()
        assert.ok(map !== undefined)
        assert.equal(map.size, 1)
        assert.equal(map.get(100), 'test')
    })

    it('clearing all extensions leaves map empty', () => {
        const msg = new ExtendableMsg()
        msg.setExtension(extraName, 'a')
        msg.setExtension(extraAge, 1)
        msg.clearExtension(extraName)
        msg.clearExtension(extraAge)
        assert.equal(msg.hasExtension(extraName), false)
        assert.equal(msg.hasExtension(extraAge), false)
    })

    it('does not interfere with regular message fields', () => {
        const msg = new ExtendableMsg({ name: 'regular' })
        msg.setExtension(extraName, 'extended')
        assert.equal(msg.name, 'regular')
        assert.equal(msg.getExtension(extraName), 'extended')

        const bytes = msg.toBinary()
        const decoded = ExtendableMsg.decode(bytes)
        assert.equal(decoded.name, 'regular')
        // Extensions are not automatically decoded since they need registration
        assert.equal(decoded.hasExtension(extraName), false)
    })

    it('extension encode produces valid wire format', () => {
        const writer = BinaryWriter.create()
        extraName.encode('hello', writer)
        const bytes = writer.finish()
        assert.ok(bytes.length > 0)

        // Verify we can decode the tag and value
        const reader = BinaryReader.create(bytes)
        const tag = reader.uint32()
        assert.equal(tag >>> 3, 100) // field number
        assert.equal(tag & 7, 2) // LEN wire type
        const val = reader.string()
        assert.equal(val, 'hello')
    })
})
