/**
 * Message class code generation:
 * Generates full TypeScript class extending Message<T> with encode/decode.
 */

import type { ProtoEnum } from './enum-codegen.js'
import { generateEnum, generateEnumDescriptor } from './enum-codegen.js'
import type { ProtoRange } from './extension-codegen.js'
import type { ProtoField } from './field-codegen.js'
import {
    fieldDescriptorConstName,
    getTypeScriptType,
    getDefaultValue,
    getWireType,
    computeTagBytes,
    generateFieldDescriptor,
    generateEncodeField,
    generateDecodeField,
    generateSizeOfField,
    generateEncodeToField,
    isScalarType,
    mapValueTypeExpr,
    scalarToTsType
} from './field-codegen.js'
import type { ProtoOneof } from './oneof-codegen.js'
import {
    generateOneofCaseEnum,
    generateOneofType,
    getOneofFieldDeclaration,
    generateOneofEncodeLines,
    generateOneofDecodeLines,
    generateOneofSizeOfLines,
    generateOneofEncodeToLines
} from './oneof-codegen.js'
import { CodeTemplate } from './template.js'

export const RUNTIME_MESSAGE_BASE = '__PBXMessageBase'

/** Represents a parsed proto message for code generation. */
export interface ProtoMessage {
    name: string
    generatedName?: string
    fullName?: string
    reservedRanges?: ProtoRange[]
    reservedNames?: string[]
    extensionRanges?: ProtoRange[]
    fields: ProtoField[]
    oneofs: ProtoOneof[]
    nestedMessages: ProtoMessage[]
    nestedEnums: ProtoEnum[]
}

function descriptorScope(parts: readonly string[]): string {
    return parts.join('_')
}

function formatRangeArray(ranges?: readonly ProtoRange[]): string {
    if (!ranges || ranges.length === 0) {
        return ''
    }
    return ranges.map((range) => `{ from: ${range.from}, to: ${range.to} }`).join(', ')
}

/**
 * Generate a full message class.
 *
 * @param message - The parsed proto message definition.
 * @param packageName - The proto package name (for fully qualified names).
 * @returns The complete TypeScript class code string.
 */
export type Int64Mode = 'bigint' | 'number' | 'string'

export interface MessageCodegenOptions {
    /** Skip generating toJSON/fromJSON methods + JSON interfaces + JSON namespace aliases. */
    noJson?: boolean
    /** JS representation for 64-bit integer fields. Defaults to 'bigint'. */
    int64As?: Int64Mode
}

