/**
 * Oneof code generation: discriminated unions and case enums.
 */

import type { ProtoField } from './field-codegen.js'
import {
    getTypeScriptType,
    getWriterMethod,
    getReaderMethod,
    getReaderBigIntMethod,
    is64BitLoHi,
    computeTagBytes,
    getWireType
} from './field-codegen.js'
import { CodeTemplate } from './template.js'

const WIRE_END_GROUP = 4

/** Represents a parsed oneof group for code generation. */
export interface ProtoOneof {
    name: string
    fields: ProtoField[]
}

/**
 * Generate a oneof case enum.
 *
 * Example output:
 *   export const enum ResultCase {
 *     NOT_SET = 0,
 *     SUCCESS = 1,
 *     ERROR = 2,
 *   }
 */
export function generateOneofCaseEnum(oneof: ProtoOneof, messageTypeName: string): string {
    const enumName = `${messageTypeName}_${capitalize(oneof.name)}Case`
    const t = new CodeTemplate()
    t.block(`export const enum ${enumName} {`, () => {
        t.line('NOT_SET = 0,')
        for (const field of oneof.fields) {
            t.line(`${field.name.toUpperCase()} = ${field.number},`)
        }
    })
    return t.toString()
}

/**
 * Generate a discriminated union type for a oneof group.
 *
 * Example output:
 *   export type UserResult =
 *     | { case: 'success'; value: SuccessResponse }
 *     | { case: 'error'; value: ErrorResponse }
 *     | { case: undefined; value?: undefined };
 */
export function generateOneofType(oneof: ProtoOneof, messageTypeName: string): string {
    const typeName = `${messageTypeName}_${capitalize(oneof.name)}`
    const t = new CodeTemplate()
    t.raw(`export type ${typeName} =`)
    for (const field of oneof.fields) {
        const tsType = getTypeScriptType(field)
        t.raw(`  | { case: '${field.name}'; value: ${tsType} }`)
    }
    t.raw('  | { case: undefined; value?: undefined };')
    return t.toString()
}

/**
 * Get the TypeScript field declaration for a oneof group inside a message class.
 * Returns the field name and type for the discriminated union field.
 */
export function getOneofFieldDeclaration(oneof: ProtoOneof, messageTypeName: string): string {
    const typeName = `${messageTypeName}_${capitalize(oneof.name)}`
    return `${oneof.name}: ${typeName} = { case: undefined };`
}

/**
 * Generate encode lines for oneof fields.
 * Each field in the oneof is checked via the discriminated union case.
 */
export function generateOneofEncodeLines(oneof: ProtoOneof, messageTypeName: string): string[] {
    const lines: string[] = []
    const accessor = `msg.${oneof.name}`
    for (const field of oneof.fields) {
        const typeRef = field.typeExpr ?? field.type
        lines.push(`if (${accessor}.case === '${field.name}') {`)
        lines.push(`  w.raw(${descriptorConstName(messageTypeName, field.name)}.tag);`)
        if (field.isMessage && field.isGroup) {
            lines.push(`  ${typeRef}.encode(${accessor}.value as ${typeRef}, w);`)
            lines.push(`  w.tag(${field.number}, ${WIRE_END_GROUP});`)
        } else if (field.isMessage) {
            lines.push('  w.fork();')
            lines.push(`  ${typeRef}.encode(${accessor}.value as ${typeRef}, w);`)
            lines.push('  w.join();')
        } else if (field.isEnum) {
            lines.push(`  w.uint32(${accessor}.value as number);`)
        } else if (field.type === 'string') {
            lines.push(`  w.string(${accessor}.value as string);`)
        } else if (field.type === 'bytes') {
            lines.push(`  w.bytes(${accessor}.value as Uint8Array);`)
        } else if (field.type === 'bool') {
            lines.push(`  w.bool(${accessor}.value as boolean);`)
        } else if (is64BitLoHi(field.type)) {
            lines.push(`  const value = ${accessor}.value as bigint;`)
            lines.push(
                `  w.${getWriterMethod(field.type)}(Number(value & 0xFFFFFFFFn), Number((value >> 32n) & 0xFFFFFFFFn));`
            )
        } else {
            lines.push(`  w.${getWriterMethod(field.type)}(${accessor}.value as number);`)
        }
        lines.push('}')
    }
    return lines
}

