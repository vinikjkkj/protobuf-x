import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    generateEncodeField,
    generateDecodeField,
    getTypeScriptType,
    getWireType
} from '../field-codegen.js'
import type { ProtoField } from '../field-codegen.js'

function makeField(
    overrides: Partial<ProtoField> & Pick<ProtoField, 'name' | 'number' | 'type'>
): ProtoField {
    return {
        label: 'optional',
        isEnum: false,
        isMessage: false,
        ...overrides
    }
}

describe('advanced field code generation cases', () => {
    it('treats unknown field types as length-delimited by default', () => {
        const field = makeField({ name: 'value', number: 1, type: 'CustomType' })

        assert.equal(getWireType(field), 2)
    })

    it('renders map fields with message values using the message type in TypeScript', () => {
        const field = makeField({
            name: 'entries',
            number: 1,
            type: 'map',
            mapKeyType: 'string',
            mapValueType: 'MyMessage'
        })

        assert.equal(getTypeScriptType(field), 'Map<string, MyMessage>')
    })

    it('uses start-group wire type and group-aware encode/decode for deprecated groups', () => {
        const field = makeField({
            name: 'contact',
            number: 1,
            type: 'Contact',
            isMessage: true,
            isGroup: true
        })

        const encodeCode = generateEncodeField(field, 'Person').join('\n')
        const decodeCode = generateDecodeField(field).join('\n')

        assert.equal(getWireType(field), 3)
        assert.ok(
            encodeCode.includes(
                'w.raw(_fd_Person_contact.tag); Contact.encode(msg.contact, w); w.tag(1, 4);'
            )
        )
        assert.ok(decodeCode.includes('msg.contact = Contact.decode(r.group(1));'))
    })

    it('generates map encoding for 64-bit keys and message values', () => {
        const field = makeField({
            name: 'entries',
            number: 1,
            type: 'map',
            mapKeyType: 'int64',
            mapValueType: 'MyMessage'
        })

        const code = generateEncodeField(field, 'Msg').join('\n')

        assert.ok(code.includes('Number(k & 0xFFFFFFFFn)'))
        assert.ok(code.includes('MyMessage.encode(v, w)'))
        assert.ok(code.includes('w.join()'))
    })

    it('generates map decoding that preserves the submessage payload view', () => {
        const field = makeField({
            name: 'entries',
            number: 1,
            type: 'map',
            mapKeyType: 'string',
            mapValueType: 'MyMessage'
        })

        const code = generateDecodeField(field).join('\n')

        assert.ok(code.includes('MyMessage.decodeFrom(r, r.pos + _len)'))
        assert.ok(code.includes('r.skipTag(mt)'))
    })

    it('generates packed repeated 64-bit decoding that also accepts unpacked input', () => {
        const field = makeField({
            name: 'ids',
            number: 1,
            type: 'int64',
            label: 'repeated',
            packed: true
        })

        const code = generateDecodeField(field).join('\n')

        assert.ok(code.includes('if ((tag & 7) === 2)'))
        assert.ok(code.includes('const pLen = r.uint32()'))
        assert.ok(code.includes('} else {'))
        assert.ok(code.includes('r.int64BigInt()'))
    })

    it('generates signed 64-bit reconstruction with sign extension', () => {
        const field = makeField({ name: 'delta', number: 1, type: 'int64' })

        const code = generateDecodeField(field).join('\n')

        assert.ok(code.includes('msg.delta = r.int64BigInt()'))
    })

    it('generates presence-aware enum encoding checks', () => {
        const field = makeField({
            name: 'status',
            number: 2,
            type: 'Status',
            isEnum: true,
            hasPresence: true
        })

        const code = generateEncodeField(field, 'Msg').join('\n')

        // Loose `!= null` (catches both null and undefined) since the I-peer
        // interface declares fields as `T | null`.
        assert.ok(code.includes('msg.status != null'))
        assert.ok(code.includes('w.uint32(msg.status as number)'))
    })
})
