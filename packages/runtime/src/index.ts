// Binary encode/decode
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

// Message base
export { Message } from './message/base.js'
export type { MessageType } from './message/base.js'
export { TypeRegistry, globalRegistry } from './message/registry.js'

// Type system
export { ScalarType, scalarDefaultValue, isScalarDefault } from './types/scalars.js'
export { FieldRule } from './types/field.js'
export type { FieldDescriptor } from './types/field.js'
export type {
    MessageDescriptor,
    EnumDescriptor,
    FieldNumberRangeDescriptor,
    ExtensionDescriptor,
    ServiceDescriptor,
    MethodDescriptor
} from './types/descriptors.js'
export type { ExtensionFieldInfo } from './types/extension.js'

// Pools
export { BufferPool, globalBufferPool } from './pool/buffer-pool.js'
export { ObjectPool } from './pool/object-pool.js'

// Encoding utilities
export { encodeUtf8, decodeUtf8, utf8ByteLength } from './encoding/utf8.js'
export { encodeBase64, decodeBase64 } from './encoding/base64.js'

// Streaming
export { frame, Deframer } from './streaming/framer.js'
export { decodeStream } from './streaming/decode-stream.js'
export { encodeStream, encodeDelimited } from './streaming/encode-stream.js'

// Utilities
export { equals, shallowEquals } from './util/equals.js'
export { sizeOf } from './util/sizeof.js'
export { validate } from './util/validate.js'
export type { ValidationError, FieldSchema } from './util/validate.js'
export { clone } from './util/clone.js'
export { merge } from './util/merge.js'
export { diff } from './util/diff.js'
export type { FieldDiff } from './util/diff.js'
export { patch } from './util/patch.js'
export { freeze } from './util/freeze.js'
export { toJSON, fromJSON } from './util/json.js'
export { wellKnownToJSON, wellKnownFromJSON, isWellKnownType } from './util/well-known-json.js'

// Service
export type { Transport } from './service/transport.js'
export { ServiceClient } from './service/client.js'