/**
 * Generate decode switch cases for oneof fields.
 * Sets the discriminated union with the matched case.
 */
export function generateOneofDecodeLines(oneof: ProtoOneof, _messageTypeName: string): string[] {
    const lines: string[] = []
    const accessor = `msg.${oneof.name}`
    for (const field of oneof.fields) {
        const typeRef = field.typeExpr ?? field.type
        if (field.isMessage && field.isGroup) {
            lines.push(
                `case ${field.number}: ${accessor} = { case: '${field.name}', value: ${typeRef}.decode(r.group(${field.number})) }; break;`
            )
        } else if (field.isMessage) {
            lines.push(
                `case ${field.number}: { const _len = r.uint32(); ${accessor} = { case: '${field.name}', value: ${typeRef}.decodeFrom(r, r.pos + _len) }; break; }`
            )
        } else if (field.isEnum) {
            lines.push(
                `case ${field.number}: ${accessor} = { case: '${field.name}', value: r.uint32() }; break;`
            )
        } else if (field.type === 'string') {
            lines.push(
                `case ${field.number}: ${accessor} = { case: '${field.name}', value: r.string() }; break;`
            )
        } else if (field.type === 'bytes') {
            lines.push(
                `case ${field.number}: ${accessor} = { case: '${field.name}', value: r.bytes() }; break;`
            )
        } else if (field.type === 'bool') {
            lines.push(
                `case ${field.number}: ${accessor} = { case: '${field.name}', value: r.bool() }; break;`
            )
        } else if (is64BitLoHi(field.type)) {
            lines.push(
                `case ${field.number}: ${accessor} = { case: '${field.name}', value: r.${getReaderBigIntMethod(field.type)}() }; break;`
            )
        } else {
            lines.push(
                `case ${field.number}: ${accessor} = { case: '${field.name}', value: r.${getReaderMethod(field.type)}() }; break;`
            )
        }
    }
    return lines
}

/**
 * Generate sizeOf lines for oneof fields (two-pass encode).
 * Adds to variable `s` the wire size of the active oneof field.
 */
export function generateOneofSizeOfLines(oneof: ProtoOneof, _messageTypeName: string): string[] {
    const lines: string[] = []
    const accessor = `msg.${oneof.name}`
    for (const field of oneof.fields) {
        const typeRef = field.typeExpr ?? field.type
        const wireType = getWireType(field)
        const tagBytes = computeTagBytes(field.number, wireType)
        const tagSize = tagBytes.length
        lines.push(`if (${accessor}.case === '${field.name}') {`)
        if (field.isMessage) {
            lines.push(
                `  const _ms = ${typeRef}.sizeOf(${accessor}.value as ${typeRef}); s += ${tagSize} + varint32Size(_ms) + _ms;`
            )
        } else if (field.isEnum) {
            lines.push(`  s += ${tagSize} + varint32Size(${accessor}.value as number);`)
        } else if (field.type === 'string') {
            lines.push(
                `  const _bl = strByteLen(${accessor}.value as string); s += ${tagSize} + varint32Size(_bl) + _bl;`
            )
        } else if (field.type === 'bytes') {
            lines.push(
                `  const _v = ${accessor}.value as Uint8Array; s += ${tagSize} + varint32Size(_v.length) + _v.length;`
            )
        } else if (field.type === 'bool') {
            lines.push(`  s += ${tagSize} + 1;`)
        } else if (
            field.type === 'double' ||
            field.type === 'fixed64' ||
            field.type === 'sfixed64'
        ) {
            lines.push(`  s += ${tagSize} + 8;`)
        } else if (
            field.type === 'float' ||
            field.type === 'fixed32' ||
            field.type === 'sfixed32'
        ) {
            lines.push(`  s += ${tagSize} + 4;`)
        } else if (is64BitLoHi(field.type)) {
            lines.push(
                `  const _v = ${accessor}.value as bigint; s += ${tagSize} + varint64Size(Number(_v & 0xFFFFFFFFn), Number((_v >> 32n) & 0xFFFFFFFFn));`
            )
        } else if (field.type === 'int32') {
            lines.push(`  s += ${tagSize} + int32Size(${accessor}.value as number);`)
        } else if (field.type === 'sint32') {
            lines.push(
                `  const _v = ${accessor}.value as number; s += ${tagSize} + varint32Size(((_v << 1) ^ (_v >> 31)) >>> 0);`
            )
        } else {
            lines.push(`  s += ${tagSize} + varint32Size(${accessor}.value as number);`)
        }
        lines.push('}')
    }
    return lines
}