export function generateMessage(
    message: ProtoMessage,
    packageName?: string,
    enclosingNames: string[] = [],
    options: MessageCodegenOptions = {}
): string {
    const noJson = options.noJson === true
    const int64As: Int64Mode = options.int64As ?? 'bigint'
    const t = new CodeTemplate()
    const generatedName = message.generatedName ?? message.name
    const typePath = [...enclosingNames, generatedName]
    const fqName =
        message.fullName ?? (packageName ? `${packageName}.${message.name}` : message.name)
    const fieldScope = descriptorScope(typePath)

    // Separate oneof fields from regular fields
    const oneofFieldNames = new Set<string>()
    for (const oneof of message.oneofs) {
        for (const f of oneof.fields) {
            oneofFieldNames.add(f.name)
        }
    }
    const regularFields = message.fields.filter((f) => !oneofFieldNames.has(f.name))
    const repeatedStringFields = regularFields.filter(
        (f) => f.type === 'string' && f.label === 'repeated' && !f.mapKeyType
    )
    const hasFieldInitializers = regularFields.some((field) => {
        const optionalPresence =
            (field.hasPresence || field.isRequired) &&
            field.label !== 'repeated' &&
            !field.mapKeyType
        const optionalMessage = field.isMessage && field.label !== 'repeated' && !field.mapKeyType
        return !optionalPresence && !optionalMessage
    })
    const canBypassConstructor = message.oneofs.length === 0 && !hasFieldInitializers
    const firstDecodeStringField =
        regularFields.length > 0 && (regularFields.length <= 16 || regularFields.length >= 64)
            ? (() => {
                  const f = regularFields[0]!
                  if (
                      f.type === 'string' &&
                      !f.isMessage &&
                      !f.isEnum &&
                      !f.mapKeyType &&
                      !f.isGroup &&
                      f.label !== 'repeated'
                  ) {
                      return f
                  }
                  return undefined
              })()
            : undefined

    // Generate nested types first (outside the class, as sibling types)
    for (const nested of message.nestedEnums) {
        t.raw(generateEnum(nested))
        t.blank()
        t.raw(generateEnumDescriptor(nested))
        t.blank()
    }

    // Generate oneof case enums and discriminated union types
    for (const oneof of message.oneofs) {
        t.raw(generateOneofCaseEnum(oneof, generatedName))
        t.blank()
        t.raw(generateOneofType(oneof, generatedName, int64As))
        t.blank()
    }

    // Generate nested message classes
    for (const nested of message.nestedMessages) {
        t.raw(generateMessage(nested, packageName, typePath, options))
        t.blank()
    }

    // Generate POJO input interface (`IFoo`) — protobufjs-compatible shape.
    // Erased at compile time, zero bundle cost. All fields are optional and
    // nullable so plain objects (not class instances) can satisfy the type.
    // Nested message fields reference the I-prefixed peer (e.g. `IUser_Profile`).
    const interfaceName = `I${generatedName}`
    t.block(`export interface ${interfaceName} {`, () => {
        for (const field of regularFields) {
            t.line(`${field.name}?: ${getInterfaceFieldType(field, int64As)} | null;`)
        }
        for (const oneof of message.oneofs) {
            // Oneofs keep the discriminated union shape — protobufjs flattens
            // them, but reproducing that here would create two parallel
            // representations and ambiguous semantics. Migrators need to
            // rewrite oneof read sites; this is documented in the README.
            const oneofTypeName = `${generatedName}_${oneof.name.charAt(0).toUpperCase() + oneof.name.slice(1)}`
            t.line(`${oneof.name}?: ${oneofTypeName} | null;`)
        }
    })
    t.blank()

    // Generate JSON interface (erased at compile time — zero bundle cost)
    const jsonName = `${generatedName}JSON`
    if (!noJson) {
        t.block(`export interface ${jsonName} {`, () => {
            for (const field of regularFields) {
                const jsonKey = field.jsonName ?? toCamelCase(field.name)
                const jsonType = getJsonFieldType(field)
                const optional =
                    (field.hasPresence || field.isRequired || field.isMessage) &&
                    field.label !== 'repeated' &&
                    !field.mapKeyType
                t.line(`${jsonKey}${optional ? '?' : ''}: ${jsonType};`)
            }
            for (const oneof of message.oneofs) {
                const oneofTypeName = `${generatedName}_${oneof.name.charAt(0).toUpperCase() + oneof.name.slice(1)}`
                t.line(`${oneof.name}?: ${oneofTypeName};`)
            }
        })
        t.blank()
    }

    // Generate field descriptors
    for (const field of message.fields) {
        t.raw(generateFieldDescriptor(field, fieldScope))
    }
    if (message.fields.length > 0) {
        t.blank()
    }

    for (const field of repeatedStringFields) {
        t.line(`let _sbl_${fieldScope}_${field.name} = new Int32Array(16);`)
    }
    if (repeatedStringFields.length > 0) {
        t.blank()
    }

    // Generate class. The `implements I${generatedName}` clause guarantees
    // structural consistency between the class shape and the POJO input interface.
    t.block(
        `export class ${generatedName} extends ${RUNTIME_MESSAGE_BASE}<${generatedName}> implements ${interfaceName} {`,
        () => {
            // Field declarations with defaults
            for (const field of regularFields) {
                const tsType = getTypeScriptType(field, int64As)
                const defaultVal = getDefaultValue(field, int64As)
                if (
                    (field.hasPresence || field.isRequired) &&
                    field.label !== 'repeated' &&
                    !field.mapKeyType
                ) {
                    t.line(`${field.name}?: ${tsType};`)
                } else if (field.isMessage && field.label !== 'repeated' && !field.mapKeyType) {
                    t.line(`${field.name}?: ${tsType};`)
                } else {
                    t.line(`${field.name}: ${tsType} = ${defaultVal};`)
                }
            }

            // Oneof fields
            for (const oneof of message.oneofs) {
                t.line(getOneofFieldDeclaration(oneof, generatedName))
            }

            t.blank()

            // Constructor
            t.block(`constructor(init?: Partial<${generatedName}>) {`, () => {
                t.line('super();')
                t.line('if (init) Object.assign(this, init);')
            })

            t.blank()

            // Descriptor
            t.block('static readonly descriptor: MessageDescriptor = {', () => {
                t.line(`name: '${fqName}',`)
                t.line(
                    `fields: [${message.fields
                        .map((field) => fieldDescriptorConstName(field, fieldScope))
                        .join(', ')}],`
                )
                const oneofNames = message.oneofs.map((o) => `'${o.name}'`).join(', ')
                t.line(`oneofs: [${oneofNames}],`)
                t.line(
                    `nestedTypes: new Map([${message.nestedMessages
                        .map(
                            (nested) =>
                                `['${nested.name}', ${nested.generatedName ?? nested.name}.descriptor]`
                        )
                        .join(', ')}]),`
                )
                t.line(
                    `nestedEnums: new Map([${message.nestedEnums
                        .map(
                            (nested) =>
                                `['${nested.name}', ${nested.generatedName ?? nested.name}Descriptor]`
                        )
                        .join(', ')}]),`
                )
                t.line(`reservedRanges: [${formatRangeArray(message.reservedRanges)}],`)
                const reservedNames =
                    message.reservedNames?.map((name) => `'${name}'`).join(', ') ?? ''
                t.line(`reservedNames: [${reservedNames}],`)
                t.line(`extensionRanges: [${formatRangeArray(message.extensionRanges)}],`)
                t.line('extensions: [],')
            })

            t.blank()

            // Static encode
            t.block(
                `static encode(msg: ${generatedName}, w?: BinaryWriter): BinaryWriter {`,
                () => {
                    // When no writer provided:
                    // - For instances: use toBinary() which inlines immediate-level nested sizes
                    //   (cached _ms_*), avoiding double sizeOf traversals at the top level.
                    // - For plain objects: fall back to standalone sizeOf+encodeTo two-pass.
                    t.block('if (w === undefined) {', () => {
                        t.block(`if (msg instanceof ${generatedName}) {`, () => {
                            t.line('return BinaryWriter.fromBytes(msg.toBinary());')
                        })
                        t.line(`const s = ${generatedName}.sizeOf(msg);`)
                        t.line('if (s === 0) return BinaryWriter.create();')
                        t.line('const buf = allocBuf(s);')
                        t.line(`${generatedName}.encodeTo(msg, buf, 0);`)
                        t.line('return BinaryWriter.fromBytes(finalizeBuf(buf, s));')
                    })

                    // When writer provided (nested message encode), write directly into it.
                    // Regular fields
                    for (const field of regularFields) {
                        const lines = generateEncodeField(field, fieldScope, int64As)
                        for (const line of lines) {
                            t.line(line)
                        }
                    }

                    // Oneof fields
                    for (const oneof of message.oneofs) {
                        const lines = generateOneofEncodeLines(oneof, fieldScope, int64As)
                        for (const line of lines) {
                            t.line(line)
                        }
                    }

                    t.line('return w;')
                }
            )

            t.blank()

            // Static sizeOf
            t.block(`static sizeOf(msg: ${generatedName}): number {`, () => {
                t.line('let s = 0;')

                // Regular fields
                for (const field of regularFields) {
                    const lines = generateSizeOfField(field, fieldScope, int64As)
                    for (const line of lines) {
                        t.line(line)
                    }
                }

                // Oneof fields
                for (const oneof of message.oneofs) {
                    const lines = generateOneofSizeOfLines(oneof, fieldScope, int64As)
                    for (const line of lines) {
                        t.line(line)
                    }
                }

                t.line('return s;')
            })

            t.blank()

            // Static encodeTo
            t.block(
                `static encodeTo(msg: ${generatedName}, buf: Uint8Array, p: number): number {`,
                () => {
                    // Regular fields
                    for (const field of regularFields) {
                        const lines = generateEncodeToField(field, fieldScope, int64As)
                        for (const line of lines) {
                            t.line(line)
                        }
                    }

                    // Oneof fields
                    for (const oneof of message.oneofs) {
                        const lines = generateOneofEncodeToLines(oneof, fieldScope, int64As)
                        for (const line of lines) {
                            t.line(line)
                        }
                    }

                    t.line('return p;')
                }
            )

            t.blank()

            // toBinary override — fully inlined two-pass for maximum performance
            t.block('toBinary(): Uint8Array {', () => {
                // Single-field fast path: only emit for sparse messages with many fields
                // (>30). For smaller messages, the fast path's switch-on-key-name is
                // ~12 lines per field of dead code that explodes file size, while the
                // regular two-pass below already handles them efficiently.
                const SINGLE_FIELD_FAST_PATH_THRESHOLD = 30
                if (
                    canBypassConstructor &&
                    regularFields.length >= SINGLE_FIELD_FAST_PATH_THRESHOLD
                ) {
                    t.line('let _k1: string | undefined = undefined;')
                    t.line('let _count = 0;')
                    t.block('for (const _k in this as Record<string, unknown>) {', () => {
                        t.line('_count++;')
                        t.block('if (_count === 1) {', () => {
                            t.line('_k1 = _k;')
                        })
                        t.block('else {', () => {
                            t.line('_k1 = undefined;')
                            t.line('break;')
                        })
                    })
                    t.block('if (_count === 0) {', () => {
                        t.line('return allocBuf(0);')
                    })
                    t.block('if (_count === 1 && _k1 !== undefined) {', () => {
                        t.block('switch (_k1) {', () => {
                            for (const field of regularFields) {
                                t.block(`case '${field.name}': {`, () => {
                                    t.line(`const _v = (this as any).${field.name};`)
                                    t.line('let s = 0;')
                                    const sizeLines = generateSizeOfField(
                                        field,
                                        fieldScope,
                                        int64As
                                    )
                                    for (const line of sizeLines) {
                                        t.line(
                                            line.replace(
                                                new RegExp(`msg\\.${field.name}`, 'g'),
                                                '_v'
                                            )
                                        )
                                    }
                                    t.block('if (s === 0) {', () => {
                                        t.line('return allocBuf(0);')
                                    })
                                    t.line('const buf = allocBuf(s);')
                                    t.line('let p = 0;')
                                    const encodeToLines = generateEncodeToField(
                                        field,
                                        fieldScope,
                                        int64As
                                    )
                                    for (const line of encodeToLines) {
                                        t.line(
                                            line.replace(
                                                new RegExp(`msg\\.${field.name}`, 'g'),
                                                '_v'
                                            )
                                        )
                                    }
                                    t.line('return finalizeBuf(buf, s);')
                                })
                            }
                            t.line('default: break;')
                        })
                    })
                }
                // Phase 1: Declare cache variables (initialized to 0).
                // Cache values are populated lazily inside Phase 2 (size phase) only
                // when the field is present, avoiding wasted ternary checks for unset fields.
                const singularStringFields: ProtoField[] = []
                const repeatedStringFieldsInBinary: ProtoField[] = []
                const messageFields: ProtoField[] = []
                for (const field of regularFields) {
                    if (field.type === 'string' && !field.mapKeyType) {
                        if (field.label === 'repeated') repeatedStringFieldsInBinary.push(field)
                        else singularStringFields.push(field)
                    }
                    if (field.isMessage && !field.mapKeyType && field.label !== 'repeated')
                        messageFields.push(field)
                }
                for (const field of repeatedStringFieldsInBinary) {
                    t.line(`const _arr_${field.name} = this.${field.name};`)
                    t.line(`const _len_${field.name} = _arr_${field.name}.length;`)
                    t.block(
                        `if (_sbl_${fieldScope}_${field.name}.length < _len_${field.name}) {`,
                        () => {
                            t.line(
                                `_sbl_${fieldScope}_${field.name} = new Int32Array(_len_${field.name} * 2);`
                            )
                        }
                    )
                    t.line(`const _bl_${field.name} = _sbl_${fieldScope}_${field.name};`)
                }
                for (const field of singularStringFields) {
                    t.line(`let _bl_${field.name} = 0;`)
                }
                for (const field of messageFields) {
                    t.line(`let _ms_${field.name} = 0;`)
                }

                // Phase 2: Compute total size
                t.line('let s = 0;')
                for (const field of regularFields) {
                    const tagSize = computeTagSize(field)
                    const accessor = `this.${field.name}`

                    if (
                        field.label === 'repeated' &&
                        field.type === 'string' &&
                        !field.mapKeyType &&
                        !field.isGroup
                    ) {
                        t.block(`for (let i = 0; i < _len_${field.name}; i++) {`, () => {
                            t.line(`const _v = _arr_${field.name}[i];`)
                            t.line('const _bl = strByteLen(_v);')
                            t.line(`_bl_${field.name}[i] = _bl;`)
                            t.line(`s += ${tagSize} + varint32Size(_bl) + _bl;`)
                        })
                        continue
                    }

                    if (field.mapKeyType || field.label === 'repeated' || field.isGroup) {
                        // Complex fields: delegate to sizeOf
                        const lines = generateSizeOfField(field, fieldScope, int64As)
                        for (const line of lines) t.line(line.replace(/msg\./g, 'this.'))
                        continue
                    }

                    const check = getDefaultCheck(field)
                    if (field.type === 'string') {
                        // Lazy cache: compute strByteLen only if string is non-empty
                        const presenceCheck =
                            field.hasPresence || field.isRequired
                                ? `${accessor} !== undefined && ${accessor} !== ''`
                                : `${accessor} !== ''`
                        t.line(
                            `if (${presenceCheck}) { _bl_${field.name} = strByteLen(${accessor}); s += ${tagSize} + varint32Size(_bl_${field.name}) + _bl_${field.name}; }`
                        )
                    } else if (field.type === 'bytes') {
                        t.line(
                            `if (${check}) s += ${tagSize} + varint32Size(${accessor}.length) + ${accessor}.length;`
                        )
                    } else if (field.isMessage) {
                        // Lazy cache: compute nested sizeOf only if field is set
                        const typeRef = fieldTypeExprForField(field)
                        t.line(
                            `if (${accessor} !== undefined) { _ms_${field.name} = ${typeRef}.sizeOf(${accessor}); s += ${tagSize} + varint32Size(_ms_${field.name}) + _ms_${field.name}; }`
                        )
                    } else if (field.type === 'bool') {
                        t.line(`if (${check}) s += ${tagSize + 1};`)
                    } else if (
                        field.type === 'double' ||
                        field.type === 'fixed64' ||
                        field.type === 'sfixed64'
                    ) {
                        t.line(`if (${check}) s += ${tagSize + 8};`)
                    } else if (
                        field.type === 'float' ||
                        field.type === 'fixed32' ||
                        field.type === 'sfixed32'
                    ) {
                        t.line(`if (${check}) s += ${tagSize + 4};`)
                    } else if (field.type === 'int32') {
                        t.line(`if (${check}) s += ${tagSize} + int32Size(${accessor});`)
                    } else if (field.isEnum) {
                        t.line(`if (${check}) s += ${tagSize} + varint32Size(${accessor});`)
                    } else if (
                        field.type === 'int64' ||
                        field.type === 'uint64' ||
                        field.type === 'sint64'
                    ) {
                        // 64-bit varint types: delegate to sizeOf (handles bigint→lo/hi)
                        const lines = generateSizeOfField(field, fieldScope, int64As)
                        for (const line of lines) t.line(line.replace(/msg\./g, 'this.'))
                    } else if (field.type === 'sint32') {
                        // sint32: must zigzag encode before sizing
                        t.line(
                            `if (${check}) s += ${tagSize} + varint32Size(((${accessor} << 1) ^ (${accessor} >> 31)) >>> 0);`
                        )
                    } else {
                        // Other varint types (uint32)
                        t.line(`if (${check}) s += ${tagSize} + varint32Size(${accessor});`)
                    }
                }
                for (const oneof of message.oneofs) {
                    const lines = generateOneofSizeOfLines(oneof, fieldScope, int64As)
                    for (const line of lines) t.line(line.replace(/msg\./g, 'this.'))
                }

                // Phase 3: Allocate + write inline
                t.line('const buf = allocBuf(s);')
                t.line('let p = 0;')
                for (const field of regularFields) {
                    if (
                        field.label === 'repeated' &&
                        field.type === 'string' &&
                        !field.mapKeyType &&
                        !field.isGroup
                    ) {
                        const tagBytes = getTagBytesArray(field)
                        t.block(`for (let i = 0; i < _len_${field.name}; i++) {`, () => {
                            t.line(`const _v = _arr_${field.name}[i];`)
                            t.line(`const _bl = _bl_${field.name}[i];`)
                            t.line(
                                `${tagBytes} p = writeVarint(_bl, buf, p); strWrite(_v, buf, p, _bl); p += _bl;`
                            )
                        })
                        continue
                    }

                    if (field.mapKeyType || field.label === 'repeated' || field.isGroup) {
                        const lines = generateEncodeToField(field, fieldScope, int64As)
                        for (const line of lines) t.line(line.replace(/msg\./g, 'this.'))
                        continue
                    }

                    const tagBytes = getTagBytesArray(field)
                    const check = getDefaultCheck(field)
                    const accessor = `this.${field.name}`

                    if (field.type === 'string') {
                        t.line(
                            `if (_bl_${field.name} > 0) { ${tagBytes} p = writeVarint(_bl_${field.name}, buf, p); strWrite(${accessor}, buf, p, _bl_${field.name}); p += _bl_${field.name}; }`
                        )
                    } else if (field.type === 'bytes') {
                        t.line(
                            `if (${check}) { ${tagBytes} p = writeVarint(${accessor}.length, buf, p); p = writeBytes(${accessor}, buf, p); }`
                        )
                    } else if (field.isMessage) {
                        const typeRef = fieldTypeExprForField(field)
                        t.line(
                            `if (${accessor} !== undefined) { ${tagBytes} p = writeVarint(_ms_${field.name}, buf, p); p = ${typeRef}.encodeTo(${accessor}, buf, p); }`
                        )
                    } else {
                        const lines = generateEncodeToField(field, fieldScope, int64As)
                        for (const line of lines) t.line(line.replace(/msg\./g, 'this.'))
                    }
                }
                for (const oneof of message.oneofs) {
                    const lines = generateOneofEncodeToLines(oneof, fieldScope, int64As)
                    for (const line of lines) t.line(line.replace(/msg\./g, 'this.'))
                }
                t.line('return finalizeBuf(buf, s);')
            })

            t.blank()

            const requiredFields = regularFields.filter((field) => field.isRequired)

            // Static decode — accepts Uint8Array input.
            // Decoding from reader is handled by decodeFrom; public decode stays Uint8Array-only.
            t.block(`static decode(input: Uint8Array, length?: number): ${generatedName} {`, () => {
                t.line('const end = length ?? input.length;')
                if (requiredFields.length === 0) {
                    if (canBypassConstructor) {
                        t.line(
                            `if (end === 0) return Object.create(${generatedName}.prototype) as ${generatedName};`
                        )
                    } else {
                        t.line(`if (end === 0) return new ${generatedName}();`)
                    }
                }
                t.line('const r = new BinaryReader(input, end);')
                t.line(`return ${generatedName}.decodeFrom(r, r.end);`)
            })

            t.blank()

            // Internal reader fast-path used by nested decode.
            t.block(`static decodeFrom(r: BinaryReader, end: number): ${generatedName} {`, () => {
                if (canBypassConstructor) {
                    t.line(
                        `const msg = Object.create(${generatedName}.prototype) as ${generatedName};`
                    )
                } else {
                    t.line(`const msg = new ${generatedName}();`)
                }
                for (const field of requiredFields) {
                    t.line(`let _seen_${field.name} = false;`)
                }
                t.block('while (r.pos < end) {', () => {
                    t.line('const tag = r.uint32();')
                    if (firstDecodeStringField) {
                        const hotTag =
                            (firstDecodeStringField.number << 3) |
                            getWireType(firstDecodeStringField)
                        const seenPrefix = firstDecodeStringField.isRequired
                            ? `_seen_${firstDecodeStringField.name} = true; `
                            : ''
                        t.line(
                            `if (tag === ${hotTag}) { ${seenPrefix}msg.${firstDecodeStringField.name} = r.string(); continue; }`
                        )
                    }
                    t.block('switch (tag >>> 3) {', () => {
                        // Regular fields
                        for (const field of regularFields) {
                            const lines = generateDecodeField(field, int64As)
                            for (const line of lines) {
                                if (field.isRequired && line.startsWith(`case ${field.number}:`)) {
                                    t.line(
                                        line.replace(
                                            `case ${field.number}:`,
                                            `case ${field.number}: _seen_${field.name} = true;`
                                        )
                                    )
                                } else {
                                    t.line(line)
                                }
                            }
                        }

                        // Oneof fields
                        for (const oneof of message.oneofs) {
                            const lines = generateOneofDecodeLines(oneof, message.name, int64As)
                            for (const line of lines) {
                                t.line(line)
                            }
                        }

                        t.line('default: r.skipTag(tag);')
                    })
                })
                for (const field of requiredFields) {
                    t.line(
                        `if (!_seen_${field.name}) { throw new Error('Missing required field: ${field.name}'); }`
                    )
                }
                t.line('return msg;')
            })

            t.blank()

            if (!noJson) {
                // Static toJSON — uses jsonName for keys
                t.block(`static toJSON(msg: ${generatedName}): ${jsonName} {`, () => {
                    t.line(`const json = {} as ${jsonName};`)
                    for (const field of regularFields) {
                        const jsonKey = field.jsonName ?? toCamelCase(field.name)
                        const accessor = `msg.${field.name}`
                        if (
                            (field.hasPresence || field.isRequired) &&
                            field.label !== 'repeated' &&
                            !field.mapKeyType
                        ) {
                            t.line(
                                `if (${accessor} !== undefined) json['${jsonKey}'] = ${accessor};`
                            )
                        } else if (
                            field.isMessage &&
                            field.label !== 'repeated' &&
                            !field.mapKeyType
                        ) {
                            t.line(
                                `if (${accessor} !== undefined) json['${jsonKey}'] = ${accessor};`
                            )
                        } else {
                            t.line(`json['${jsonKey}'] = ${accessor};`)
                        }
                    }
                    for (const oneof of message.oneofs) {
                        const jsonKey = oneof.name
                        t.line(`json['${jsonKey}'] = msg.${oneof.name};`)
                    }
                    t.line('return json;')
                })

                t.blank()

                // Static fromJSON — accepts both proto name and jsonName
                t.block(`static fromJSON(json: ${jsonName}): ${generatedName} {`, () => {
                    t.line(`const msg = new ${generatedName}();`)
                    for (const field of regularFields) {
                        const jsonKey = field.jsonName ?? toCamelCase(field.name)
                        const protoName = field.name
                        if (jsonKey !== protoName) {
                            t.line(
                                `if (json['${jsonKey}'] !== undefined) msg.${protoName} = json['${jsonKey}'] as any;`
                            )
                            t.line(
                                `else if (json['${protoName}'] !== undefined) msg.${protoName} = json['${protoName}'] as any;`
                            )
                        } else {
                            t.line(
                                `if (json['${protoName}'] !== undefined) msg.${protoName} = json['${protoName}'] as any;`
                            )
                        }
                    }
                    for (const oneof of message.oneofs) {
                        const oneofName = oneof.name
                        t.line(
                            `if (json['${oneofName}'] !== undefined) msg.${oneofName} = json['${oneofName}'] as any;`
                        )
                    }
                    t.line('return msg;')
                })
            }
        }
    )

    // Emit namespace merge for nested messages/enums so they can be accessed via
    // dot notation (e.g. `User.Profile` instead of `User_Profile`). Class declarations
    // keep their flat names for TypeScript class-naming constraints; this block
    // exposes aliases that merge with the parent class at both the type and value level.
    const hasNested = message.nestedMessages.length > 0 || message.nestedEnums.length > 0
    if (hasNested) {
        t.blank()
        t.raw(generateNestedNamespaceMerge(message, generatedName, noJson))
    }

    return t.toString()
}

