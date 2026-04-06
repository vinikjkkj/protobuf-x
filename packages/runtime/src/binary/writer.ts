import { varint32Size } from './varint.js'
import type { WireType } from './wire-type.js'
import { makeTag } from './wire-type.js'
import { zigzagEncode32, zigzagEncode64 } from './zigzag.js'

// Shared scratch buffers for float/double
const f32Buf = new Float32Array(1)
const u8f32 = new Uint8Array(f32Buf.buffer)
const f64Buf = new Float64Array(1)
const u8f64 = new Uint8Array(f64Buf.buffer)

// Platform detection
const B = typeof globalThis.Buffer === 'function' ? globalThis.Buffer : null
const te = B ? null : new TextEncoder()

function alloc(n: number): Uint8Array {
    return B ? B.allocUnsafe(n) : new Uint8Array(n)
}

function strLen(s: string): number {
    return B ? B.byteLength(s, 'utf8') : te!.encode(s).length
}

const DEFAULT_SIZE = 256
const EMPTY_U8 = new Uint8Array(0)

export class BinaryWriter {
    buf: Uint8Array
    pos: number
    private forks?: number[]

    constructor(buf?: Uint8Array, pos = 0) {
        // Lazy-allocate write capacity on first write; empty writers stay allocation-free.
        this.buf = buf ?? EMPTY_U8
        this.pos = pos
    }

    static create(): BinaryWriter {
        return new BinaryWriter()
    }

    /**
     * Create a writer preloaded with already-encoded bytes.
     * Useful for fast-path wrappers that still need to return BinaryWriter.
     */
    static fromBytes(bytes: Uint8Array): BinaryWriter {
        return new BinaryWriter(bytes, bytes.length)
    }

    private grow(needed: number): void {
        let s = this.buf.length > 0 ? this.buf.length * 2 : DEFAULT_SIZE
        while (s < needed) s *= 2
        const n = alloc(s)
        n.set(this.buf.subarray(0, this.pos))
        this.buf = n
    }

    get length(): number {
        return this.pos
    }

    raw(bytes: Uint8Array): this {
        const len = bytes.length
        const need = this.pos + len
        if (need > this.buf.length) this.grow(need)
        if (len <= 2) {
            this.buf[this.pos] = bytes[0]!
            if (len === 2) this.buf[this.pos + 1] = bytes[1]!
        } else {
            this.buf.set(bytes, this.pos)
        }
        this.pos += len
        return this
    }

    uint32(value: number): this {
        const need = this.pos + 5
        if (need > this.buf.length) this.grow(need)
        const b = this.buf
        let p = this.pos
        value = value >>> 0
        if (value < 0x80) {
            b[p++] = value
        } else if (value < 0x4000) {
            b[p++] = (value & 0x7f) | 0x80
            b[p++] = value >>> 7
        } else if (value < 0x200000) {
            b[p++] = (value & 0x7f) | 0x80
            b[p++] = ((value >>> 7) & 0x7f) | 0x80
            b[p++] = value >>> 14
        } else if (value < 0x10000000) {
            b[p++] = (value & 0x7f) | 0x80
            b[p++] = ((value >>> 7) & 0x7f) | 0x80
            b[p++] = ((value >>> 14) & 0x7f) | 0x80
            b[p++] = value >>> 21
        } else {
            b[p++] = (value & 0x7f) | 0x80
            b[p++] = ((value >>> 7) & 0x7f) | 0x80
            b[p++] = ((value >>> 14) & 0x7f) | 0x80
            b[p++] = ((value >>> 21) & 0x7f) | 0x80
            b[p++] = value >>> 28
        }
        this.pos = p
        return this
    }

    int32(value: number): this {
        if (value >= 0) return this.uint32(value)
        const need = this.pos + 10
        if (need > this.buf.length) this.grow(need)
        const b = this.buf
        let p = this.pos
        b[p++] = (value & 0x7f) | 0x80
        b[p++] = ((value >>> 7) & 0x7f) | 0x80
        b[p++] = ((value >>> 14) & 0x7f) | 0x80
        b[p++] = ((value >>> 21) & 0x7f) | 0x80
        b[p++] = ((value >>> 28) & 0x0f) | 0x70 | 0x80
        b[p++] = 0xff
        b[p++] = 0xff
        b[p++] = 0xff
        b[p++] = 0xff
        b[p++] = 0x01
        this.pos = p
        return this
    }

