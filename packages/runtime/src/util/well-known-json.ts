/**
 * Special JSON serialization/deserialization for protobuf well-known types.
 * Follows the canonical proto3 JSON mapping specification.
 */

const WELL_KNOWN_TYPES = new Set([
    'google.protobuf.Timestamp',
    'google.protobuf.Duration',
    'google.protobuf.Any',
    'google.protobuf.Struct',
    'google.protobuf.Value',
    'google.protobuf.ListValue',
    'google.protobuf.FieldMask',
    'google.protobuf.Empty',
    'google.protobuf.DoubleValue',
    'google.protobuf.FloatValue',
    'google.protobuf.Int64Value',
    'google.protobuf.UInt64Value',
    'google.protobuf.Int32Value',
    'google.protobuf.UInt32Value',
    'google.protobuf.BoolValue',
    'google.protobuf.StringValue',
    'google.protobuf.BytesValue'
])

const WRAPPER_TYPES = new Set([
    'google.protobuf.DoubleValue',
    'google.protobuf.FloatValue',
    'google.protobuf.Int64Value',
    'google.protobuf.UInt64Value',
    'google.protobuf.Int32Value',
    'google.protobuf.UInt32Value',
    'google.protobuf.BoolValue',
    'google.protobuf.StringValue',
    'google.protobuf.BytesValue'
])

/**
 * Check whether a fully-qualified type name is a well-known type that
 * requires special JSON handling.
 */
export function isWellKnownType(typeName: string): boolean {
    return WELL_KNOWN_TYPES.has(typeName)
}

/**
 * Serialize a well-known type message to its canonical JSON representation.
 */
export function wellKnownToJSON(typeName: string, msg: Record<string, unknown>): unknown {
    switch (typeName) {
        case 'google.protobuf.Timestamp':
            return timestampToJSON(msg)
        case 'google.protobuf.Duration':
            return durationToJSON(msg)
        case 'google.protobuf.Any':
            return anyToJSON(msg)
        case 'google.protobuf.Struct':
            return structToJSON(msg)
        case 'google.protobuf.Value':
            return valueToJSON(msg)
        case 'google.protobuf.ListValue':
            return listValueToJSON(msg)
        case 'google.protobuf.FieldMask':
            return fieldMaskToJSON(msg)
        case 'google.protobuf.Empty':
            return {}
        default:
            if (WRAPPER_TYPES.has(typeName)) {
                return msg.value
            }
            return msg
    }
}

/**
 * Deserialize a well-known type from its canonical JSON representation.
 */
export function wellKnownFromJSON(typeName: string, json: unknown): Record<string, unknown> {
    switch (typeName) {
        case 'google.protobuf.Timestamp':
            return timestampFromJSON(json)
        case 'google.protobuf.Duration':
            return durationFromJSON(json)
        case 'google.protobuf.Any':
            return anyFromJSON(json)
        case 'google.protobuf.Struct':
            return structFromJSON(json)
        case 'google.protobuf.Value':
            return valueFromJSON(json)
        case 'google.protobuf.ListValue':
            return listValueFromJSON(json)
        case 'google.protobuf.FieldMask':
            return fieldMaskFromJSON(json)
        case 'google.protobuf.Empty':
            return {}
        default:
            if (WRAPPER_TYPES.has(typeName)) {
                return { value: json }
            }
            if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
                return json as Record<string, unknown>
            }
            return {}
    }
}

// --- Timestamp ---

function timestampToJSON(msg: Record<string, unknown>): string {
    const seconds = typeof msg.seconds === 'number' ? msg.seconds : 0
    const nanos = typeof msg.nanos === 'number' ? msg.nanos : 0
    const millis = seconds * 1000 + Math.floor(nanos / 1_000_000)
    const date = new Date(millis)
    const remainingNanos = nanos % 1_000_000
    if (remainingNanos === 0) {
        return date.toISOString()
    }
    // For sub-millisecond precision, append nanoseconds
    const isoBase = date.toISOString().replace(/\.\d{3}Z$/, '')
    const fracSeconds = nanos.toString().padStart(9, '0').replace(/0+$/, '')
    return `${isoBase}.${fracSeconds}Z`
}

function timestampFromJSON(json: unknown): Record<string, unknown> {
    if (typeof json !== 'string') {
        return { seconds: 0, nanos: 0 }
    }
    const date = new Date(json)
    const totalMillis = date.getTime()
    const seconds = Math.floor(totalMillis / 1000)
    // Extract sub-second nanos from the string for precision beyond millis
    const match = json.match(/\.(\d+)Z$/)
    let nanos = 0
    if (match) {
        const frac = match[1]!.padEnd(9, '0').slice(0, 9)
        nanos = parseInt(frac, 10)
    } else {
        nanos = (totalMillis % 1000) * 1_000_000
    }
    return { seconds, nanos }
}

// --- Duration ---

function durationToJSON(msg: Record<string, unknown>): string {
    const seconds = typeof msg.seconds === 'number' ? msg.seconds : 0
    const nanos = typeof msg.nanos === 'number' ? msg.nanos : 0
    if (nanos === 0) {
        return `${seconds}s`
    }
    const sign = seconds < 0 || nanos < 0 ? '-' : ''
    const absSeconds = Math.abs(seconds)
    const absNanos = Math.abs(nanos)
    const fracPart = absNanos.toString().padStart(9, '0').replace(/0+$/, '')
    return `${sign}${absSeconds}.${fracPart}s`
}

