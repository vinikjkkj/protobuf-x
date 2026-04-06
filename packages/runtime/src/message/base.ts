import { BinaryWriter } from '../binary/writer.js'
import type { MessageDescriptor } from '../types/descriptors.js'
import type { ExtensionFieldInfo } from '../types/extension.js'

/**
 * Interface that all generated message classes must implement.
 * This enables the utility functions to work generically.
 */
export interface MessageType<T> {
    new (init?: Partial<T>): T
    readonly descriptor: MessageDescriptor
    encode(msg: T, writer?: BinaryWriter): BinaryWriter
    decode(buf: Uint8Array, length?: number): T
}

/**
 * Abstract base class for all protobuf messages.
 *
 * Generated code extends this class and provides static encode/decode methods.
 * Instance methods delegate to the static methods on the constructor.
 *
 * Usage:
 *   const user = new User({ name: 'Vinicius', age: 25 });
 *   const bytes = user.encode().finish();
 *   const decoded = User.decode(bytes);
 *   decoded.equals(user);       // true
 *   decoded.clone();             // new User with same values
 *   decoded.toJSON();            // canonical proto3 JSON
 */
export abstract class Message<T extends Message<T>> {
    /** Lazy-initialized storage for extension field values, keyed by field number. */
    declare private _extensions?: Map<number, unknown>

    /** Get an extension field value. Returns the value if set, or the default value. */
    getExtension<V>(ext: ExtensionFieldInfo<V>): V | undefined {
        if (this._extensions === undefined) return undefined
        const val = this._extensions.get(ext.fieldNumber)
        return val !== undefined ? (val as V) : undefined
    }

    /** Set an extension field value. */
    setExtension<V>(ext: ExtensionFieldInfo<V>, value: V): void {
        if (this._extensions === undefined) {
            this._extensions = new Map()
        }
        this._extensions.set(ext.fieldNumber, value)
    }

    /** Check if an extension field is set on this message. */
    hasExtension<V>(ext: ExtensionFieldInfo<V>): boolean {
        if (this._extensions === undefined) return false
        return this._extensions.has(ext.fieldNumber)
    }

    /** Clear an extension field from this message. */
    clearExtension<V>(ext: ExtensionFieldInfo<V>): void {
        if (this._extensions === undefined) return
        this._extensions.delete(ext.fieldNumber)
    }

    /**
     * Get the internal extensions map (used by encode). Returns undefined if no extensions are set.
     * @internal
     */
    _getExtensionsMap(): ReadonlyMap<number, unknown> | undefined {
        return this._extensions
    }

    /** Encode this message to binary. Returns a BinaryWriter (call .finish() for Uint8Array). */
    encode(writer?: BinaryWriter): BinaryWriter {
        // Fast path for generated/optimized messages that override toBinary().
        // This makes encode().finish() use the same high-performance path.
        if (writer === undefined && this.toBinary !== Message.prototype.toBinary) {
            return BinaryWriter.fromBytes(this.toBinary())
        }
        const ctor = this.constructor as unknown as MessageType<T>
        return ctor.encode(this as unknown as T, writer)
    }

    /** Encode this message and return the final Uint8Array. */
    toBinary(): Uint8Array {
        return this.encode().finish()
    }

    /** Create a deep clone of this message via encode/decode. */
    clone(): T {
        const ctor = this.constructor as unknown as MessageType<T>
        const bytes = this.toBinary()
        return ctor.decode(bytes)
    }

