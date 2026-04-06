import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    computeTagBytes,
    getWireType,
    getTypeScriptType,
    getDefaultValue,
    getWriterMethod,
    getReaderMethod,
    is64BitLoHi,
    isScalarType,
    scalarToTsType,
    generateFieldDescriptor,
    generateEncodeField,
    generateDecodeField
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

describe('computeTagBytes', () => {
    it('should compute field 1, varint (wire 0) = [0x08]', () => {
        assert.deepEqual(computeTagBytes(1, 0), [0x08])
    })

    it('should compute field 1, LEN (wire 2) = [0x0a]', () => {
        assert.deepEqual(computeTagBytes(1, 2), [0x0a])
    })

    it('should compute field 2, varint (wire 0) = [0x10]', () => {
        assert.deepEqual(computeTagBytes(2, 0), [0x10])
    })

    it('should compute field 2, LEN (wire 2) = [0x12]', () => {
        assert.deepEqual(computeTagBytes(2, 2), [0x12])
    })

    it('should compute field 1, 32-bit (wire 5) = [0x0d]', () => {
        assert.deepEqual(computeTagBytes(1, 5), [0x0d])
    })

    it('should compute field 1, 64-bit (wire 1) = [0x09]', () => {
        assert.deepEqual(computeTagBytes(1, 1), [0x09])
    })

    it('should compute multi-byte tag for field 16', () => {
        // field 16, varint: (16 << 3) | 0 = 128 = 0x80
        // varint encoding: [0x80, 0x01]
        assert.deepEqual(computeTagBytes(16, 0), [0x80, 0x01])
    })

    it('should compute multi-byte tag for large field numbers', () => {
        // field 2047, varint: (2047 << 3) | 0 = 16376 = 0x3FF8
        // varint: [0xF8, 0x7F]
        const result = computeTagBytes(2047, 0)
        assert.equal(result.length, 2)
        assert.equal(result[0], 0xf8)
        assert.equal(result[1], 0x7f)
    })
})

describe('getWireType', () => {
    it('should return 0 (Varint) for int32', () => {
        assert.equal(getWireType(makeField({ name: 'x', number: 1, type: 'int32' })), 0)
    })

    it('should return 0 (Varint) for bool', () => {
        assert.equal(getWireType(makeField({ name: 'x', number: 1, type: 'bool' })), 0)
    })

    it('should return 0 (Varint) for enums', () => {
        assert.equal(
            getWireType(makeField({ name: 'x', number: 1, type: 'MyEnum', isEnum: true })),
            0
        )
    })

    it('should return 1 (Bit64) for double', () => {
        assert.equal(getWireType(makeField({ name: 'x', number: 1, type: 'double' })), 1)
    })

    it('should return 1 (Bit64) for fixed64', () => {
        assert.equal(getWireType(makeField({ name: 'x', number: 1, type: 'fixed64' })), 1)
    })

    it('should return 2 (LengthDelimited) for string', () => {
        assert.equal(getWireType(makeField({ name: 'x', number: 1, type: 'string' })), 2)
    })

    it('should return 2 (LengthDelimited) for bytes', () => {
        assert.equal(getWireType(makeField({ name: 'x', number: 1, type: 'bytes' })), 2)
    })

    it('should return 2 (LengthDelimited) for messages', () => {
        assert.equal(
            getWireType(makeField({ name: 'x', number: 1, type: 'MyMessage', isMessage: true })),
            2
        )
    })

    it('should return 5 (Bit32) for float', () => {
        assert.equal(getWireType(makeField({ name: 'x', number: 1, type: 'float' })), 5)
    })

    it('should return 5 (Bit32) for fixed32', () => {
        assert.equal(getWireType(makeField({ name: 'x', number: 1, type: 'fixed32' })), 5)
    })
})

