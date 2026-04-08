import { WireType } from './wire-type.js'
import { zigzagDecode32, zigzagDecode64 } from './zigzag.js'

// Shared scratch arrays for float/double reading
const f32Scratch = new Float32Array(1)
const u8f32 = new Uint8Array(f32Scratch.buffer)
const f64Scratch = new Float64Array(1)
const u8f64 = new Uint8Array(f64Scratch.buffer)

// String decoding: utf8Slice (Buffer fast path) or TextDecoder (fallback)
const td = new TextDecoder()
const B = typeof globalThis.Buffer === 'function' ? globalThis.Buffer : null

type BufLike = Uint8Array & { utf8Slice?(start: number, end: number): string }

/**
 * High-performance zero-copy binary reader.
 * Varint decoding is fully inlined — no function calls or tuple allocations.
 * If Node.js Buffer is available, converts input to Buffer once at construction
 * for fastest possible string decoding via utf8Slice.
 */
export class BinaryReader {
    private buf: BufLike
    private fast: boolean // true if buf has utf8Slice (Buffer)
    private u64lo = 0
    private u64hi = 0
    /** Current read position. */
    pos: number
    /** End position (exclusive). */
    readonly end: number

    constructor(buf: Uint8Array, length?: number) {
        const end = length ?? buf.length
        this.buf = buf as BufLike
        this.fast = typeof (buf as BufLike).utf8Slice === 'function'
        this.pos = 0
        this.end = end
    }

    static create(buf: Uint8Array, length?: number): BinaryReader {
        return new BinaryReader(buf, length)
    }

    private skipVarint(): void {
        const b = this.buf
        let p = this.pos
        if (b[p++]! < 0x80) {
            this.pos = p
            return
        }
        if (b[p++]! < 0x80) {
            this.pos = p
            return
        }
        if (b[p++]! < 0x80) {
            this.pos = p
            return
        }
        if (b[p++]! < 0x80) {
            this.pos = p
            return
        }
        if (b[p++]! < 0x80) {
            this.pos = p
            return
        }
        if (b[p++]! < 0x80) {
            this.pos = p
            return
        }
        if (b[p++]! < 0x80) {
            this.pos = p
            return
        }
        if (b[p++]! < 0x80) {
            this.pos = p
            return
        }
        if (b[p++]! < 0x80) {
            this.pos = p
            return
        }
        if (b[p++]! < 0x80) {
            this.pos = p
            return
        }
        throw new RangeError('Varint too long')
    }

    private readU64Parts(): void {
        const b = this.buf
        let p = this.pos
        let byte = b[p++]!
        let lo = byte & 0x7f
        if (byte < 0x80) {
            this.pos = p
            this.u64lo = lo >>> 0
            this.u64hi = 0
            return
        }

        byte = b[p++]!
        lo |= (byte & 0x7f) << 7
        if (byte < 0x80) {
            this.pos = p
            this.u64lo = lo >>> 0
            this.u64hi = 0
            return
        }

        byte = b[p++]!
        lo |= (byte & 0x7f) << 14
        if (byte < 0x80) {
            this.pos = p
            this.u64lo = lo >>> 0
            this.u64hi = 0
            return
        }

        byte = b[p++]!
        lo |= (byte & 0x7f) << 21
        if (byte < 0x80) {
            this.pos = p
            this.u64lo = lo >>> 0
            this.u64hi = 0
            return
        }

        byte = b[p++]!
        lo |= (byte & 0x0f) << 28
        let hi = (byte & 0x70) >>> 4
        if (byte < 0x80) {
            this.pos = p
            this.u64lo = lo >>> 0
            this.u64hi = hi >>> 0
            return
        }

        byte = b[p++]!
        hi |= (byte & 0x7f) << 3
        if (byte < 0x80) {
            this.pos = p
            this.u64lo = lo >>> 0
            this.u64hi = hi >>> 0
            return
        }

        byte = b[p++]!
        hi |= (byte & 0x7f) << 10
        if (byte < 0x80) {
            this.pos = p
            this.u64lo = lo >>> 0
            this.u64hi = hi >>> 0
            return
        }

        byte = b[p++]!
        hi |= (byte & 0x7f) << 17
        if (byte < 0x80) {
            this.pos = p
            this.u64lo = lo >>> 0
            this.u64hi = hi >>> 0
            return
        }

        byte = b[p++]!
        hi |= (byte & 0x7f) << 24
        if (byte < 0x80) {
            this.pos = p
            this.u64lo = lo >>> 0
            this.u64hi = hi >>> 0
            return
        }

        // 10th byte contributes the top bit (bit 63) and must terminate.
        byte = b[p++]!
        hi |= (byte & 0x01) << 31
        if (byte < 0x80 && byte <= 1) {
            this.pos = p
            this.u64lo = lo >>> 0
            this.u64hi = hi >>> 0
            return
        }
        throw new RangeError('Varint too long')
    }