function generateNestedNamespaceMerge(
    message: ProtoMessage,
    parentGeneratedName: string,
    noJson: boolean
): string {
    // Emits `export namespace <Parent> { ... }` which merges with the parent class
    // declaration (class+namespace merge) to add nested types as static-like members.
    // Each nested type gets both `const` and `type` aliases so `new Parent.Child()`
    // works and `const x: Parent.Child = ...` type-checks.
    //
    // Note: we only expose DIRECT children here. For deeper chains (e.g.
    // Parent.Child.GrandChild), each nested message emits its own namespace merge
    // block at the top level, which merges with its flat class declaration
    // (e.g. `namespace Parent_Child { export const GrandChild = ... }`).
    // Users access deeper types via `Parent.Child.GrandChild` at runtime because
    // `Parent.Child === Parent_Child` (same constructor reference).
    const t = new CodeTemplate()
    t.block(`export namespace ${parentGeneratedName} {`, () => {
        for (const nestedEnum of message.nestedEnums) {
            const nestedName = nestedEnum.name
            const nestedGen = nestedEnum.generatedName ?? nestedName
            t.line(`export const ${nestedName} = ${nestedGen};`)
            t.line(`export type ${nestedName} = ${nestedGen};`)
        }
        for (const nested of message.nestedMessages) {
            const nestedName = nested.name
            const nestedGen = nested.generatedName ?? nestedName
            t.line(`export const ${nestedName} = ${nestedGen};`)
            t.line(`export type ${nestedName} = ${nestedGen};`)
            // POJO interface alias: `Parent.IChild` resolves to `IParent_Child`
            t.line(`export type I${nestedName} = I${nestedGen};`)
            if (!noJson) {
                t.line(`export type ${nestedName}JSON = ${nestedGen}JSON;`)
            }
        }
    })
    return t.toString()
}