describe('getTypeScriptType', () => {
    it('should map double to number', () => {
        assert.equal(scalarToTsType('double'), 'number')
    })

    it('should map float to number', () => {
        assert.equal(scalarToTsType('float'), 'number')
    })

    it('should map int32 to number', () => {
        assert.equal(scalarToTsType('int32'), 'number')
    })

    it('should map uint32 to number', () => {
        assert.equal(scalarToTsType('uint32'), 'number')
    })

    it('should map sint32 to number', () => {
        assert.equal(scalarToTsType('sint32'), 'number')
    })

    it('should map fixed32 to number', () => {
        assert.equal(scalarToTsType('fixed32'), 'number')
    })

    it('should map sfixed32 to number', () => {
        assert.equal(scalarToTsType('sfixed32'), 'number')
    })

    it('should map int64 to bigint', () => {
        assert.equal(scalarToTsType('int64'), 'bigint')
    })

    it('should map uint64 to bigint', () => {
        assert.equal(scalarToTsType('uint64'), 'bigint')
    })

    it('should map sint64 to bigint', () => {
        assert.equal(scalarToTsType('sint64'), 'bigint')
    })

    it('should map fixed64 to bigint', () => {
        assert.equal(scalarToTsType('fixed64'), 'bigint')
    })

    it('should map sfixed64 to bigint', () => {
        assert.equal(scalarToTsType('sfixed64'), 'bigint')
    })

    it('should map bool to boolean', () => {
        assert.equal(scalarToTsType('bool'), 'boolean')
    })

    it('should map string to string', () => {
        assert.equal(scalarToTsType('string'), 'string')
    })

    it('should map bytes to Uint8Array', () => {
        assert.equal(scalarToTsType('bytes'), 'Uint8Array')
    })

    it('should return repeated type as array', () => {
        const field = makeField({ name: 'tags', number: 1, type: 'string', label: 'repeated' })
        assert.equal(getTypeScriptType(field), 'string[]')
    })

    it('should return message type as-is', () => {
        const field = makeField({ name: 'addr', number: 1, type: 'Address', isMessage: true })
        assert.equal(getTypeScriptType(field), 'Address')
    })

    it('should return enum type as-is', () => {
        const field = makeField({ name: 'status', number: 1, type: 'Status', isEnum: true })
        assert.equal(getTypeScriptType(field), 'Status')
    })

    it('should handle map fields', () => {
        const field = makeField({
            name: 'labels',
            number: 1,
            type: 'bytes',
            mapKeyType: 'string',
            mapValueType: 'string'
        })
        assert.equal(getTypeScriptType(field), 'Map<string, string>')
    })
})

describe('getDefaultValue', () => {
    it('should return 0 for int32', () => {
        assert.equal(getDefaultValue(makeField({ name: 'x', number: 1, type: 'int32' })), '0')
    })

    it('should return 0n for int64', () => {
        assert.equal(getDefaultValue(makeField({ name: 'x', number: 1, type: 'int64' })), '0n')
    })

    it('should return false for bool', () => {
        assert.equal(getDefaultValue(makeField({ name: 'x', number: 1, type: 'bool' })), 'false')
    })

    it('should return empty string for string', () => {
        assert.equal(getDefaultValue(makeField({ name: 'x', number: 1, type: 'string' })), "''")
    })

    it('should return new Uint8Array(0) for bytes', () => {
        assert.equal(
            getDefaultValue(makeField({ name: 'x', number: 1, type: 'bytes' })),
            'new Uint8Array(0)'
        )
    })

    it('should return 0 for enum', () => {
        assert.equal(
            getDefaultValue(makeField({ name: 'x', number: 1, type: 'Status', isEnum: true })),
            '0'
        )
    })

    it('should return undefined for message', () => {
        assert.equal(
            getDefaultValue(makeField({ name: 'x', number: 1, type: 'Address', isMessage: true })),
            'undefined'
        )
    })

    it('should return [] for repeated', () => {
        assert.equal(
            getDefaultValue(makeField({ name: 'x', number: 1, type: 'string', label: 'repeated' })),
            '[]'
        )
    })

    it('should return new Map() for map', () => {
        assert.equal(
            getDefaultValue(
                makeField({
                    name: 'x',
                    number: 1,
                    type: 'bytes',
                    mapKeyType: 'string',
                    mapValueType: 'int32'
                })
            ),
            'new Map()'
        )
    })

    it('should use defaultValueExpr when provided (proto2 defaults)', () => {
        assert.equal(
            getDefaultValue(
                makeField({ name: 'retries', number: 1, type: 'int32', defaultValueExpr: '3' })
            ),
            '3'
        )
        assert.equal(
            getDefaultValue(
                makeField({
                    name: 'name',
                    number: 2,
                    type: 'string',
                    defaultValueExpr: '"unnamed"'
                })
            ),
            '"unnamed"'
        )
        assert.equal(
            getDefaultValue(
                makeField({ name: 'enabled', number: 3, type: 'bool', defaultValueExpr: 'true' })
            ),
            'true'
        )
        assert.equal(
            getDefaultValue(
                makeField({ name: 'rate', number: 4, type: 'double', defaultValueExpr: '1.5' })
            ),
            '1.5'
        )
    })
})