    /** Read a uint32 varint — fully inlined, zero allocation. */
    uint32(): number {
        const b = this.buf
        let p = this.pos
        let v = b[p++]!
        if (v < 0x80) {
            this.pos = p
            return v
        }
        let r = v & 0x7f
        v = b[p++]!
        r |= (v & 0x7f) << 7
        if (v < 0x80) {
            this.pos = p
            return r
        }
        v = b[p++]!
        r |= (v & 0x7f) << 14
        if (v < 0x80) {
            this.pos = p
            return r
        }
        v = b[p++]!
        r |= (v & 0x7f) << 21
        if (v < 0x80) {
            this.pos = p
            return r
        }
        v = b[p++]!
        r |= (v & 0x0f) << 28
        if (v < 0x80) {
            this.pos = p
            return r >>> 0
        }
        // Consume remaining bytes of a 64-bit varint
        for (let i = 0; i < 5; i++) {
            if (b[p++]! < 0x80) {
                this.pos = p
                return r >>> 0
            }
        }
        throw new RangeError('Varint too long')
    }

    /** Read an int32 varint. */
    int32(): number {
        const b = this.buf
        let p = this.pos
        let v = b[p++]!
        if (v < 0x80) {
            this.pos = p
            return v | 0
        }
        let r = v & 0x7f
        v = b[p++]!
        r |= (v & 0x7f) << 7
        if (v < 0x80) {
            this.pos = p
            return r | 0
        }
        v = b[p++]!
        r |= (v & 0x7f) << 14
        if (v < 0x80) {
            this.pos = p
            return r | 0
        }
        v = b[p++]!
        r |= (v & 0x7f) << 21
        if (v < 0x80) {
            this.pos = p
            return r | 0
        }
        v = b[p++]!
        r |= (v & 0x0f) << 28
        if (v < 0x80) {
            this.pos = p
            return r | 0
        }
        for (let i = 0; i < 5; i++) {
            if (b[p++]! < 0x80) {
                this.pos = p
                return r | 0
            }
        }
        throw new RangeError('Varint too long')
    }

    /** Read a sint32 (zigzag decoded). */
    sint32(): number {
        return zigzagDecode32(this.uint32())
    }

    /** Read a uint64 varint. Returns [lo, hi]. */
    uint64(): [number, number] {
        this.readU64Parts()
        return [this.u64lo, this.u64hi]
    }

    /** Read a uint64 varint and return as bigint (unsigned). */
    uint64BigInt(): bigint {
        this.readU64Parts()
        return (BigInt(this.u64hi) << 32n) | BigInt(this.u64lo)
    }

    /** Read an int64 varint and return as bigint (signed two's complement). */
    int64BigInt(): bigint {
        this.readU64Parts()
        const v = (BigInt(this.u64hi) << 32n) | BigInt(this.u64lo)
        return (this.u64hi & 0x80000000) !== 0 ? v - (1n << 64n) : v
    }

    /** Read a sint64 varint and return as bigint (zigzag decoded). */
    sint64BigInt(): bigint {
        this.readU64Parts()
        const raw = (BigInt(this.u64hi) << 32n) | BigInt(this.u64lo)
        return (raw >> 1n) ^ -(raw & 1n)
    }

    /** Read a sint64. Returns [lo, hi]. */
    sint64(): [number, number] {
        this.readU64Parts()
        return zigzagDecode64(this.u64lo, this.u64hi)
    }

    /** Read a boolean. */
    bool(): boolean {
        return this.uint32() !== 0
    }

    /** Read a fixed32 (4 bytes little-endian). */
    fixed32(): number {
        const b = this.buf
        const p = this.pos
        if (p + 4 > this.end) throw new RangeError('Truncated fixed32: not enough bytes')
        this.pos = p + 4
        return (b[p]! | (b[p + 1]! << 8) | (b[p + 2]! << 16) | (b[p + 3]! << 24)) >>> 0
    }

    /** Read a sfixed32 (4 bytes little-endian, signed). */
    sfixed32(): number {
        return this.fixed32() | 0
    }

    /** Read a fixed64 (8 bytes little-endian). Returns [lo, hi]. */
    fixed64(): [number, number] {
        const lo = this.fixed32()
        const hi = this.fixed32()
        return [lo, hi]
    }

    /** Read a fixed64 and return as bigint (unsigned). */
    fixed64BigInt(): bigint {
        const lo = this.fixed32()
        const hi = this.fixed32()
        return (BigInt(hi) << 32n) | BigInt(lo)
    }