function toCamelCase(name: string): string {
    return name.replace(/_([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
}

function computeTagSize(field: ProtoField): number {
    const wireType = field.label === 'repeated' && field.packed ? 2 : getWireType(field)
    return computeTagBytes(field.number, wireType).length
}

function getDefaultCheck(field: ProtoField): string {
    const a = `this.${field.name}`
    if (field.hasPresence || field.isRequired) return `${a} !== undefined`
    if (field.isMessage) return `${a} !== undefined`
    if (field.isEnum) return `${a} !== 0`
    switch (field.type) {
        case 'bool':
            return `${a} !== false`
        case 'string':
            return `${a} !== ''`
        case 'bytes':
            return `${a}.length > 0`
        case 'int64':
        case 'uint64':
        case 'sint64':
        case 'fixed64':
        case 'sfixed64':
            return `${a} !== 0n`
        default:
            return `${a} !== 0`
    }
}

function getTagBytesArray(field: ProtoField): string {
    const wireType = field.label === 'repeated' && field.packed ? 2 : getWireType(field)
    const bytes = computeTagBytes(field.number, wireType)
    return bytes.map((b) => `buf[p++] = 0x${b.toString(16).padStart(2, '0')};`).join(' ')
}

function fieldTypeExprForField(field: ProtoField): string {
    return field.typeExpr ?? field.type
}

/**
 * Prefix the last segment of a type expression with `I` so it references the
 * POJO interface peer instead of the class.
 *   `User`              -> `IUser`
 *   `User_Profile`      -> `IUser_Profile`
 *   `imp1.User`         -> `imp1.IUser`
 *   `imp1.User_Profile` -> `imp1.IUser_Profile`
 */
function prefixIToTypeExpr(typeExpr: string): string {
    const lastDot = typeExpr.lastIndexOf('.')
    if (lastDot === -1) return `I${typeExpr}`
    return `${typeExpr.slice(0, lastDot + 1)}I${typeExpr.slice(lastDot + 1)}`
}

/**
 * Get the TypeScript type for a field as it appears in the POJO `I*` interface.
 * Differences from {@link getTypeScriptType}:
 *  - Message fields reference the I-prefixed peer (e.g. `IUser_Profile`)
 *  - Map values that are messages also use the I-prefixed peer
 *  - Repeated fields keep their `T[]` shape (just optional + nullable on the field)
 */
function getInterfaceFieldType(field: ProtoField, int64As: Int64Mode): string {
    if (field.mapKeyType && field.mapValueType) {
        const keyTs = scalarToTsType(field.mapKeyType, int64As)
        const valTs = isScalarType(field.mapValueType)
            ? scalarToTsType(field.mapValueType, int64As)
            : prefixIToTypeExpr(mapValueTypeExpr(field))
        return `Map<${keyTs}, ${valTs}>`
    }

    let baseType: string
    if (field.isMessage) {
        baseType = prefixIToTypeExpr(fieldTypeExprForField(field))
    } else if (field.isEnum) {
        baseType = fieldTypeExprForField(field)
    } else {
        baseType = scalarToTsType(field.type, int64As)
    }

    if (field.label === 'repeated') return `${baseType}[]`
    return baseType
}

/** Get the TypeScript type for a field in the JSON interface. */
function getJsonFieldType(field: ProtoField): string {
    if (field.mapKeyType && field.mapValueType) {
        const keyJson = scalarJsonType(field.mapKeyType)
        const valJson = field.mapValueIsMessage
            ? `${fieldTypeExprForField({ ...field, type: field.mapValueType, typeExpr: field.mapValueTypeExpr } as ProtoField)}JSON`
            : scalarJsonType(field.mapValueType)
        return `Record<${keyJson}, ${valJson}>`
    }

    let base: string
    if (field.isMessage) {
        base = `${fieldTypeExprForField(field)}JSON`
    } else if (field.isEnum) {
        base = 'number'
    } else {
        base = scalarJsonType(field.type)
    }

    if (field.label === 'repeated') return `${base}[]`
    return base
}

function scalarJsonType(protoType: string): string {
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
            return 'string' // bigint serialized as string in JSON
        case 'bool':
            return 'boolean'
        case 'string':
            return 'string'
        case 'bytes':
            return 'string' // base64 in JSON
        default:
            return 'unknown'
    }
}