describe('getWriterMethod', () => {
    it('should return correct method for each scalar type', () => {
        assert.equal(getWriterMethod('double'), 'double')
        assert.equal(getWriterMethod('float'), 'float')
        assert.equal(getWriterMethod('int32'), 'int32')
        assert.equal(getWriterMethod('uint32'), 'uint32')
        assert.equal(getWriterMethod('sint32'), 'sint32')
        assert.equal(getWriterMethod('bool'), 'bool')
        assert.equal(getWriterMethod('string'), 'string')
        assert.equal(getWriterMethod('bytes'), 'bytes')
        assert.equal(getWriterMethod('fixed32'), 'fixed32')
        assert.equal(getWriterMethod('sfixed32'), 'sfixed32')
    })
})

describe('getReaderMethod', () => {
    it('should return correct method for each scalar type', () => {
        assert.equal(getReaderMethod('double'), 'double')
        assert.equal(getReaderMethod('float'), 'float')
        assert.equal(getReaderMethod('int32'), 'int32')
        assert.equal(getReaderMethod('uint32'), 'uint32')
        assert.equal(getReaderMethod('sint32'), 'sint32')
        assert.equal(getReaderMethod('bool'), 'bool')
        assert.equal(getReaderMethod('string'), 'string')
        assert.equal(getReaderMethod('bytes'), 'bytes')
        assert.equal(getReaderMethod('fixed32'), 'fixed32')
        assert.equal(getReaderMethod('sfixed32'), 'sfixed32')
    })
})

describe('is64BitLoHi', () => {
    it('should return true for 64-bit types', () => {
        assert.equal(is64BitLoHi('int64'), true)
        assert.equal(is64BitLoHi('uint64'), true)
        assert.equal(is64BitLoHi('sint64'), true)
        assert.equal(is64BitLoHi('fixed64'), true)
        assert.equal(is64BitLoHi('sfixed64'), true)
    })

    it('should return false for 32-bit types', () => {
        assert.equal(is64BitLoHi('int32'), false)
        assert.equal(is64BitLoHi('uint32'), false)
        assert.equal(is64BitLoHi('string'), false)
        assert.equal(is64BitLoHi('bool'), false)
        assert.equal(is64BitLoHi('double'), false)
    })
})

describe('isScalarType', () => {
    it('should return true for all scalar types', () => {
        for (const t of [
            'double',
            'float',
            'int32',
            'int64',
            'uint32',
            'uint64',
            'sint32',
            'sint64',
            'fixed32',
            'fixed64',
            'sfixed32',
            'sfixed64',
            'bool',
            'string',
            'bytes'
        ]) {
            assert.equal(isScalarType(t), true, `expected ${t} to be scalar`)
        }
    })

    it('should return false for non-scalar types', () => {
        assert.equal(isScalarType('MyMessage'), false)
        assert.equal(isScalarType('Status'), false)
    })
})

