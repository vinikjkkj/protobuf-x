// Minimal runtime entry point: encode/decode only.
//
// Use this instead of `@protobuf-x/runtime` when you only need binary
// serialization (no JSON, clone, equals, merge, streaming, services).
//
// Typical bundle size: ~12-15 KB minified (vs ~30 KB for the full runtime).

// Binary encode/decode (required for generated code)
export { BinaryReader } from './binary/reader.js'
export { BinaryWriter } from './binary/writer.js'
export { WireType, makeTag, tagFieldNumber, tagWireType } from './binary/wire-type.js'
export {
    varint32Size,
    varint64Size,
    strByteLen,
    strWrite,
    writeVarint,
    allocBuf,
    writeDouble,
    writeFloat,
    writeFixed32,
    writeFixed64,
    writeBool,
    writeInt32,
    int32Size,
    writeVarint64,
    writeSint32,
    writeBytes,
    zigzagEncode32,
    finalizeBuf
} from './binary/encode-helpers.js'

// Minimal message base (encode/decode only)
export { Message } from './message/base-minimal.js'

// Field metadata types (used by generated field descriptors — tiny)
export { ScalarType } from './types/scalars.js'
export { FieldRule } from './types/field.js'
export type { FieldDescriptor } from './types/field.js'
export type {
    MessageDescriptor,
    EnumDescriptor,
    FieldNumberRangeDescriptor,
    ExtensionDescriptor
} from './types/descriptors.js'