    /** Read a sfixed64 (8 bytes little-endian). Returns [lo, hi]. */
    sfixed64(): [number, number] {
        return this.fixed64()
    }

    /** Read a sfixed64 and return as bigint (signed two's complement). */
    sfixed64BigInt(): bigint {
        const lo = this.fixed32()
        const hi = this.fixed32()
        const v = (BigInt(hi) << 32n) | BigInt(lo)
        return (hi & 0x80000000) !== 0 ? v - (1n << 64n) : v
    }

    /** Read a float (4 bytes). */
    float(): number {
        const b = this.buf
        const p = this.pos
        if (p + 4 > this.end) throw new RangeError('Truncated float: not enough bytes')
        this.pos = p + 4
        u8f32[0] = b[p]!
        u8f32[1] = b[p + 1]!
        u8f32[2] = b[p + 2]!
        u8f32[3] = b[p + 3]!
        return f32Scratch[0]!
    }

    /** Read a double (8 bytes). */
    double(): number {
        const b = this.buf
        const p = this.pos
        if (p + 8 > this.end) throw new RangeError('Truncated double: not enough bytes')
        this.pos = p + 8
        u8f64[0] = b[p]!
        u8f64[1] = b[p + 1]!
        u8f64[2] = b[p + 2]!
        u8f64[3] = b[p + 3]!
        u8f64[4] = b[p + 4]!
        u8f64[5] = b[p + 5]!
        u8f64[6] = b[p + 6]!
        u8f64[7] = b[p + 7]!
        return f64Scratch[0]!
    }

    /** Read a length-delimited bytes field (zero-copy subarray). */
    bytes(): Uint8Array {
        const b = this.buf
        const end = this.end
        let p = this.pos
        let v = b[p++]!
        if (v < 0x80) {
            const start = p
            this.pos = start + v
            if (this.pos > end) throw new RangeError('Truncated bytes field: length exceeds buffer')
            return b.subarray(start, this.pos)
        }
        let len = v & 0x7f
        v = b[p++]!
        len |= (v & 0x7f) << 7
        if (v < 0x80) {
            const start = p
            this.pos = start + len
            if (this.pos > end) throw new RangeError('Truncated bytes field: length exceeds buffer')
            return b.subarray(start, this.pos)
        }
        v = b[p++]!
        len |= (v & 0x7f) << 14
        if (v < 0x80) {
            const start = p
            this.pos = start + len
            if (this.pos > end) throw new RangeError('Truncated bytes field: length exceeds buffer')
            return b.subarray(start, this.pos)
        }
        v = b[p++]!
        len |= (v & 0x7f) << 21
        if (v < 0x80) {
            const start = p
            this.pos = start + len
            if (this.pos > end) throw new RangeError('Truncated bytes field: length exceeds buffer')
            return b.subarray(start, this.pos)
        }
        v = b[p++]!
        len |= (v & 0x0f) << 28
        if (v < 0x80) {
            const start = p
            this.pos = start + (len >>> 0)
            if (this.pos > end) throw new RangeError('Truncated bytes field: length exceeds buffer')
            return b.subarray(start, this.pos)
        }
        for (let i = 0; i < 5; i++) {
            if (b[p++]! < 0x80) {
                const start = p
                this.pos = start + (len >>> 0)
                if (this.pos > end) {
                    throw new RangeError('Truncated bytes field: length exceeds buffer')
                }
                return b.subarray(start, this.pos)
            }
        }
        throw new RangeError('Varint too long')
    }

    /** Read a length-delimited string field. Uses native Buffer on Node.js. */
    string(): string {
        const b = this.buf
        let p = this.pos
        let v = b[p++]!
        let len: number
        if (v < 0x80) {
            len = v
        } else {
            len = v & 0x7f
            v = b[p++]!
            len |= (v & 0x7f) << 7
            if (v >= 0x80) {
                v = b[p++]!
                len |= (v & 0x7f) << 14
                if (v >= 0x80) {
                    v = b[p++]!
                    len |= (v & 0x7f) << 21
                    if (v >= 0x80) {
                        v = b[p++]!
                        len |= (v & 0x0f) << 28
                        if (v >= 0x80) {
                            for (let i = 0; i < 5; i++) {
                                if (b[p++]! < 0x80) break
                                if (i === 4) throw new RangeError('Varint too long')
                            }
                        }
                    }
                }
            }
            len >>>= 0
        }
        const start = p
        this.pos = start + len
        if (this.pos > this.end) {
            throw new RangeError('Truncated string field: length exceeds buffer')
        }
        if (len === 0) return ''
        if (this.fast) return this.buf.utf8Slice!(start, this.pos)
        return this.slowString(start)
    }