describe('generateFieldDescriptor', () => {
    it('should generate descriptor for string field', () => {
        const field = makeField({ name: 'name', number: 1, type: 'string' })
        const result = generateFieldDescriptor(field)
        assert.ok(result.includes('_fd_name'))
        assert.ok(result.includes('no: 1'))
        assert.ok(result.includes('wireType: 2'))
        assert.ok(result.includes('0x0a'))
    })

    it('should generate descriptor for int32 field', () => {
        const field = makeField({ name: 'age', number: 2, type: 'int32' })
        const result = generateFieldDescriptor(field)
        assert.ok(result.includes('_fd_age'))
        assert.ok(result.includes('no: 2'))
        assert.ok(result.includes('wireType: 0'))
        assert.ok(result.includes('0x10'))
    })

    it('should generate descriptor for bool field', () => {
        const field = makeField({ name: 'active', number: 3, type: 'bool' })
        const result = generateFieldDescriptor(field)
        assert.ok(result.includes('_fd_active'))
        assert.ok(result.includes('wireType: 0'))
        assert.ok(result.includes('0x18'))
    })

    it('should generate descriptor for message field', () => {
        const field = makeField({ name: 'address', number: 4, type: 'Address', isMessage: true })
        const result = generateFieldDescriptor(field)
        assert.ok(result.includes('wireType: 2'))
        assert.ok(result.includes('0x22'))
    })
})

describe('generateEncodeField', () => {
    it('should generate encode for string field', () => {
        const field = makeField({ name: 'name', number: 1, type: 'string' })
        const lines = generateEncodeField(field, 'User')
        const code = lines.join('\n')
        assert.ok(code.includes("msg.name !== ''"))
        assert.ok(code.includes('w.raw(_fd_User_name.tag)'))
        assert.ok(code.includes('w.string(msg.name)'))
    })

    it('should generate encode for int32 field', () => {
        const field = makeField({ name: 'age', number: 2, type: 'int32' })
        const lines = generateEncodeField(field, 'User')
        const code = lines.join('\n')
        assert.ok(code.includes('msg.age !== 0'))
        assert.ok(code.includes('w.int32(msg.age)'))
    })

    it('should generate encode for bool field', () => {
        const field = makeField({ name: 'active', number: 3, type: 'bool' })
        const lines = generateEncodeField(field, 'User')
        const code = lines.join('\n')
        assert.ok(code.includes('msg.active !== false'))
        assert.ok(code.includes('w.bool(msg.active)'))
    })

    it('should generate encode for repeated string field', () => {
        const field = makeField({ name: 'tags', number: 4, type: 'string', label: 'repeated' })
        const lines = generateEncodeField(field, 'User')
        const code = lines.join('\n')
        assert.ok(code.includes('for (const v of msg.tags)'))
        assert.ok(code.includes('w.string(v)'))
    })

    it('should generate encode for message field', () => {
        const field = makeField({ name: 'address', number: 5, type: 'Address', isMessage: true })
        const lines = generateEncodeField(field, 'User')
        const code = lines.join('\n')
        assert.ok(code.includes('msg.address !== undefined'))
        assert.ok(code.includes('Address.encode'))
        assert.ok(code.includes('w.fork()'))
        assert.ok(code.includes('w.join'))
    })

    it('should generate encode for enum field', () => {
        const field = makeField({ name: 'status', number: 6, type: 'Status', isEnum: true })
        const lines = generateEncodeField(field, 'User')
        const code = lines.join('\n')
        assert.ok(code.includes('msg.status !== 0'))
        assert.ok(code.includes('w.uint32(msg.status as number)'))
    })

    it('should generate encode for packed repeated int32', () => {
        const field = makeField({
            name: 'scores',
            number: 7,
            type: 'int32',
            label: 'repeated',
            packed: true
        })
        const lines = generateEncodeField(field, 'User')
        const code = lines.join('\n')
        assert.ok(code.includes('msg.scores.length > 0'))
        assert.ok(code.includes('w.fork()'))
        assert.ok(code.includes('w.join()'))
    })
})