    sint32(value: number): this {
        return this.uint32(zigzagEncode32(value))
    }

    uint64(lo: number, hi: number): this {
        const need = this.pos + 10
        if (need > this.buf.length) this.grow(need)
        const b = this.buf
        let p = this.pos
        if (hi === 0) {
            lo = lo >>> 0
            if (lo < 0x80) {
                b[p++] = lo
                this.pos = p
                return this
            }
            b[p++] = (lo & 0x7f) | 0x80
            if (lo < 0x4000) {
                b[p++] = lo >>> 7
                this.pos = p
                return this
            }
            b[p++] = ((lo >>> 7) & 0x7f) | 0x80
            if (lo < 0x200000) {
                b[p++] = lo >>> 14
                this.pos = p
                return this
            }
            b[p++] = ((lo >>> 14) & 0x7f) | 0x80
            if (lo < 0x10000000) {
                b[p++] = lo >>> 21
                this.pos = p
                return this
            }
            b[p++] = ((lo >>> 21) & 0x7f) | 0x80
            b[p++] = lo >>> 28
            this.pos = p
            return this
        }
        while (hi > 0 || lo > 127) {
            b[p++] = (lo & 0x7f) | 0x80
            lo = ((lo >>> 7) | (hi << 25)) >>> 0
            hi = hi >>> 7
        }
        b[p++] = lo
        this.pos = p
        return this
    }

    sint64(lo: number, hi: number): this {
        const [zlo, zhi] = zigzagEncode64(lo, hi)
        return this.uint64(zlo, zhi)
    }

    bool(value: boolean): this {
        if (this.pos + 1 > this.buf.length) this.grow(this.pos + 1)
        this.buf[this.pos++] = value ? 1 : 0
        return this
    }

    fixed32(value: number): this {
        const v = value >>> 0
        const need = this.pos + 4
        if (need > this.buf.length) this.grow(need)
        const b = this.buf
        const p = this.pos
        b[p] = v & 0xff
        b[p + 1] = (v >>> 8) & 0xff
        b[p + 2] = (v >>> 16) & 0xff
        b[p + 3] = (v >>> 24) & 0xff
        this.pos = p + 4
        return this
    }

    sfixed32(value: number): this {
        return this.fixed32(value)
    }

    sfixed64(lo: number, hi: number): this {
        return this.fixed64(lo, hi)
    }

    fixed64(lo: number, hi: number): this {
        const need = this.pos + 8
        if (need > this.buf.length) this.grow(need)
        const b = this.buf
        const p = this.pos
        b[p] = lo & 0xff
        b[p + 1] = (lo >>> 8) & 0xff
        b[p + 2] = (lo >>> 16) & 0xff
        b[p + 3] = (lo >>> 24) & 0xff
        b[p + 4] = hi & 0xff
        b[p + 5] = (hi >>> 8) & 0xff
        b[p + 6] = (hi >>> 16) & 0xff
        b[p + 7] = (hi >>> 24) & 0xff
        this.pos = p + 8
        return this
    }

    float(value: number): this {
        f32Buf[0] = value
        if (this.pos + 4 > this.buf.length) this.grow(this.pos + 4)
        const p = this.pos
        this.buf[p] = u8f32[0]!
        this.buf[p + 1] = u8f32[1]!
        this.buf[p + 2] = u8f32[2]!
        this.buf[p + 3] = u8f32[3]!
        this.pos = p + 4
        return this
    }

    double(value: number): this {
        f64Buf[0] = value
        if (this.pos + 8 > this.buf.length) this.grow(this.pos + 8)
        const b = this.buf
        const p = this.pos
        b[p] = u8f64[0]!
        b[p + 1] = u8f64[1]!
        b[p + 2] = u8f64[2]!
        b[p + 3] = u8f64[3]!
        b[p + 4] = u8f64[4]!
        b[p + 5] = u8f64[5]!
        b[p + 6] = u8f64[6]!
        b[p + 7] = u8f64[7]!
        this.pos = p + 8
        return this
    }

