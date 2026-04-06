import type { FieldDescriptor } from './field.js'

/** Describes a field-number range from a schema. */
export interface FieldNumberRangeDescriptor {
    readonly from: number
    readonly to: number
}

/** Describes an extension field attached to an extendee type. */
export interface ExtensionDescriptor {
    readonly extendee: string
    readonly field: FieldDescriptor
}

/** Describes a protobuf message type. */
export interface MessageDescriptor {
    /** Fully qualified message name (e.g., "package.MessageName"). */
    readonly name: string
    /** All fields in this message. */
    readonly fields: readonly FieldDescriptor[]
    /** Oneof group names. */
    readonly oneofs: readonly string[]
    /** Nested message types (by name). */
    readonly nestedTypes: ReadonlyMap<string, MessageDescriptor>
    /** Nested enum types (by name). */
    readonly nestedEnums: ReadonlyMap<string, EnumDescriptor>
    /** Reserved field-number ranges declared on the message. */
    readonly reservedRanges?: readonly FieldNumberRangeDescriptor[]
    /** Reserved field names declared on the message. */
    readonly reservedNames?: readonly string[]
    /** Declared extension ranges for the message. */
    readonly extensionRanges?: readonly FieldNumberRangeDescriptor[]
    /** Known extension field descriptors attached to the message. */
    readonly extensions?: readonly ExtensionDescriptor[]
}

/** Describes a protobuf enum type. */
export interface EnumDescriptor {
    /** Fully qualified enum name. */
    readonly name: string
    /** Enum values: name → number. */
    readonly values: ReadonlyMap<string, number>
    /** Reverse mapping: number → name. */
    readonly valuesByNumber: ReadonlyMap<number, string>
    /** Reserved numeric ranges declared on the enum. */
    readonly reservedRanges?: readonly FieldNumberRangeDescriptor[]
    /** Reserved symbolic names declared on the enum. */
    readonly reservedNames?: readonly string[]
}

/** Describes a protobuf service. */
export interface ServiceDescriptor {
    /** Fully qualified service name. */
    readonly name: string
    /** RPC methods. */
    readonly methods: readonly MethodDescriptor[]
}

/** Describes a single RPC method in a service. */
export interface MethodDescriptor {
    /** Method name. */
    readonly name: string
    /** Input message type name. */
    readonly inputType: string
    /** Output message type name. */
    readonly outputType: string
    /** Whether the client streams input. */
    readonly clientStreaming: boolean
    /** Whether the server streams output. */
    readonly serverStreaming: boolean
}
