import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ProtoField } from '../field-codegen.js'
import {
    generateOneofCaseEnum,
    generateOneofType,
    getOneofFieldDeclaration,
    generateOneofEncodeLines,
    generateOneofDecodeLines
} from '../oneof-codegen.js'
import type { ProtoOneof } from '../oneof-codegen.js'

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

describe('oneof code generation helpers', () => {
    it('generates case enums and discriminated union declarations', () => {
        const oneof: ProtoOneof = {
            name: 'result',
            fields: [
                makeField({ name: 'text', number: 2, type: 'string' }),
                makeField({ name: 'code', number: 3, type: 'int32' })
            ]
        }

        const caseEnum = generateOneofCaseEnum(oneof, 'Response')
        const unionType = generateOneofType(oneof, 'Response')
        const declaration = getOneofFieldDeclaration(oneof, 'Response')

        assert.ok(caseEnum.includes('Response_ResultCase'))
        assert.ok(caseEnum.includes('TEXT = 2'))
        assert.ok(caseEnum.includes('CODE = 3'))
        assert.ok(unionType.includes("case: 'text'"))
        assert.ok(unionType.includes("case: 'code'"))
        assert.ok(unionType.includes('case: undefined'))
        assert.equal(declaration, 'result: Response_Result = { case: undefined };')
    })

    it('generates encode lines for message and enum branches', () => {
        const oneof: ProtoOneof = {
            name: 'value',
            fields: [
                makeField({ name: 'inner', number: 1, type: 'Inner', isMessage: true }),
                makeField({ name: 'status', number: 2, type: 'Status', isEnum: true })
            ]
        }

        const code = generateOneofEncodeLines(oneof, 'Msg').join('\n')

        assert.ok(code.includes('Inner.encode'))
        assert.ok(code.includes('w.fork()'))
        assert.ok(code.includes('w.uint32(msg.value.value as number)'))
    })

    it('generates encode lines for 64-bit scalar branches', () => {
        const oneof: ProtoOneof = {
            name: 'value',
            fields: [makeField({ name: 'count', number: 1, type: 'int64' })]
        }

        const code = generateOneofEncodeLines(oneof, 'Msg').join('\n')

        assert.ok(code.includes('const value = msg.value.value as bigint;'))
        assert.ok(code.includes('w.uint64'))
        assert.ok(code.includes('0xFFFFFFFFn'))
    })

    it('generates group-aware oneof message branches', () => {
        const oneof: ProtoOneof = {
            name: 'value',
            fields: [
                makeField({
                    name: 'contact',
                    number: 1,
                    type: 'Contact',
                    isMessage: true,
                    isGroup: true
                })
            ]
        }

        const encodeCode = generateOneofEncodeLines(oneof, 'Msg').join('\n')
        const decodeCode = generateOneofDecodeLines(oneof, 'Msg').join('\n')

        assert.ok(encodeCode.includes('Contact.encode(msg.value.value as Contact, w);'))
        assert.ok(encodeCode.includes('w.tag(1, 4);'))
        assert.ok(decodeCode.includes('value: Contact.decode(r.group(1))'))
    })

    it('generates decode lines for message and enum branches', () => {
        const oneof: ProtoOneof = {
            name: 'value',
            fields: [
                makeField({ name: 'inner', number: 1, type: 'Inner', isMessage: true }),
                makeField({ name: 'status', number: 2, type: 'Status', isEnum: true })
            ]
        }

        const code = generateOneofDecodeLines(oneof, 'Msg').join('\n')

        assert.ok(
            code.includes(
                "case 1: { const _len = r.uint32(); msg.value = { case: 'inner', value: Inner.decodeFrom(r, r.pos + _len) }; break; }"
            )
        )
        assert.ok(code.includes("case 2: msg.value = { case: 'status', value: r.uint32() };"))
    })

    it('generates decode lines for 64-bit scalar branches', () => {
        const oneof: ProtoOneof = {
            name: 'value',
            fields: [makeField({ name: 'count', number: 1, type: 'int64' })]
        }

        const code = generateOneofDecodeLines(oneof, 'Msg').join('\n')

        assert.ok(code.includes('r.int64BigInt()'))
        assert.ok(code.includes("case: 'count'"))
    })

    it('generates decode lines for scalar and bytes helpers', () => {
        const oneof: ProtoOneof = {
            name: 'value',
            fields: [
                makeField({ name: 'text', number: 1, type: 'string' }),
                makeField({ name: 'flag', number: 2, type: 'bool' }),
                makeField({ name: 'data', number: 3, type: 'bytes' }),
                makeField({ name: 'score', number: 4, type: 'double' })
            ]
        }

        const code = generateOneofDecodeLines(oneof, 'Msg').join('\n')

        assert.ok(code.includes('r.string()'))
        assert.ok(code.includes('r.bool()'))
        assert.ok(code.includes('r.bytes()'))
        assert.ok(code.includes('r.double()'))
    })
})
