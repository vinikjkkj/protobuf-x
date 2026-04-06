/** Base interface for all AST nodes. */
export interface BaseNode {
    /** Starting line number (1-based). */
    readonly line: number
    /** Starting column number (1-based). */
    readonly column: number
}

/** Root node representing a .proto file. */
export interface ProtoFileNode extends BaseNode {
    readonly kind: 'file'
    readonly syntax: 'proto2' | 'proto3'
    readonly edition?: string
    readonly package: string
    readonly imports: ImportNode[]
    readonly options: OptionNode[]
    readonly messages: MessageNode[]
    readonly enums: EnumNode[]
    readonly services: ServiceNode[]
    readonly extends: ExtendNode[]
}

/** A message definition. */
export interface MessageNode extends BaseNode {
    readonly kind: 'message'
    readonly name: string
    readonly fields: FieldNode[]
    readonly nestedMessages: MessageNode[]
    readonly nestedEnums: EnumNode[]
    readonly oneofs: OneofNode[]
    readonly mapFields: MapFieldNode[]
    readonly reserved: ReservedNode[]
    readonly options: OptionNode[]
    readonly extensions: ExtensionsNode[]
    readonly extends: ExtendNode[]
}

/** A field rule for proto2/proto3. */
export type FieldRule = 'optional' | 'required' | 'repeated'

/** A message field. */
export interface FieldNode extends BaseNode {
    readonly kind: 'field'
    readonly name: string
    readonly type: string
    readonly number: number
    readonly rule: FieldRule | undefined
    readonly options: OptionNode[]
    readonly isGroup?: boolean
}

/** An enum definition. */
export interface EnumNode extends BaseNode {
    readonly kind: 'enum'
    readonly name: string
    readonly values: EnumValueNode[]
    readonly options: OptionNode[]
    readonly reserved: ReservedNode[]
}

/** An enum value. */
export interface EnumValueNode extends BaseNode {
    readonly kind: 'enum_value'
    readonly name: string
    readonly number: number
    readonly options: OptionNode[]
}

/** A service definition. */
export interface ServiceNode extends BaseNode {
    readonly kind: 'service'
    readonly name: string
    readonly methods: MethodNode[]
    readonly options: OptionNode[]
}

/** An RPC method definition. */
export interface MethodNode extends BaseNode {
    readonly kind: 'method'
    readonly name: string
    readonly inputType: string
    readonly outputType: string
    readonly clientStreaming: boolean
    readonly serverStreaming: boolean
    readonly options: OptionNode[]
}

/** A oneof group. */
export interface OneofNode extends BaseNode {
    readonly kind: 'oneof'
    readonly name: string
    readonly fields: FieldNode[]
    readonly options: OptionNode[]
}

/** A map field. */
export interface MapFieldNode extends BaseNode {
    readonly kind: 'map_field'
    readonly name: string
    readonly keyType: string
    readonly valueType: string
    readonly number: number
    readonly options: OptionNode[]
}

/** An import statement. */
export interface ImportNode extends BaseNode {
    readonly kind: 'import'
    readonly path: string
    readonly modifier: 'public' | 'weak' | 'none'
}

/** An option statement. */
export interface OptionNode extends BaseNode {
    readonly kind: 'option'
    readonly name: string
    readonly value: OptionValue
}

/** Possible option value types. */
export type OptionValue = string | number | boolean | OptionAggregate

/** An aggregate option value { key: val, ... }. */
export interface OptionAggregate {
    readonly [key: string]: OptionValue | OptionValue[]
}

/** A reserved statement. */
export interface ReservedNode extends BaseNode {
    readonly kind: 'reserved'
    readonly ranges: ReservedRange[]
    readonly names: string[]
}

/** A reserved range (from-to inclusive, or single number). */
export interface ReservedRange {
    readonly from: number
    readonly to: number // same as 'from' for single values; MAX_INT for 'max'
}

/** An extensions range statement. */
export interface ExtensionsNode extends BaseNode {
    readonly kind: 'extensions'
    readonly ranges: ReservedRange[]
}

/** An extend block. */
export interface ExtendNode extends BaseNode {
    readonly kind: 'extend'
    readonly typeName: string
    readonly fields: FieldNode[]
}

/** Union of all AST node types. */
export type AstNode =
    | ProtoFileNode
    | MessageNode
    | FieldNode
    | EnumNode
    | EnumValueNode
    | ServiceNode
    | MethodNode
    | OneofNode
    | MapFieldNode
    | ImportNode
    | OptionNode
    | ReservedNode
    | ExtensionsNode
    | ExtendNode

/** Maximum field number for proto reserved ranges. */
export const FIELD_NUMBER_MAX = 536870911 // 2^29 - 1