    /**
     * Check equality with another message of the same type.
     * Uses binary comparison for speed.
     */
    equals(other: T): boolean {
        const a = this.toBinary()
        const b = other.toBinary()
        if (a.length !== b.length) return false
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false
        }
        return true
    }

    /**
     * Merge another message's fields into this one.
     * For scalar fields, the other's value wins.
     * For repeated fields, values are concatenated.
     * For message fields, values are recursively merged.
     */
    merge(other: Partial<T>): this {
        for (const key of Object.keys(other) as (keyof T)[]) {
            const val = other[key]
            if (val === undefined) continue
            const current = (this as unknown as T)[key]

            if (Array.isArray(val) && Array.isArray(current)) {
                // Repeated: concatenate
                ;(current as unknown[]).push(...(val as unknown[]))
            } else if (val !== null && typeof val === 'object' && val instanceof Message) {
                // Nested message: recursive merge
                if (current instanceof Message) {
                    current.merge(val as Partial<typeof current>)
                } else {
                    ;(this as unknown as Record<keyof T, unknown>)[key] = val
                }
            } else {
                // Scalar or enum: overwrite
                ;(this as unknown as Record<keyof T, unknown>)[key] = val
            }
        }
        return this
    }

    /**
     * Convert this message to a plain JSON-compatible object.
     * For simple messages (no bytes/bigint/nested), this is essentially free.
     * Follows proto3 canonical JSON mapping.
     */
    toJSON(): Record<string, unknown> {
        // Fast path: check if any value needs transformation
        const self = this as Record<string, unknown>
        const keys = Object.keys(self)
        for (let i = 0; i < keys.length; i++) {
            const val = self[keys[i]!]
            if (
                val instanceof Uint8Array ||
                val instanceof Message ||
                typeof val === 'bigint' ||
                (typeof val === 'object' && val !== null && !Array.isArray(val)) ||
                (Array.isArray(val) &&
                    val.length > 0 &&
                    typeof val[0] === 'object' &&
                    val[0] !== null)
            ) {
                // Slow path: transform values
                const result: Record<string, unknown> = {}
                for (let j = 0; j < keys.length; j++) {
                    result[keys[j]!] = messageValueToJSON(self[keys[j]!])
                }
                return result
            }
        }
        // No transformation needed — shallow copy
        return Object.assign({}, self)
    }

    /** Apply a partial update (patch) to this message. */
    patch(partial: Partial<T>): this {
        return Object.assign(this, partial)
    }

    /** Deep freeze this message (makes it immutable). */
    freeze(): Readonly<T> {
        deepFreeze(this)
        return this as unknown as Readonly<T>
    }
}

function deepFreeze(obj: unknown): void {
    if (obj === null || typeof obj !== 'object') return
    Object.freeze(obj)
    for (const val of Object.values(obj as Record<string, unknown>)) {
        if (typeof val === 'object' && val !== null && !Object.isFrozen(val)) {
            deepFreeze(val)
        }
    }
}

function uint8ArrayToBase64(buf: Uint8Array): string {
    let result = ''
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const len = buf.length
    const rem = len % 3
    const end = len - rem

    for (let i = 0; i < end; i += 3) {
        const b0 = buf[i]!
        const b1 = buf[i + 1]!
        const b2 = buf[i + 2]!
        result += chars[b0 >> 2]
        result += chars[((b0 & 3) << 4) | (b1 >> 4)]
        result += chars[((b1 & 15) << 2) | (b2 >> 6)]
        result += chars[b2 & 63]
    }

    if (rem === 1) {
        const b0 = buf[end]!
        result += chars[b0 >> 2]
        result += chars[(b0 & 3) << 4]
        result += '=='
    } else if (rem === 2) {
        const b0 = buf[end]!
        const b1 = buf[end + 1]!
        result += chars[b0 >> 2]
        result += chars[((b0 & 3) << 4) | (b1 >> 4)]
        result += chars[(b1 & 15) << 2]
        result += '='
    }

    return result
}

function messageValueToJSON(val: unknown): unknown {
    if (val instanceof Uint8Array) {
        return uint8ArrayToBase64(val)
    }
    if (typeof val === 'bigint') {
        return val.toString()
    }
    if (val instanceof Message) {
        return val.toJSON()
    }
    if (Array.isArray(val)) {
        return val.map(messageValueToJSON)
    }
    if (val !== null && typeof val === 'object') {
        const result: Record<string, unknown> = {}
        for (const [key, nested] of Object.entries(val as Record<string, unknown>)) {
            result[key] = messageValueToJSON(nested)
        }
        return result
    }
    return val
}