/**
 * Generate encodeTo lines for oneof fields (two-pass encode).
 * Writes directly into buf at position p.
 */
export function generateOneofEncodeToLines(oneof: ProtoOneof, _messageTypeName: string): string[] {
    const lines: string[] = []
    const accessor = `msg.${oneof.name}`
    for (const field of oneof.fields) {
        const typeRef = field.typeExpr ?? field.type
        const wireType = getWireType(field)
        const tagBytes = computeTagBytes(field.number, wireType)
        const tagWrite = tagBytes
            .map((b) => `buf[p++] = 0x${b.toString(16).padStart(2, '0')};`)
            .join(' ')
        lines.push(`if (${accessor}.case === '${field.name}') {`)
        lines.push(`  ${tagWrite}`)
        if (field.isMessage) {
            lines.push(
                `  const _ms = ${typeRef}.sizeOf(${accessor}.value as ${typeRef}); p = writeVarint(_ms, buf, p); p = ${typeRef}.encodeTo(${accessor}.value as ${typeRef}, buf, p);`
            )
        } else if (field.isEnum) {
            lines.push(`  p = writeVarint(${accessor}.value as number, buf, p);`)
        } else if (field.type === 'string') {
            lines.push(
                `  const _bl = strByteLen(${accessor}.value as string); p = writeVarint(_bl, buf, p); strWrite(${accessor}.value as string, buf, p, _bl); p += _bl;`
            )
        } else if (field.type === 'bytes') {
            lines.push(
                `  const _v = ${accessor}.value as Uint8Array; p = writeVarint(_v.length, buf, p); p = writeBytes(_v, buf, p);`
            )
        } else if (field.type === 'bool') {
            lines.push(`  p = writeBool(${accessor}.value as boolean, buf, p);`)
        } else if (field.type === 'double') {
            lines.push(`  p = writeDouble(${accessor}.value as number, buf, p);`)
        } else if (field.type === 'float') {
            lines.push(`  p = writeFloat(${accessor}.value as number, buf, p);`)
        } else if (field.type === 'fixed32' || field.type === 'sfixed32') {
            lines.push(`  p = writeFixed32(${accessor}.value as number, buf, p);`)
        } else if (field.type === 'fixed64' || field.type === 'sfixed64') {
            lines.push(
                `  const _v = ${accessor}.value as bigint; p = writeFixed64(Number(_v & 0xFFFFFFFFn), Number((_v >> 32n) & 0xFFFFFFFFn), buf, p);`
            )
        } else if (is64BitLoHi(field.type)) {
            lines.push(
                `  const _v = ${accessor}.value as bigint; p = writeVarint64(Number(_v & 0xFFFFFFFFn), Number((_v >> 32n) & 0xFFFFFFFFn), buf, p);`
            )
        } else if (field.type === 'int32') {
            lines.push(`  p = writeInt32(${accessor}.value as number, buf, p);`)
        } else if (field.type === 'sint32') {
            lines.push(`  p = writeSint32(${accessor}.value as number, buf, p);`)
        } else {
            lines.push(`  p = writeVarint(${accessor}.value as number, buf, p);`)
        }
        lines.push('}')
    }
    return lines
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

function descriptorConstName(messageTypeName: string, fieldName: string): string {
    return `_fd_${`${messageTypeName}_${fieldName}`.replace(/[^a-zA-Z0-9_$]/g, '_')}`
}
