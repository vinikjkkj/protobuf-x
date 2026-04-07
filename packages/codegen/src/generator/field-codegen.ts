/**
 * Per-field code generation: tag computation, type mapping, encode/decode.
 */

/** Represents a parsed proto field for code generation. */
export interface ProtoField {
    name: string
    number: number
    type: string // e.g., 'int32', 'string', 'MyMessage', 'MyEnum'
    /** Expression used in generated TypeScript for a referenced message/enum type. */
    typeExpr?: string
    /** Fully qualified protobuf type name for referenced message/enum types. */
    resolvedType?: string
    label: 'optional' | 'required' | 'repeated'
    /** If set, this field is part of a oneof group. */
    oneofName?: string
    /** For map fields: key type. */
    mapKeyType?: string
    /** For map fields: value type. */
    mapValueType?: string
    /** Generated TypeScript expression for a map value message/enum type. */
    mapValueTypeExpr?: string
    /** Fully qualified protobuf type name for map value message/enum types. */
    mapValueResolvedType?: string
    /** Whether packed encoding is used (proto3 default for repeated scalars). */
    packed?: boolean
    /** Whether this is an enum type. */
    isEnum?: boolean
    /** Whether this is a message type. */
    isMessage?: boolean
    /** Whether this field uses deprecated group wire encoding. */
    isGroup?: boolean
    /** Whether a map value is an enum type. */
    mapValueIsEnum?: boolean
    /** Whether a map value is a message type. */
    mapValueIsMessage?: boolean
    /** Whether this field tracks explicit presence. */
    hasPresence?: boolean
    /** Whether this field is required in the schema. */
    isRequired?: boolean
    /** JSON field name, if overridden via json_name. */
    jsonName?: string
    /** Explicit proto default value expression, if any. */
    defaultValueExpr?: string
}

// Proto scalar type names
const SCALAR_TYPES = new Set([
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
])

/** Wire type constants matching the runtime WireType enum. */
const WIRE_VARINT = 0
const WIRE_BIT64 = 1
const WIRE_LENGTH_DELIMITED = 2
const WIRE_START_GROUP = 3
const WIRE_END_GROUP = 4
const WIRE_BIT32 = 5

/** Map from proto scalar type to wire type number. */
function scalarWireType(protoType: string): number {
    switch (protoType) {
        case 'int32':
        case 'int64':
        case 'uint32':
        case 'uint64':
        case 'sint32':
        case 'sint64':
        case 'bool':
            return WIRE_VARINT
        case 'fixed64':
        case 'sfixed64':
        case 'double':
            return WIRE_BIT64
        case 'string':
        case 'bytes':
            return WIRE_LENGTH_DELIMITED
        case 'fixed32':
        case 'sfixed32':
        case 'float':
            return WIRE_BIT32
        default:
            // Unknown type treated as length-delimited (nested message)
            return WIRE_LENGTH_DELIMITED
    }
}

/** Get the wire type for a field, accounting for messages and enums. */
export function getWireType(field: ProtoField): number {
    if (field.isGroup) {
        return WIRE_START_GROUP
    }
    if (field.isMessage) {
        return WIRE_LENGTH_DELIMITED
    }
    if (field.isEnum) {
        return WIRE_VARINT
    }
    if (field.mapKeyType) {
        return WIRE_LENGTH_DELIMITED
    }
    return scalarWireType(field.type)
}

/**
 * Compute varint-encoded tag bytes for a field.
 * tag = (fieldNumber << 3) | wireType
 */
export function computeTagBytes(fieldNumber: number, wireType: number): number[] {
    let value = (fieldNumber << 3) | wireType
    const bytes: number[] = []
    // Encode as varint
    while (value > 0x7f) {
        bytes.push((value & 0x7f) | 0x80)
        value >>>= 7
    }
    bytes.push(value & 0x7f)
    return bytes
}

/** Format tag bytes as hex string for Uint8Array literal, e.g., '0x0a'. */
function formatTagHex(bytes: number[]): string {
    return bytes.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(', ')
}

/** Get the TypeScript type for a proto field. */
export type Int64Mode = 'bigint' | 'number' | 'string'

export function getTypeScriptType(field: ProtoField, int64As: Int64Mode = 'bigint'): string {
    if (field.mapKeyType && field.mapValueType) {
        const keyTs = scalarToTsType(field.mapKeyType, int64As)
        const valTs = isScalarType(field.mapValueType)
            ? scalarToTsType(field.mapValueType, int64As)
            : mapValueTypeExpr(field)
        return `Map<${keyTs}, ${valTs}>`
    }

    let baseType: string
    if (field.isMessage) {
        baseType = fieldTypeExpr(field)
    } else if (field.isEnum) {
        baseType = fieldTypeExpr(field)
    } else {
        baseType = scalarToTsType(field.type, int64As)
    }

    if (field.label === 'repeated') {
        return `${baseType}[]`
    }

    return baseType
}

/** Check if a type name is a proto scalar. */
export function isScalarType(type: string): boolean {
    return SCALAR_TYPES.has(type)
}

/** Map proto scalar type to TypeScript type. The 64-bit integer types are
 * controlled by `int64As` (bigint by default, number or string for protobufjs
 * interop). */
export function scalarToTsType(protoType: string, int64As: Int64Mode = 'bigint'): string {
    switch (protoType) {
        case 'double':
        case 'float':
        case 'int32':
        case 'uint32':
        case 'sint32':
        case 'fixed32':
        case 'sfixed32':
            return 'number'
        case 'int64':
        case 'uint64':
        case 'sint64':
        case 'fixed64':
        case 'sfixed64':
            return int64As
        case 'bool':
            return 'boolean'
        case 'string':
            return 'string'
        case 'bytes':
            return 'Uint8Array'
        default:
            return protoType // message or enum type name
    }
}

/** Get the default value expression for a proto field. */
export function getDefaultValue(field: ProtoField, int64As: Int64Mode = 'bigint'): string {
    if (field.defaultValueExpr !== undefined) {
        return field.defaultValueExpr
    }
    if (field.mapKeyType) {
        return 'new Map()'
    }
    if (field.label === 'repeated') {
        return '[]'
    }
    if (field.isMessage) {
        return 'undefined'
    }
    if (field.isEnum) {
        return '0'
    }
    return scalarDefaultValue(field.type, int64As)
}

