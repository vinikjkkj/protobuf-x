import type { WireType } from '../binary/wire-type.js'

import type { ScalarType } from './scalars.js'

/** Rule for a field (proto3 semantics). */
export const enum FieldRule {
    /** Optional/singular field (proto3 default). */
    SINGULAR = 0,
    /** Repeated field. */
    REPEATED = 1,
    /** Map field. */
    MAP = 2
}

/** Describes a single field in a message. */
export interface FieldDescriptor {
    /** Field number (from .proto file). */
    readonly no: number
    /** Field name (from .proto file). */
    readonly name: string
    /** JSON name (camelCase). Defaults to `name` when omitted. */
    readonly jsonName?: string
    /** Wire type for encoding. */
    readonly wireType: WireType
    /** Pre-computed tag bytes (field_number << 3 | wire_type, varint encoded). */
    readonly tag: Uint8Array
    /** Scalar type, if this is a scalar field. */
    readonly scalarType?: ScalarType
    /** Message type name, if this is a message field. */
    readonly messageType?: string
    /** Enum type name, if this is an enum field. */
    readonly enumType?: string
    /** Field rule. Defaults to `FieldRule.SINGULAR` when omitted. */
    readonly rule?: FieldRule
    /** Whether this field uses packed encoding. Defaults to `false` when omitted. */
    readonly packed?: boolean
    /** Oneof group name, if part of a oneof. */
    readonly oneof?: string
    /** Map key type, if this is a map field. */
    readonly mapKeyType?: ScalarType
    /** Map value type descriptor, if this is a map field. */
    readonly mapValueType?: ScalarType | string
}
