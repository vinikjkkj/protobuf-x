import { BinaryWriter } from '../binary/writer.js'

/**
 * Minimal message base class — encode/decode only.
 *
 * Does NOT include: clone, equals, merge, toJSON, fromJSON, freeze, patch, extensions.
 * Use `@protobuf-x/runtime` for the full API.
 *
 * Generated code extending this class must override `toBinary()` for best performance.
 */
export abstract class Message<T extends Message<T>> {
    /** Encode this message to binary. Returns a BinaryWriter (call .finish() for Uint8Array). */
    encode(writer?: BinaryWriter): BinaryWriter {
        // Fast path for generated messages that override toBinary()
        if (writer === undefined && this.toBinary !== Message.prototype.toBinary) {
            return BinaryWriter.fromBytes(this.toBinary())
        }
        const ctor = this.constructor as unknown as {
            encode(msg: T, writer?: BinaryWriter): BinaryWriter
        }
        return ctor.encode(this as unknown as T, writer)
    }

    /** Encode this message and return the final Uint8Array. */
    toBinary(): Uint8Array {
        return this.encode().finish()
    }
}