describe('generateDecodeField', () => {
    it('should generate decode for string field', () => {
        const field = makeField({ name: 'name', number: 1, type: 'string' })
        const lines = generateDecodeField(field)
        const code = lines.join('\n')
        assert.ok(code.includes('case 1:'))
        assert.ok(code.includes('r.string()'))
        assert.ok(code.includes('msg.name'))
    })

    it('should generate decode for int32 field', () => {
        const field = makeField({ name: 'age', number: 2, type: 'int32' })
        const lines = generateDecodeField(field)
        const code = lines.join('\n')
        assert.ok(code.includes('case 2:'))
        assert.ok(code.includes('r.int32()'))
    })

    it('should generate decode for bool field', () => {
        const field = makeField({ name: 'active', number: 3, type: 'bool' })
        const lines = generateDecodeField(field)
        const code = lines.join('\n')
        assert.ok(code.includes('case 3:'))
        assert.ok(code.includes('r.bool()'))
    })

    it('should generate decode for message field', () => {
        const field = makeField({ name: 'address', number: 4, type: 'Address', isMessage: true })
        const lines = generateDecodeField(field)
        const code = lines.join('\n')
        assert.ok(code.includes('case 4:'))
        assert.ok(
            code.includes(
                'const _len = r.uint32(); msg.address = Address.decodeFrom(r, r.pos + _len);'
            )
        )
        assert.ok(code.includes('Address.decode'))
    })

    it('should generate decode for repeated field', () => {
        const field = makeField({ name: 'tags', number: 5, type: 'string', label: 'repeated' })
        const lines = generateDecodeField(field)
        const code = lines.join('\n')
        assert.ok(code.includes('case 5:'))
        assert.ok(code.includes('msg.tags.push'))
        assert.ok(code.includes('r.string()'))
    })

    it('should generate decode for packed repeated field', () => {
        const field = makeField({
            name: 'scores',
            number: 6,
            type: 'int32',
            label: 'repeated',
            packed: true
        })
        const lines = generateDecodeField(field)
        const code = lines.join('\n')
        assert.ok(code.includes('case 6:'))
        assert.ok(code.includes('pLen'))
        assert.ok(code.includes('pEnd'))
        assert.ok(code.includes('msg.scores.push'))
    })

    it('should generate decode for enum field', () => {
        const field = makeField({ name: 'status', number: 7, type: 'Status', isEnum: true })
        const lines = generateDecodeField(field)
        const code = lines.join('\n')
        assert.ok(code.includes('case 7:'))
        assert.ok(code.includes('r.uint32()'))
    })

    it('should generate decode for double field', () => {
        const field = makeField({ name: 'lat', number: 8, type: 'double' })
        const lines = generateDecodeField(field)
        const code = lines.join('\n')
        assert.ok(code.includes('case 8:'))
        assert.ok(code.includes('r.double()'))
    })

    it('should generate decode for float field', () => {
        const field = makeField({ name: 'score', number: 9, type: 'float' })
        const lines = generateDecodeField(field)
        const code = lines.join('\n')
        assert.ok(code.includes('case 9:'))
        assert.ok(code.includes('r.float()'))
    })

    it('should generate decode for bytes field', () => {
        const field = makeField({ name: 'data', number: 10, type: 'bytes' })
        const lines = generateDecodeField(field)
        const code = lines.join('\n')
        assert.ok(code.includes('case 10:'))
        assert.ok(code.includes('r.bytes()'))
    })
})
