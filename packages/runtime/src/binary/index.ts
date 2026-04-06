export { BinaryReader } from './reader.js'
export { BinaryWriter } from './writer.js'
export {
    encodeVarint32,
    decodeVarint32,
    encodeVarint64,
    decodeVarint64,
    varint32Size,
    varint64Size
} from './varint.js'
export { zigzagEncode32, zigzagDecode32, zigzagEncode64, zigzagDecode64 } from './zigzag.js'
export { WireType, makeTag, tagFieldNumber, tagWireType } from './wire-type.js'