    bytes(value: Uint8Array): this {
        const len = value.length
        this.uint32(len)
        const need = this.pos + len
        if (need > this.buf.length) this.grow(need)
        const b = this.buf
        let p = this.pos
        if (len <= 64) {
            // Manual copy avoids FastBuffer wrapper from buf.set(Buffer, offset)
            let i = 0
            for (; i + 7 < len; i += 8) {
                b[p + i] = value[i]!
                b[p + i + 1] = value[i + 1]!
                b[p + i + 2] = value[i + 2]!
                b[p + i + 3] = value[i + 3]!
                b[p + i + 4] = value[i + 4]!
                b[p + i + 5] = value[i + 5]!
                b[p + i + 6] = value[i + 6]!
                b[p + i + 7] = value[i + 7]!
            }
            for (; i < len; i++) b[p + i] = value[i]!
        } else {
            b.set(value, p)
        }
        this.pos = p + len
        return this
    }

    string(value: string): this {
        if (value.length === 0) return this.uint32(0)
        const byteLen = strLen(value)
        this.uint32(byteLen)
        const need = this.pos + byteLen
        if (need > this.buf.length) this.grow(need)
        if (B) {
            ;(
                this.buf as unknown as { utf8Write(s: string, o: number, l: number): number }
            ).utf8Write(value, this.pos, byteLen)
        } else {
            te!.encodeInto(value, this.buf.subarray(this.pos))
        }
        this.pos += byteLen
        return this
    }

    fork(): BinaryWriter {
        if (this.pos + 5 > this.buf.length) this.grow(this.pos + 5)
        ;(this.forks ??= []).push(this.pos)
        this.pos += 5
        return this
    }

    join(): this {
        const forkPos = this.forks?.pop()
        if (forkPos === undefined) {
            throw new Error('No open fork to join')
        }
        const contentStart = forkPos + 5
        const contentLen = this.pos - contentStart
        const lenSize = varint32Size(contentLen)
        const shift = 5 - lenSize
        if (shift > 0) {
            this.buf.copyWithin(forkPos + lenSize, contentStart, this.pos)
            this.pos -= shift
        }
        let v = contentLen >>> 0
        let p = forkPos
        const b = this.buf
        if (v < 0x80) {
            b[p] = v
        } else if (v < 0x4000) {
            b[p++] = (v & 0x7f) | 0x80
            b[p] = v >>> 7
        } else if (v < 0x200000) {
            b[p++] = (v & 0x7f) | 0x80
            b[p++] = ((v >>> 7) & 0x7f) | 0x80
            b[p] = v >>> 14
        } else if (v < 0x10000000) {
            b[p++] = (v & 0x7f) | 0x80
            b[p++] = ((v >>> 7) & 0x7f) | 0x80
            b[p++] = ((v >>> 14) & 0x7f) | 0x80
            b[p] = v >>> 21
        } else {
            b[p++] = (v & 0x7f) | 0x80
            b[p++] = ((v >>> 7) & 0x7f) | 0x80
            b[p++] = ((v >>> 14) & 0x7f) | 0x80
            b[p++] = ((v >>> 21) & 0x7f) | 0x80
            b[p] = v >>> 28
        }
        return this
    }

    tag(fieldNumber: number, wireType: WireType): this {
        return this.uint32(makeTag(fieldNumber, wireType))
    }

    /** Finalize and return a view of written bytes without copying. */
    finish(): Uint8Array {
        const result = this.pos === this.buf.length ? this.buf : this.buf.subarray(0, this.pos)
        // Detach after finalize (same post-finish semantics as before).
        this.buf = null!
        this.pos = 0
        if (this.forks !== undefined) this.forks.length = 0
        return result
    }

    reset(): void {
        this.pos = 0
        if (this.forks !== undefined) this.forks.length = 0
    }
}