    /**
     * Cold path for string decoding. Wraps buf as Buffer (once) for utf8Slice,
     * or falls back to TextDecoder on non-Node. Extracted so V8 can inline string().
     */
    private slowString(start: number): string {
        if (B !== null) {
            this.buf = B.from(this.buf.buffer, this.buf.byteOffset, this.end) as unknown as BufLike
            this.fast = true
            return this.buf.utf8Slice!(start, this.pos)
        }
        return td.decode(this.buf.subarray(start, this.pos))
    }

    /** Return a zero-copy view of the unread bytes in this reader. */
    view(): Uint8Array {
        return this.buf.subarray(this.pos, this.end)
    }

    /**
     * Skip a field based on its wire type.
     * Used for unknown fields to maintain forward compatibility.
     * Throws on truncation (the new pos must not exceed the end).
     */
    skip(wireType: number): void {
        switch (wireType) {
            case WireType.Varint:
                this.skipVarint()
                break
            case WireType.Bit64:
                this.pos += 8
                if (this.pos > this.end) throw new RangeError('Truncated bit64 field')
                break
            case WireType.LengthDelimited: {
                const len = this.uint32()
                this.pos += len
                if (this.pos > this.end) throw new RangeError('Truncated length-delimited field')
                break
            }
            case WireType.Bit32:
                this.pos += 4
                if (this.pos > this.end) throw new RangeError('Truncated bit32 field')
                break
            case WireType.EndGroup:
                throw new Error('Unexpected end-group tag')
            default:
                throw new Error(`Unknown wire type: ${wireType}`)
        }
    }

    /**
     * Skip a complete field, including deprecated group bodies.
     * Throws on truncation OR on the reserved field number 0 (proto spec).
     * Field 0 in an unknown-field path is the canonical signal that the input
     * is garbage rather than a valid protobuf payload, so we surface it as an
     * error instead of silently advancing the cursor.
     */
    skipTag(tag: number): void {
        const fieldNumber = tag >>> 3
        if (fieldNumber === 0) {
            throw new RangeError(`Invalid protobuf tag: field number 0 is reserved (tag=${tag})`)
        }
        const wireType = tag & 7
        switch (wireType) {
            case WireType.Varint:
                this.skipVarint()
                return
            case WireType.Bit64:
                this.pos += 8
                if (this.pos > this.end) throw new RangeError('Truncated bit64 field')
                return
            case WireType.LengthDelimited:
                this.pos += this.uint32()
                if (this.pos > this.end) {
                    throw new RangeError('Truncated length-delimited field')
                }
                return
            case WireType.StartGroup:
                this.skipGroup(fieldNumber)
                return
            case WireType.Bit32:
                this.pos += 4
                if (this.pos > this.end) throw new RangeError('Truncated bit32 field')
                return
            case WireType.EndGroup:
                throw new Error('Unexpected end-group tag')
            default:
                throw new Error(`Unknown wire type: ${wireType}`)
        }
    }

    /**
     * Create a sub-reader for reading a nested message.
     * Zero-copy: shares the same underlying buffer.
     */
    subReader(): BinaryReader {
        const len = this.uint32()
        const start = this.pos
        this.pos = start + len
        if (this.pos > this.end) {
            throw new RangeError('Truncated nested message: length exceeds buffer')
        }
        return new BinaryReader(this.buf.subarray(start, this.pos))
    }

    /**
     * Read a deprecated group field and return a zero-copy view of its body bytes.
     * The returned view excludes the closing end-group tag.
     */
    group(fieldNumber: number): Uint8Array {
        const start = this.pos
        const end = this.skipGroup(fieldNumber)
        return this.buf.subarray(start, end)
    }

    /** Check if there are more bytes to read. */
    hasMore(): boolean {
        return this.pos < this.end
    }

    private skipGroup(fieldNumber: number): number {
        while (this.pos < this.end) {
            const tagStart = this.pos
            const tag = this.uint32()
            const wireType = tag & 7
            const nestedFieldNumber = tag >>> 3

            if (wireType === WireType.EndGroup) {
                if (nestedFieldNumber !== fieldNumber) {
                    throw new Error(
                        `Mismatched end-group tag: expected ${fieldNumber}, got ${nestedFieldNumber}`
                    )
                }
                return tagStart
            }

            if (wireType === WireType.StartGroup) {
                this.skipGroup(nestedFieldNumber)
                continue
            }

            this.skip(wireType)
        }

        throw new Error(`Unexpected EOF while reading group ${fieldNumber}`)
    }
}
