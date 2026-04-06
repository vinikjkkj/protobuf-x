import type { MessageNode, FieldNode, EnumNode, EnumValueNode } from '../ast/nodes.js'

/**
 * Built-in AST definitions for google.protobuf well-known types.
 * These are minimal AST representations, not full proto file parses.
 */

// ── Helpers ──────────────────────────────────────────────────

function makeField(
    name: string,
    type: string,
    number: number,
    rule?: 'optional' | 'required' | 'repeated'
): FieldNode {
    return { kind: 'field', name, type, number, rule, options: [], line: 0, column: 0 }
}

function makeEnumValue(name: string, number: number): EnumValueNode {
    return { kind: 'enum_value', name, number, options: [], line: 0, column: 0 }
}

function makeMessage(name: string, fields: FieldNode[], extra?: Partial<MessageNode>): MessageNode {
    return {
        kind: 'message',
        name,
        fields,
        nestedMessages: [],
        nestedEnums: [],
        oneofs: [],
        mapFields: [],
        reserved: [],
        options: [],
        extensions: [],
        extends: [],
        line: 0,
        column: 0,
        ...extra
    }
}

function makeEnum(name: string, values: EnumValueNode[]): EnumNode {
    return { kind: 'enum', name, values, options: [], reserved: [], line: 0, column: 0 }
}

// ── google.protobuf.Timestamp ────────────────────────────────

export const Timestamp: MessageNode = makeMessage('Timestamp', [
    makeField('seconds', 'int64', 1),
    makeField('nanos', 'int32', 2)
])

// ── google.protobuf.Duration ─────────────────────────────────

export const Duration: MessageNode = makeMessage('Duration', [
    makeField('seconds', 'int64', 1),
    makeField('nanos', 'int32', 2)
])

// ── google.protobuf.Any ──────────────────────────────────────

export const Any: MessageNode = makeMessage('Any', [
    makeField('type_url', 'string', 1),
    makeField('value', 'bytes', 2)
])

// ── google.protobuf.Empty ────────────────────────────────────

export const Empty: MessageNode = makeMessage('Empty', [])

// ── google.protobuf.FieldMask ────────────────────────────────

export const FieldMask: MessageNode = makeMessage('FieldMask', [
    makeField('paths', 'string', 1, 'repeated')
])

// ── google.protobuf.Struct ───────────────────────────────────

const NullValue: EnumNode = makeEnum('NullValue', [makeEnumValue('NULL_VALUE', 0)])

export const Value: MessageNode = makeMessage('Value', [
    makeField('null_value', 'NullValue', 1),
    makeField('number_value', 'double', 2),
    makeField('string_value', 'string', 3),
    makeField('bool_value', 'bool', 4),
    makeField('struct_value', 'Struct', 5),
    makeField('list_value', 'ListValue', 6)
])

export const Struct: MessageNode = makeMessage('Struct', [], {
    mapFields: [
        {
            kind: 'map_field',
            name: 'fields',
            keyType: 'string',
            valueType: 'Value',
            number: 1,
            options: [],
            line: 0,
            column: 0
        }
    ]
})

export const ListValue: MessageNode = makeMessage('ListValue', [
    makeField('values', 'Value', 1, 'repeated')
])

// ── google.protobuf Wrappers ─────────────────────────────────

export const DoubleValue: MessageNode = makeMessage('DoubleValue', [
    makeField('value', 'double', 1)
])

export const FloatValue: MessageNode = makeMessage('FloatValue', [makeField('value', 'float', 1)])

export const Int64Value: MessageNode = makeMessage('Int64Value', [makeField('value', 'int64', 1)])

export const UInt64Value: MessageNode = makeMessage('UInt64Value', [
    makeField('value', 'uint64', 1)
])

export const Int32Value: MessageNode = makeMessage('Int32Value', [makeField('value', 'int32', 1)])

export const UInt32Value: MessageNode = makeMessage('UInt32Value', [
    makeField('value', 'uint32', 1)
])

export const BoolValue: MessageNode = makeMessage('BoolValue', [makeField('value', 'bool', 1)])

export const StringValue: MessageNode = makeMessage('StringValue', [
    makeField('value', 'string', 1)
])

export const BytesValue: MessageNode = makeMessage('BytesValue', [makeField('value', 'bytes', 1)])

// ── Aggregate map ────────────────────────────────────────────

/** Map of fully qualified name to AST node for all well-known types. */
export const WELL_KNOWN_TYPES: ReadonlyMap<string, MessageNode | EnumNode> = new Map<
    string,
    MessageNode | EnumNode
>([
    ['google.protobuf.Timestamp', Timestamp],
    ['google.protobuf.Duration', Duration],
    ['google.protobuf.Any', Any],
    ['google.protobuf.Empty', Empty],
    ['google.protobuf.FieldMask', FieldMask],
    ['google.protobuf.Struct', Struct],
    ['google.protobuf.Value', Value],
    ['google.protobuf.ListValue', ListValue],
    ['google.protobuf.NullValue', NullValue],
    ['google.protobuf.DoubleValue', DoubleValue],
    ['google.protobuf.FloatValue', FloatValue],
    ['google.protobuf.Int64Value', Int64Value],
    ['google.protobuf.UInt64Value', UInt64Value],
    ['google.protobuf.Int32Value', Int32Value],
    ['google.protobuf.UInt32Value', UInt32Value],
    ['google.protobuf.BoolValue', BoolValue],
    ['google.protobuf.StringValue', StringValue],
    ['google.protobuf.BytesValue', BytesValue]
])

/** Check whether a fully qualified type name is a well-known type. */
export function isWellKnownType(fqn: string): boolean {
    return WELL_KNOWN_TYPES.has(fqn)
}

/** Get the well-known type definition, or undefined. */
export function getWellKnownType(fqn: string): MessageNode | EnumNode | undefined {
    return WELL_KNOWN_TYPES.get(fqn)
}