/** Get scalar default value as code string. */
function scalarDefaultValue(protoType: string, int64As: Int64Mode = 'bigint'): string {
    switch (protoType) {
        case 'double':
        case 'float':
        case 'int32':
        case 'uint32':
        case 'sint32':
        case 'fixed32':
        case 'sfixed32':
            return '0'
        case 'int64':
        case 'uint64':
        case 'sint64':
        case 'fixed64':
        case 'sfixed64':
            return int64As === 'bigint' ? '0n' : int64As === 'number' ? '0' : "'0'"
        case 'bool':
            return 'false'
        case 'string':
            return "''"
        case 'bytes':
            return 'new Uint8Array(0)'
        default:
            return 'undefined'
    }
}

/** Get the BinaryWriter method name for a scalar proto type. */
export function getWriterMethod(protoType: string): string {
    switch (protoType) {
        case 'double':
            return 'double'
        case 'float':
            return 'float'
        case 'int32':
            return 'int32'
        case 'int64':
            return 'uint64'
        case 'uint32':
            return 'uint32'
        case 'uint64':
            return 'uint64'
        case 'sint32':
            return 'sint32'
        case 'sint64':
            return 'sint64'
        case 'fixed32':
            return 'fixed32'
        case 'fixed64':
            return 'fixed64'
        case 'sfixed32':
            return 'sfixed32'
        case 'sfixed64':
            return 'sfixed64'
        case 'bool':
            return 'bool'
        case 'string':
            return 'string'
        case 'bytes':
            return 'bytes'
        default:
            return 'uint32' // enum
    }
}

/** Get the BinaryReader method name for a scalar proto type. */
export function getReaderMethod(protoType: string): string {
    switch (protoType) {
        case 'double':
            return 'double'
        case 'float':
            return 'float'
        case 'int32':
            return 'int32'
        case 'int64':
            return 'uint64'
        case 'uint32':
            return 'uint32'
        case 'uint64':
            return 'uint64'
        case 'sint32':
            return 'sint32'
        case 'sint64':
            return 'sint64'
        case 'fixed32':
            return 'fixed32'
        case 'fixed64':
            return 'fixed64'
        case 'sfixed32':
            return 'sfixed32'
        case 'sfixed64':
            return 'sfixed64'
        case 'bool':
            return 'bool'
        case 'string':
            return 'string'
        case 'bytes':
            return 'bytes'
        default:
            return 'uint32' // enum
    }
}

/** Whether a 64-bit type uses lo/hi pair for reader/writer. */
export function is64BitLoHi(protoType: string): boolean {
    switch (protoType) {
        case 'int64':
        case 'uint64':
        case 'sint64':
        case 'fixed64':
        case 'sfixed64':
            return true
        default:
            return false
    }
}

/** Sanitize a field name to a valid JS identifier. */
function safeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_$]/g, '_')
}

function descriptorConstName(field: ProtoField, scope?: string): string {
    const suffix = scope ? `${scope}_${field.name}` : field.name
    return `_fd_${safeName(suffix)}`
}

export function fieldDescriptorConstName(field: ProtoField, scope?: string): string {
    return descriptorConstName(field, scope)
}

function fieldTypeExpr(field: ProtoField): string {
    return field.typeExpr ?? field.type
}

export function mapValueTypeExpr(field: ProtoField): string {
    return field.mapValueTypeExpr ?? field.mapValueType ?? 'unknown'
}

/**
 * Wrap a value expression with `BigInt(...)` if the codegen is emitting
 * non-bigint 64-bit fields. The 64-bit encode helpers always operate on
 * BigInt internally; in number/string mode the field value is a JS number
 * or decimal string and must be coerced before bit manipulation.
 */
function asBigIntExpr(valueExpr: string, int64As: Int64Mode): string {
    return int64As === 'bigint' ? valueExpr : `BigInt(${valueExpr})`
}

/**
 * Wrap a `r.int64BigInt()`-style read expression to convert from BigInt to
 * the target representation (number or string), or pass through for bigint mode.
 */
function fromBigIntExpr(readExpr: string, int64As: Int64Mode): string {
    if (int64As === 'bigint') return readExpr
    if (int64As === 'number') return `Number(${readExpr})`
    return `String(${readExpr})`
}

export function getReaderBigIntMethod(protoType: string): string {
    switch (protoType) {
        case 'int64':
            return 'int64BigInt'
        case 'uint64':
            return 'uint64BigInt'
        case 'sint64':
            return 'sint64BigInt'
        case 'fixed64':
            return 'fixed64BigInt'
        case 'sfixed64':
            return 'sfixed64BigInt'
        default:
            return getReaderMethod(protoType)
    }
}