function durationFromJSON(json: unknown): Record<string, unknown> {
    if (typeof json !== 'string') {
        return { seconds: 0, nanos: 0 }
    }
    const match = json.match(/^(-?)(\d+)(?:\.(\d+))?s$/)
    if (!match) {
        return { seconds: 0, nanos: 0 }
    }
    const negative = match[1] === '-'
    const absSeconds = parseInt(match[2]!, 10)
    let absNanos = 0
    if (match[3]) {
        absNanos = parseInt(match[3].padEnd(9, '0').slice(0, 9), 10)
    }
    return {
        seconds: negative ? -absSeconds : absSeconds,
        nanos: negative ? -absNanos : absNanos
    }
}

// --- Any ---

function anyToJSON(msg: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    if (typeof msg.type_url === 'string') {
        result['@type'] = msg.type_url
    }
    // Copy any additional fields that might have been unpacked
    for (const [key, val] of Object.entries(msg)) {
        if (key !== 'type_url' && key !== 'value') {
            result[key] = val
        }
    }
    return result
}

function anyFromJSON(json: unknown): Record<string, unknown> {
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        return { type_url: '', value: new Uint8Array(0) }
    }
    const obj = json as Record<string, unknown>
    const result: Record<string, unknown> = {
        type_url: typeof obj['@type'] === 'string' ? obj['@type'] : '',
        value: new Uint8Array(0)
    }
    for (const [key, val] of Object.entries(obj)) {
        if (key !== '@type') {
            result[key] = val
        }
    }
    return result
}

// --- Struct ---

function structToJSON(msg: Record<string, unknown>): Record<string, unknown> {
    const fields = msg.fields
    const result: Record<string, unknown> = {}
    if (fields instanceof Map) {
        for (const [key, val] of fields) {
            result[key as string] = valueToJSON(val as Record<string, unknown>)
        }
    } else if (typeof fields === 'object' && fields !== null) {
        for (const [key, val] of Object.entries(fields as Record<string, unknown>)) {
            result[key] = valueToJSON(val as Record<string, unknown>)
        }
    }
    return result
}

function structFromJSON(json: unknown): Record<string, unknown> {
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        return { fields: new Map() }
    }
    const fields = new Map<string, Record<string, unknown>>()
    for (const [key, val] of Object.entries(json as Record<string, unknown>)) {
        fields.set(key, valueFromJSON(val))
    }
    return { fields }
}

// --- Value ---

function valueToJSON(msg: Record<string, unknown>): unknown {
    const kind = msg.kind
    if (typeof kind === 'object' && kind !== null && 'case' in kind) {
        // Discriminated union style
        const du = kind as { case: string; value: unknown }
        return unwrapValueCase(du.case, du.value)
    }
    // Direct field style
    if (msg.nullValue !== undefined) return null
    if (msg.numberValue !== undefined) return msg.numberValue
    if (msg.stringValue !== undefined) return msg.stringValue
    if (msg.boolValue !== undefined) return msg.boolValue
    if (msg.structValue !== undefined)
        return structToJSON(msg.structValue as Record<string, unknown>)
    if (msg.listValue !== undefined)
        return listValueToJSON(msg.listValue as Record<string, unknown>)
    return null
}

function unwrapValueCase(caseName: string, value: unknown): unknown {
    switch (caseName) {
        case 'nullValue':
            return null
        case 'numberValue':
            return value
        case 'stringValue':
            return value
        case 'boolValue':
            return value
        case 'structValue':
            return structToJSON(value as Record<string, unknown>)
        case 'listValue':
            return listValueToJSON(value as Record<string, unknown>)
        default:
            return null
    }
}

function valueFromJSON(json: unknown): Record<string, unknown> {
    if (json === null || json === undefined) {
        return { nullValue: 0 }
    }
    if (typeof json === 'number') {
        return { numberValue: json }
    }
    if (typeof json === 'string') {
        return { stringValue: json }
    }
    if (typeof json === 'boolean') {
        return { boolValue: json }
    }
    if (Array.isArray(json)) {
        return { listValue: listValueFromJSON(json) }
    }
    if (typeof json === 'object') {
        return { structValue: structFromJSON(json) }
    }
    return { nullValue: 0 }
}

// --- ListValue ---

function listValueToJSON(msg: Record<string, unknown>): unknown[] {
    const values = msg.values
    if (!Array.isArray(values)) {
        return []
    }
    return values.map((v: unknown) => valueToJSON(v as Record<string, unknown>))
}

function listValueFromJSON(json: unknown): Record<string, unknown> {
    if (!Array.isArray(json)) {
        return { values: [] }
    }
    return {
        values: json.map((item: unknown) => valueFromJSON(item))
    }
}

// --- FieldMask ---

function fieldMaskToJSON(msg: Record<string, unknown>): string {
    const paths = msg.paths
    if (!Array.isArray(paths)) {
        return ''
    }
    return paths.map((p: unknown) => toCamelCase(String(p))).join(',')
}

function fieldMaskFromJSON(json: unknown): Record<string, unknown> {
    if (typeof json !== 'string') {
        return { paths: [] }
    }
    if (json === '') {
        return { paths: [] }
    }
    return {
        paths: json.split(',').map((p) => toSnakeCase(p.trim()))
    }
}

function toCamelCase(name: string): string {
    return name.replace(/_([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
}

function toSnakeCase(name: string): string {
    return name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
}