function toCamelCase(name: string): string {
    return name.replace(/_([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
}

function scalarTypeExpr(protoType: string): string | undefined {
    switch (protoType) {
        case 'double':
            return 'ScalarType.DOUBLE'
        case 'float':
            return 'ScalarType.FLOAT'
        case 'int64':
            return 'ScalarType.INT64'
        case 'uint64':
            return 'ScalarType.UINT64'
        case 'int32':
            return 'ScalarType.INT32'
        case 'fixed64':
            return 'ScalarType.FIXED64'
        case 'fixed32':
            return 'ScalarType.FIXED32'
        case 'bool':
            return 'ScalarType.BOOL'
        case 'string':
            return 'ScalarType.STRING'
        case 'bytes':
            return 'ScalarType.BYTES'
        case 'uint32':
            return 'ScalarType.UINT32'
        case 'sfixed32':
            return 'ScalarType.SFIXED32'
        case 'sfixed64':
            return 'ScalarType.SFIXED64'
        case 'sint32':
            return 'ScalarType.SINT32'
        case 'sint64':
            return 'ScalarType.SINT64'
        default:
            return undefined
    }
}

function fieldRuleExpr(field: ProtoField): string {
    if (field.mapKeyType) {
        return 'FieldRule.MAP'
    }
    if (field.label === 'repeated') {
        return 'FieldRule.REPEATED'
    }
    return 'FieldRule.SINGULAR'
}

/**
 * Generate the const _fd_xxx field descriptor declaration.
 * E.g.: const _fd_name = { no: 1, wireType: 2, tag: new Uint8Array([0x0a]) };
 */
export function generateFieldDescriptor(field: ProtoField, scope?: string): string {
    const wireType =
        field.label === 'repeated' && field.packed ? WIRE_LENGTH_DELIMITED : getWireType(field)
    const tagBytes = computeTagBytes(field.number, wireType)
    const hex = formatTagHex(tagBytes)
    const properties = [`no: ${field.number}`, `name: '${field.name}'`]

    // Only emit jsonName when it differs from the proto name (camelCase)
    const camelName = toCamelCase(field.name)
    const jsonName = field.jsonName ?? camelName
    if (jsonName !== field.name) {
        properties.push(`jsonName: '${jsonName}'`)
    }

    properties.push(`wireType: ${wireType}`)
    properties.push(`tag: new Uint8Array([${hex}])`)

    // Only emit rule when not the default (SINGULAR)
    const ruleExpr = fieldRuleExpr(field)
    if (ruleExpr !== 'FieldRule.SINGULAR') {
        properties.push(`rule: ${ruleExpr}`)
    }

    // Only emit packed when explicitly true (false is the default)
    if (field.packed === true) {
        properties.push('packed: true')
    }

    if (field.oneofName) {
        properties.push(`oneof: '${field.oneofName}'`)
    }

    if (field.mapKeyType && field.mapValueType) {
        const keyScalar = scalarTypeExpr(field.mapKeyType)
        if (keyScalar) {
            properties.push(`mapKeyType: ${keyScalar}`)
        }
        if (isScalarType(field.mapValueType)) {
            const valueScalar = scalarTypeExpr(field.mapValueType)
            if (valueScalar) {
                properties.push(`mapValueType: ${valueScalar}`)
            }
        } else {
            properties.push(`mapValueType: '${field.mapValueResolvedType ?? field.mapValueType}'`)
        }
    } else if (field.isMessage) {
        properties.push(`messageType: '${field.resolvedType ?? field.type}'`)
    } else if (field.isEnum) {
        properties.push(`enumType: '${field.resolvedType ?? field.type}'`)
    } else {
        const scalar = scalarTypeExpr(field.type)
        if (scalar) {
            properties.push(`scalarType: ${scalar}`)
        }
    }

    return `const ${descriptorConstName(field, scope)} = { ${properties.join(', ')} };`
}

/**
 * Get the default check expression for skip-if-default in encode.
 * Returns the condition like `msg.name !== ''`.
 */
function encodeDefaultCheck(field: ProtoField): string {
    const accessor = `msg.${safeName(field.name)}`
    if (field.hasPresence) {
        return `${accessor} !== undefined`
    }
    if (field.isMessage) return `${accessor} !== undefined`
    if (field.isEnum) return `${accessor} !== 0`
    switch (field.type) {
        case 'double':
        case 'float':
        case 'int32':
        case 'uint32':
        case 'sint32':
        case 'fixed32':
        case 'sfixed32':
            return `${accessor} !== 0`
        case 'int64':
        case 'uint64':
        case 'sint64':
        case 'fixed64':
        case 'sfixed64':
            return `${accessor} !== 0n`
        case 'bool':
            return `${accessor} !== false`
        case 'string':
            return `${accessor} !== ''`
        case 'bytes':
            return `${accessor}.length > 0`
        default:
            return `${accessor} !== undefined`
    }
}

/**
 * Generate the encode line(s) for a field.
 */
export function generateEncodeField(
    field: ProtoField,
    msgType?: string,
    int64As: Int64Mode = 'bigint'
): string[] {
    const name = safeName(field.name)
    const fdName = descriptorConstName(field, msgType)
    const accessor = `msg.${name}`
    const typeRef = fieldTypeExpr(field)

    // Map field
    if (field.mapKeyType && field.mapValueType) {
        const lines: string[] = []
        lines.push(`for (const [k, v] of ${accessor}) {`)
        lines.push(`  w.raw(${fdName}.tag);`)
        lines.push('  w.fork();')
        // key: field 1
        const keyWire = scalarWireType(field.mapKeyType)
        const keyTagBytes = computeTagBytes(1, keyWire)
        const keyHex = formatTagHex(keyTagBytes)
        const keyMethod = getWriterMethod(field.mapKeyType)
        lines.push(`  w.raw(new Uint8Array([${keyHex}]));`)
        if (is64BitLoHi(field.mapKeyType)) {
            const k = asBigIntExpr('k', int64As)
            lines.push(
                `  w.${keyMethod}(Number(${k} & 0xFFFFFFFFn), Number((${k} >> 32n) & 0xFFFFFFFFn));`
            )
        } else {
            lines.push(`  w.${keyMethod}(k);`)
        }
        // value: field 2
        if (isScalarType(field.mapValueType)) {
            const valWire = scalarWireType(field.mapValueType)
            const valTagBytes = computeTagBytes(2, valWire)
            const valHex = formatTagHex(valTagBytes)
            const valMethod = getWriterMethod(field.mapValueType)
            lines.push(`  w.raw(new Uint8Array([${valHex}]));`)
            if (is64BitLoHi(field.mapValueType)) {
                const vv = asBigIntExpr('v', int64As)
                lines.push(
                    `  w.${valMethod}(Number(${vv} & 0xFFFFFFFFn), Number((${vv} >> 32n) & 0xFFFFFFFFn));`
                )
            } else {
                lines.push(`  w.${valMethod}(v);`)
            }
        } else if (field.mapValueIsEnum) {
            const valTagBytes = computeTagBytes(2, WIRE_VARINT)
            const valHex = formatTagHex(valTagBytes)
            lines.push(`  w.raw(new Uint8Array([${valHex}]));`)
            lines.push('  w.uint32(v);')
        } else {
            // Message value
            const valTagBytes = computeTagBytes(2, WIRE_LENGTH_DELIMITED)
            const valHex = formatTagHex(valTagBytes)
            lines.push(`  w.raw(new Uint8Array([${valHex}]));`)
            lines.push('  w.fork();')
            lines.push(`  ${mapValueTypeExpr(field)}.encode(v, w);`)
            lines.push('  w.join();')
        }
        lines.push('  w.join();')
        lines.push('}')
        return lines
    }

    // Repeated field
    if (field.label === 'repeated') {
        const lines: string[] = []
        if (field.packed && isScalarType(field.type)) {
            // Packed encoding
            lines.push(`if (${accessor}.length > 0) {`)
            lines.push(`  w.raw(${fdName}.tag);`)
            lines.push('  w.fork();')
            if (is64BitLoHi(field.type)) {
                const vv = asBigIntExpr('v', int64As)
                lines.push(
                    `  for (const v of ${accessor}) { w.${getWriterMethod(field.type)}(Number(${vv} & 0xFFFFFFFFn), Number((${vv} >> 32n) & 0xFFFFFFFFn)); }`
                )
            } else {
                lines.push(
                    `  for (const v of ${accessor}) { w.${getWriterMethod(field.type)}(v); }`
                )
            }
            lines.push('  w.join();')
            lines.push('}')
        } else if (field.isMessage && field.isGroup) {
            lines.push(`for (const v of ${accessor}) {`)
            lines.push(`  w.raw(${fdName}.tag);`)
            lines.push(`  ${typeRef}.encode(v, w);`)
            lines.push(`  w.tag(${field.number}, ${WIRE_END_GROUP});`)
            lines.push('}')
        } else if (field.isMessage) {
            // Repeated message
            lines.push(`for (const v of ${accessor}) {`)
            lines.push(`  w.raw(${fdName}.tag);`)
            lines.push('  w.fork();')
            lines.push(`  ${typeRef}.encode(v, w);`)
            lines.push('  w.join();')
            lines.push('}')
        } else {
            // Repeated non-packed scalar or enum
            const method = field.isEnum ? 'uint32' : getWriterMethod(field.type)
            if (is64BitLoHi(field.type)) {
                const vv = asBigIntExpr('v', int64As)
                lines.push(
                    `for (const v of ${accessor}) { w.raw(${fdName}.tag); w.${method}(Number(${vv} & 0xFFFFFFFFn), Number((${vv} >> 32n) & 0xFFFFFFFFn)); }`
                )
            } else {
                lines.push(`for (const v of ${accessor}) { w.raw(${fdName}.tag); w.${method}(v); }`)
            }
        }
        return lines
    }

    // Singular message field
    if (field.isMessage && field.isGroup) {
        if (field.isRequired) {
            return [
                `if (${accessor} === undefined) { throw new Error('Missing required field: ${field.name}'); }`,
                `w.raw(${fdName}.tag); ${typeRef}.encode(${accessor}, w); w.tag(${field.number}, ${WIRE_END_GROUP});`
            ]
        }
        return [
            `if (${accessor} !== undefined) { w.raw(${fdName}.tag); ${typeRef}.encode(${accessor}, w); w.tag(${field.number}, ${WIRE_END_GROUP}); }`
        ]
    }

    if (field.isMessage) {
        if (field.isRequired) {
            return [
                `if (${accessor} === undefined) { throw new Error('Missing required field: ${field.name}'); }`,
                `w.raw(${fdName}.tag); w.fork(); ${typeRef}.encode(${accessor}, w); w.join();`
            ]
        }
        return [
            `if (${accessor} !== undefined) { w.raw(${fdName}.tag); w.fork(); ${typeRef}.encode(${accessor}, w); w.join(); }`
        ]
    }

    // Singular enum field
    if (field.isEnum) {
        const enumCheck = field.hasPresence ? `${accessor} !== undefined` : `${accessor} !== 0`
        if (field.isRequired) {
            return [
                `if (${accessor} === undefined) { throw new Error('Missing required field: ${field.name}'); }`,
                `w.raw(${fdName}.tag); w.uint32(${accessor});`
            ]
        }
        return [`if (${enumCheck}) { w.raw(${fdName}.tag); w.uint32(${accessor} as number); }`]
    }

    // Singular scalar
    const check = encodeDefaultCheck(field)
    const method = getWriterMethod(field.type)
    if (field.isRequired) {
        if (is64BitLoHi(field.type)) {
            const a = asBigIntExpr(accessor, int64As)
            return [
                `if (${accessor} === undefined) { throw new Error('Missing required field: ${field.name}'); }`,
                `w.raw(${fdName}.tag); w.${method}(Number(${a} & 0xFFFFFFFFn), Number((${a} >> 32n) & 0xFFFFFFFFn));`
            ]
        }
        return [
            `if (${accessor} === undefined) { throw new Error('Missing required field: ${field.name}'); }`,
            `w.raw(${fdName}.tag); w.${method}(${accessor});`
        ]
    }
    if (is64BitLoHi(field.type)) {
        const a = asBigIntExpr(accessor, int64As)
        return [
            `if (${check}) { w.raw(${fdName}.tag); w.${method}(Number(${a} & 0xFFFFFFFFn), Number((${a} >> 32n) & 0xFFFFFFFFn)); }`
        ]
    }
    return [`if (${check}) { w.raw(${fdName}.tag); w.${method}(${accessor}); }`]
}

/**
 * Get the size expression for a scalar value in the two-pass encode.
 * Returns a code expression string that evaluates to the byte size.
 */
function scalarSizeExpr(
    protoType: string,
    valueExpr: string,
    int64As: Int64Mode = 'bigint'
): string {
    switch (protoType) {
        case 'double':
        case 'fixed64':
        case 'sfixed64':
            return '8'
        case 'float':
        case 'fixed32':
        case 'sfixed32':
            return '4'
        case 'bool':
            return '1'
        case 'int32':
            return `int32Size(${valueExpr})`
        case 'uint32':
            return `varint32Size(${valueExpr})`
        case 'sint32':
            return `varint32Size(((${valueExpr} << 1) ^ (${valueExpr} >> 31)) >>> 0)`
        case 'int64':
        case 'uint64': {
            const v = asBigIntExpr(valueExpr, int64As)
            return `varint64Size(Number(${v} & 0xFFFFFFFFn), Number((${v} >> 32n) & 0xFFFFFFFFn))`
        }
        case 'sint64': {
            // zigzag for 64-bit: ((v << 1n) ^ (v >> 63n)) but we use lo/hi decomposition
            const v = asBigIntExpr(valueExpr, int64As)
            return `varint64Size(Number(((${v} << 1n) ^ (${v} >> 63n)) & 0xFFFFFFFFn), Number((((${v} << 1n) ^ (${v} >> 63n)) >> 32n) & 0xFFFFFFFFn))`
        }
        default:
            // enum
            return `varint32Size(${valueExpr})`
    }
}

/**
 * Generate the write expression(s) for a scalar type in the two-pass encode.
 * Returns code lines that write the value into buf at position p, updating p.
 */
function scalarWriteLines(
    protoType: string,
    valueExpr: string,
    int64As: Int64Mode = 'bigint'
): string[] {
    switch (protoType) {
        case 'double':
            return [`p = writeDouble(${valueExpr}, buf, p);`]
        case 'float':
            return [`p = writeFloat(${valueExpr}, buf, p);`]
        case 'int32':
            return [`p = writeInt32(${valueExpr}, buf, p);`]
        case 'uint32':
            return [`p = writeVarint(${valueExpr}, buf, p);`]
        case 'sint32':
            return [`p = writeSint32(${valueExpr}, buf, p);`]
        case 'fixed32':
        case 'sfixed32':
            return [`p = writeFixed32(${valueExpr}, buf, p);`]
        case 'bool':
            return [`p = writeBool(${valueExpr}, buf, p);`]
        case 'int64':
        case 'uint64': {
            const v = asBigIntExpr(valueExpr, int64As)
            return [
                `p = writeVarint64(Number(${v} & 0xFFFFFFFFn), Number((${v} >> 32n) & 0xFFFFFFFFn), buf, p);`
            ]
        }
        case 'sint64': {
            const v = asBigIntExpr(valueExpr, int64As)
            return [
                `{ const _zz = (${v} << 1n) ^ (${v} >> 63n); p = writeVarint64(Number(_zz & 0xFFFFFFFFn), Number((_zz >> 32n) & 0xFFFFFFFFn), buf, p); }`
            ]
        }
        case 'fixed64':
        case 'sfixed64': {
            const v = asBigIntExpr(valueExpr, int64As)
            return [
                `p = writeFixed64(Number(${v} & 0xFFFFFFFFn), Number((${v} >> 32n) & 0xFFFFFFFFn), buf, p);`
            ]
        }
        default:
            // enum
            return [`p = writeVarint(${valueExpr}, buf, p);`]
    }
}

/**
 * Generate tag write code for the two-pass encode.
 * Writes tag byte(s) directly: buf[p++] = 0xNN;
 */
function generateTagWrite(tagBytes: number[]): string {
    return tagBytes.map((b) => `buf[p++] = 0x${b.toString(16).padStart(2, '0')};`).join(' ')
}

/**
 * Generate the sizeOf lines for a field in the two-pass encode.
 * Adds to variable `s` the wire size of the field.
 * For string/bytes/message fields, caches computed sizes in local variables
 * (e.g., _bl_fieldName for byte lengths, _ms_fieldName for message sizes).
 */
export function generateSizeOfField(
    field: ProtoField,
    _scope?: string,
    int64As: Int64Mode = 'bigint'
): string[] {
    const name = safeName(field.name)
    const accessor = `msg.${name}`
    const typeRef = fieldTypeExpr(field)
    const wireType =
        field.label === 'repeated' && field.packed ? WIRE_LENGTH_DELIMITED : getWireType(field)
    const tagBytes = computeTagBytes(field.number, wireType)
    const tagSize = tagBytes.length

    // Map field
    if (field.mapKeyType && field.mapValueType) {
        const lines: string[] = []
        lines.push(`for (const [k, v] of ${accessor}) {`)
        lines.push('  let _es = 0;')
        // key: field 1
        const keyWire = scalarWireType(field.mapKeyType)
        const keyTagBytes = computeTagBytes(1, keyWire)
        if (field.mapKeyType === 'string') {
            lines.push('  const _bl_mk = strByteLen(k);')
            lines.push(`  _es += ${keyTagBytes.length} + varint32Size(_bl_mk) + _bl_mk;`)
        } else {
            lines.push(
                `  _es += ${keyTagBytes.length} + ${scalarSizeExpr(field.mapKeyType, 'k', int64As)};`
            )
        }
        // value: field 2
        if (isScalarType(field.mapValueType)) {
            const valWire = scalarWireType(field.mapValueType)
            const valTagBytes = computeTagBytes(2, valWire)
            if (field.mapValueType === 'string') {
                lines.push('  const _bl_mv = strByteLen(v);')
                lines.push(`  _es += ${valTagBytes.length} + varint32Size(_bl_mv) + _bl_mv;`)
            } else if (field.mapValueType === 'bytes') {
                lines.push(`  _es += ${valTagBytes.length} + varint32Size(v.length) + v.length;`)
            } else {
                lines.push(
                    `  _es += ${valTagBytes.length} + ${scalarSizeExpr(field.mapValueType, 'v', int64As)};`
                )
            }
        } else if (field.mapValueIsEnum) {
            const valTagBytes = computeTagBytes(2, WIRE_VARINT)
            lines.push(`  _es += ${valTagBytes.length} + varint32Size(v);`)
        } else {
            // Message value
            const valTagBytes = computeTagBytes(2, WIRE_LENGTH_DELIMITED)
            lines.push(`  const _mvs = ${mapValueTypeExpr(field)}.sizeOf(v);`)
            lines.push(`  _es += ${valTagBytes.length} + varint32Size(_mvs) + _mvs;`)
        }
        lines.push(`  s += ${tagSize} + varint32Size(_es) + _es;`)
        lines.push('}')
        return lines
    }

    // Repeated field
    if (field.label === 'repeated') {
        const lines: string[] = []
        if (field.packed && isScalarType(field.type)) {
            lines.push(`if (${accessor}.length > 0) {`)
            lines.push('  let _ps = 0;')
            lines.push(
                `  for (const v of ${accessor}) { _ps += ${scalarSizeExpr(field.type, 'v', int64As)}; }`
            )
            lines.push(`  s += ${tagSize} + varint32Size(_ps) + _ps;`)
            lines.push('}')
        } else if (field.packed && field.isEnum) {
            lines.push(`if (${accessor}.length > 0) {`)
            lines.push('  let _ps = 0;')
            lines.push(`  for (const v of ${accessor}) { _ps += varint32Size(v); }`)
            lines.push(`  s += ${tagSize} + varint32Size(_ps) + _ps;`)
            lines.push('}')
        } else if (field.isMessage) {
            lines.push(`for (const v of ${accessor}) {`)
            lines.push(`  const _ms = ${typeRef}.sizeOf(v);`)
            lines.push(`  s += ${tagSize} + varint32Size(_ms) + _ms;`)
            lines.push('}')
        } else if (field.isEnum) {
            lines.push(`for (const v of ${accessor}) { s += ${tagSize} + varint32Size(v); }`)
        } else if (field.type === 'string') {
            lines.push(`for (const v of ${accessor}) {`)
            lines.push('  const _bl = strByteLen(v);')
            lines.push(`  s += ${tagSize} + varint32Size(_bl) + _bl;`)
            lines.push('}')
        } else if (field.type === 'bytes') {
            lines.push(`for (const v of ${accessor}) {`)
            lines.push(`  s += ${tagSize} + varint32Size(v.length) + v.length;`)
            lines.push('}')
        } else {
            lines.push(
                `for (const v of ${accessor}) { s += ${tagSize} + ${scalarSizeExpr(field.type, 'v', int64As)}; }`
            )
        }
        return lines
    }

    // Singular fields
    const check = encodeDefaultCheck(field)
    const lines: string[] = []

    if (field.isMessage) {
        if (field.isRequired) {
            lines.push(
                `if (${accessor} === undefined) { throw new Error('Missing required field: ${field.name}'); }`
            )
        }
        const cond = field.isRequired ? `${accessor} !== undefined` : check
        if (field.isGroup) {
            // Group: start_tag + content + end_tag (no length prefix)
            const endTagSize = computeTagBytes(field.number, WIRE_END_GROUP).length
            lines.push(
                `if (${cond}) { s += ${tagSize} + ${typeRef}.sizeOf(${accessor}) + ${endTagSize}; }`
            )
        } else {
            lines.push(
                `if (${cond}) { const _ms_${name} = ${typeRef}.sizeOf(${accessor}); s += ${tagSize} + varint32Size(_ms_${name}) + _ms_${name}; }`
            )
        }
        return lines
    }

    if (field.type === 'string') {
        lines.push(
            `if (${check}) { const _bl_${name} = strByteLen(${accessor}); s += ${tagSize} + varint32Size(_bl_${name}) + _bl_${name}; }`
        )
        return lines
    }

    if (field.type === 'bytes') {
        lines.push(
            `if (${check}) { s += ${tagSize} + varint32Size(${accessor}.length) + ${accessor}.length; }`
        )
        return lines
    }

    if (field.isEnum) {
        if (field.isRequired) {
            lines.push(
                `if (${accessor} === undefined) { throw new Error('Missing required field: ${field.name}'); }`
            )
            lines.push(`s += ${tagSize} + varint32Size(${accessor});`)
        } else {
            lines.push(`if (${check}) { s += ${tagSize} + varint32Size(${accessor}); }`)
        }
        return lines
    }

    // Scalar
    if (field.isRequired) {
        lines.push(
            `if (${accessor} === undefined) { throw new Error('Missing required field: ${field.name}'); }`
        )
        lines.push(`s += ${tagSize} + ${scalarSizeExpr(field.type, accessor, int64As)};`)
    } else {
        const sizeExpr = scalarSizeExpr(field.type, accessor, int64As)
        lines.push(`if (${check}) { s += ${tagSize} + ${sizeExpr}; }`)
    }
    return lines
}

/**
 * Generate the encodeTo lines for a field in the two-pass encode.
 * Writes directly into buf at position p, returning new p.
 */
export function generateEncodeToField(
    field: ProtoField,
    _scope?: string,
    int64As: Int64Mode = 'bigint'
): string[] {
    const name = safeName(field.name)
    const accessor = `msg.${name}`
    const typeRef = fieldTypeExpr(field)
    const wireType =
        field.label === 'repeated' && field.packed ? WIRE_LENGTH_DELIMITED : getWireType(field)
    const tagBytes = computeTagBytes(field.number, wireType)
    const tagWrite = generateTagWrite(tagBytes)

    // Map field
    if (field.mapKeyType && field.mapValueType) {
        const lines: string[] = []
        lines.push(`for (const [k, v] of ${accessor}) {`)
        lines.push(`  ${tagWrite}`)
        // Compute entry size (need to know it for length prefix)
        lines.push('  let _es = 0;')
        const keyWire = scalarWireType(field.mapKeyType)
        const keyTagBytes = computeTagBytes(1, keyWire)
        const keyTagWrite = generateTagWrite(keyTagBytes)
        if (field.mapKeyType === 'string') {
            lines.push('  const _bl_mk = strByteLen(k);')
            lines.push(`  _es += ${keyTagBytes.length} + varint32Size(_bl_mk) + _bl_mk;`)
        } else {
            lines.push(
                `  _es += ${keyTagBytes.length} + ${scalarSizeExpr(field.mapKeyType, 'k', int64As)};`
            )
        }
        const valWire = isScalarType(field.mapValueType)
            ? scalarWireType(field.mapValueType)
            : field.mapValueIsEnum
              ? WIRE_VARINT
              : WIRE_LENGTH_DELIMITED
        const valTagBytes = computeTagBytes(2, valWire)
        const valTagWrite = generateTagWrite(valTagBytes)
        if (isScalarType(field.mapValueType)) {
            if (field.mapValueType === 'string') {
                lines.push('  const _bl_mv = strByteLen(v);')
                lines.push(`  _es += ${valTagBytes.length} + varint32Size(_bl_mv) + _bl_mv;`)
            } else if (field.mapValueType === 'bytes') {
                lines.push(`  _es += ${valTagBytes.length} + varint32Size(v.length) + v.length;`)
            } else {
                lines.push(
                    `  _es += ${valTagBytes.length} + ${scalarSizeExpr(field.mapValueType, 'v', int64As)};`
                )
            }
        } else if (field.mapValueIsEnum) {
            lines.push(`  _es += ${valTagBytes.length} + varint32Size(v);`)
        } else {
            lines.push(`  const _mvs = ${mapValueTypeExpr(field)}.sizeOf(v);`)
            lines.push(`  _es += ${valTagBytes.length} + varint32Size(_mvs) + _mvs;`)
        }
        lines.push('  p = writeVarint(_es, buf, p);')
        // Write key
        lines.push(`  ${keyTagWrite}`)
        if (field.mapKeyType === 'string') {
            lines.push(
                '  p = writeVarint(_bl_mk, buf, p); strWrite(k, buf, p, _bl_mk); p += _bl_mk;'
            )
        } else {
            for (const wl of scalarWriteLines(field.mapKeyType, 'k', int64As)) {
                lines.push(`  ${wl}`)
            }
        }
        // Write value
        lines.push(`  ${valTagWrite}`)
        if (isScalarType(field.mapValueType)) {
            if (field.mapValueType === 'string') {
                lines.push(
                    '  p = writeVarint(_bl_mv, buf, p); strWrite(v, buf, p, _bl_mv); p += _bl_mv;'
                )
            } else if (field.mapValueType === 'bytes') {
                lines.push('  p = writeVarint(v.length, buf, p); p = writeBytes(v, buf, p);')
            } else {
                for (const wl of scalarWriteLines(field.mapValueType, 'v', int64As)) {
                    lines.push(`  ${wl}`)
                }
            }
        } else if (field.mapValueIsEnum) {
            lines.push('  p = writeVarint(v, buf, p);')
        } else {
            lines.push(
                `  p = writeVarint(_mvs, buf, p); p = ${mapValueTypeExpr(field)}.encodeTo(v, buf, p);`
            )
        }
        lines.push('}')
        return lines
    }

    // Repeated field
    if (field.label === 'repeated') {
        const lines: string[] = []
        if (field.packed && (isScalarType(field.type) || field.isEnum)) {
            lines.push(`if (${accessor}.length > 0) {`)
            lines.push(`  ${tagWrite}`)
            lines.push('  let _ps = 0;')
            if (field.isEnum) {
                lines.push(`  for (const v of ${accessor}) { _ps += varint32Size(v); }`)
            } else {
                lines.push(
                    `  for (const v of ${accessor}) { _ps += ${scalarSizeExpr(field.type, 'v', int64As)}; }`
                )
            }
            lines.push('  p = writeVarint(_ps, buf, p);')
            if (field.isEnum) {
                lines.push(`  for (const v of ${accessor}) { p = writeVarint(v, buf, p); }`)
            } else {
                lines.push(
                    `  for (const v of ${accessor}) { ${scalarWriteLines(field.type, 'v', int64As).join(' ')} }`
                )
            }
            lines.push('}')
        } else if (field.isMessage) {
            lines.push(`for (const v of ${accessor}) {`)
            lines.push(`  ${tagWrite}`)
            lines.push(`  const _ms = ${typeRef}.sizeOf(v);`)
            lines.push(`  p = writeVarint(_ms, buf, p); p = ${typeRef}.encodeTo(v, buf, p);`)
            lines.push('}')
        } else if (field.isEnum) {
            lines.push(`for (const v of ${accessor}) { ${tagWrite} p = writeVarint(v, buf, p); }`)
        } else if (field.type === 'string') {
            lines.push(`for (const v of ${accessor}) {`)
            lines.push(`  ${tagWrite}`)
            lines.push('  const _bl = strByteLen(v);')
            lines.push('  p = writeVarint(_bl, buf, p); strWrite(v, buf, p, _bl); p += _bl;')
            lines.push('}')
        } else if (field.type === 'bytes') {
            lines.push(`for (const v of ${accessor}) {`)
            lines.push(`  ${tagWrite}`)
            lines.push('  p = writeVarint(v.length, buf, p); p = writeBytes(v, buf, p);')
            lines.push('}')
        } else {
            lines.push(
                `for (const v of ${accessor}) { ${tagWrite} ${scalarWriteLines(field.type, 'v', int64As).join(' ')} }`
            )
        }
        return lines
    }

    // Singular fields
    const check = encodeDefaultCheck(field)
    const lines: string[] = []

    if (field.isMessage) {
        if (field.isRequired) {
            lines.push(
                `if (${accessor} === undefined) { throw new Error('Missing required field: ${field.name}'); }`
            )
        }
        const cond = field.isRequired ? `${accessor} !== undefined` : check
        if (field.isGroup) {
            // Group: start_tag + content + end_tag (no length prefix)
            const endTagBytes = computeTagBytes(field.number, WIRE_END_GROUP)
            const endTagWrite = generateTagWrite(endTagBytes)
            lines.push(
                `if (${cond}) { ${tagWrite} p = ${typeRef}.encodeTo(${accessor}, buf, p); ${endTagWrite} }`
            )
        } else {
            lines.push(
                `if (${cond}) { ${tagWrite} const _ms_${name} = ${typeRef}.sizeOf(${accessor}); p = writeVarint(_ms_${name}, buf, p); p = ${typeRef}.encodeTo(${accessor}, buf, p); }`
            )
        }
        return lines
    }

    if (field.type === 'string') {
        lines.push(
            `if (${check}) { ${tagWrite} const _bl_${name} = strByteLen(${accessor}); p = writeVarint(_bl_${name}, buf, p); strWrite(${accessor}, buf, p, _bl_${name}); p += _bl_${name}; }`
        )
        return lines
    }

    if (field.type === 'bytes') {
        lines.push(
            `if (${check}) { ${tagWrite} p = writeVarint(${accessor}.length, buf, p); p = writeBytes(${accessor}, buf, p); }`
        )
        return lines
    }

    if (field.isEnum) {
        if (field.isRequired) {
            lines.push(
                `if (${accessor} === undefined) { throw new Error('Missing required field: ${field.name}'); }`
            )
            lines.push(`${tagWrite} p = writeVarint(${accessor}, buf, p);`)
        } else {
            lines.push(`if (${check}) { ${tagWrite} p = writeVarint(${accessor}, buf, p); }`)
        }
        return lines
    }

    // Scalar
    if (field.isRequired) {
        lines.push(
            `if (${accessor} === undefined) { throw new Error('Missing required field: ${field.name}'); }`
        )
        lines.push(`${tagWrite} ${scalarWriteLines(field.type, accessor, int64As).join(' ')}`)
    } else {
        lines.push(
            `if (${check}) { ${tagWrite} ${scalarWriteLines(field.type, accessor, int64As).join(' ')} }`
        )
    }
    return lines
}

/**
 * Generate the decode switch case line for a field.
 * Returns lines like: `case 1: msg.name = r.string(); break;`
 */
export function generateDecodeField(field: ProtoField, int64As: Int64Mode = 'bigint'): string[] {
    const name = safeName(field.name)
    const accessor = `msg.${name}`
    const typeRef = fieldTypeExpr(field)

    // Map field
    if (field.mapKeyType && field.mapValueType) {
        const lines: string[] = []
        lines.push(`case ${field.number}: {`)
        lines.push('  const _mLen = r.uint32(); const _mEnd = r.pos + _mLen;')
        const keyDefault = scalarDefaultValue(field.mapKeyType, int64As)
        const valDefault =
            isScalarType(field.mapValueType) || field.mapValueIsEnum
                ? scalarDefaultValue(field.mapValueType, int64As)
                : `new ${mapValueTypeExpr(field)}()`
        lines.push(`  let mk = ${keyDefault};`)
        lines.push(`  let mv = ${valDefault};`)
        lines.push('  while (r.pos < _mEnd) {')
        lines.push('    const mt = r.uint32();')
        lines.push('    switch (mt >>> 3) {')
        if (is64BitLoHi(field.mapKeyType)) {
            const readExpr = `r.${getReaderBigIntMethod(field.mapKeyType)}()`
            lines.push(`      case 1: mk = ${fromBigIntExpr(readExpr, int64As)}; break;`)
        } else {
            lines.push(`      case 1: mk = r.${getReaderMethod(field.mapKeyType)}(); break;`)
        }
        if (isScalarType(field.mapValueType)) {
            if (is64BitLoHi(field.mapValueType)) {
                const readExpr = `r.${getReaderBigIntMethod(field.mapValueType)}()`
                lines.push(`      case 2: mv = ${fromBigIntExpr(readExpr, int64As)}; break;`)
            } else {
                lines.push(`      case 2: mv = r.${getReaderMethod(field.mapValueType)}(); break;`)
            }
        } else if (field.mapValueIsEnum) {
            lines.push('      case 2: mv = r.uint32(); break;')
        } else {
            lines.push(
                `      case 2: { const _len = r.uint32(); mv = ${mapValueTypeExpr(field)}.decodeFrom(r, r.pos + _len); break; }`
            )
        }
        lines.push('      default: r.skipTag(mt);')
        lines.push('    }')
        lines.push('  }')
        lines.push(`  ${accessor}.set(mk, mv);`)
        lines.push('  break;')
        lines.push('}')
        return lines
    }

    // Repeated field
    if (field.label === 'repeated') {
        if (field.packed && isScalarType(field.type)) {
            // Packed repeated fields must also accept the unpacked wire form.
            const lines: string[] = []
            lines.push(`case ${field.number}: {`)
            lines.push(`  if ((tag & 7) === ${WIRE_LENGTH_DELIMITED}) {`)
            lines.push('    const pLen = r.uint32();')
            lines.push('    const pEnd = r.pos + pLen;')
            if (is64BitLoHi(field.type)) {
                const readExpr = `r.${getReaderBigIntMethod(field.type)}()`
                lines.push(
                    `    while (r.pos < pEnd) { ${accessor}.push(${fromBigIntExpr(readExpr, int64As)}); }`
                )
            } else {
                lines.push(
                    `    while (r.pos < pEnd) { ${accessor}.push(r.${getReaderMethod(field.type)}()); }`
                )
            }
            lines.push('  } else {')
            if (is64BitLoHi(field.type)) {
                const readExpr = `r.${getReaderBigIntMethod(field.type)}()`
                lines.push(`    ${accessor}.push(${fromBigIntExpr(readExpr, int64As)});`)
            } else {
                lines.push(`    ${accessor}.push(r.${getReaderMethod(field.type)}());`)
            }
            lines.push('  }')
            lines.push('  break;')
            lines.push('}')
            return lines
        }
        if (field.isMessage && field.isGroup) {
            return [
                `case ${field.number}: ${accessor}.push(${typeRef}.decode(r.group(${field.number}))); break;`
            ]
        }
        if (field.isMessage) {
            return [
                `case ${field.number}: { const _len = r.uint32(); ${accessor}.push(${typeRef}.decodeFrom(r, r.pos + _len)); break; }`
            ]
        }
        if (field.isEnum) {
            return [`case ${field.number}: ${accessor}.push(r.uint32()); break;`]
        }
        // Repeated scalar non-packed
        if (is64BitLoHi(field.type)) {
            const readExpr = `r.${getReaderBigIntMethod(field.type)}()`
            return [
                `case ${field.number}: ${accessor}.push(${fromBigIntExpr(readExpr, int64As)}); break;`
            ]
        }
        return [
            `case ${field.number}: ${accessor}.push(r.${getReaderMethod(field.type)}()); break;`
        ]
    }

    // Singular message
    if (field.isMessage && field.isGroup) {
        return [
            `case ${field.number}: ${accessor} = ${typeRef}.decode(r.group(${field.number})); break;`
        ]
    }

    if (field.isMessage) {
        return [
            `case ${field.number}: { const _len = r.uint32(); ${accessor} = ${typeRef}.decodeFrom(r, r.pos + _len); break; }`
        ]
    }

    // Singular enum
    if (field.isEnum) {
        return [`case ${field.number}: ${accessor} = r.uint32(); break;`]
    }

    // Singular scalar
    if (is64BitLoHi(field.type)) {
        const readExpr = `r.${getReaderBigIntMethod(field.type)}()`
        return [`case ${field.number}: ${accessor} = ${fromBigIntExpr(readExpr, int64As)}; break;`]
    }
    return [`case ${field.number}: ${accessor} = r.${getReaderMethod(field.type)}(); break;`]
}
