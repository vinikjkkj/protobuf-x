/**
 * High-performance varint encoding/decoding.
 * Hand-unrolled loops for common cases (1-5 byte varints).
 * Covers all uint32 values (max 5 bytes) and the common range of uint64.
 */

/**
 * Encode a uint32 as varint into buf at offset.
 * Returns the new offset after writing.
 */
export function encodeVarint32(value: number, buf: Uint8Array, offset: number): number {
    value = value >>> 0 // ensure unsigned 32-bit

    if (value < 0x80) {
        buf[offset++] = value
        return offset
    }
    buf[offset++] = (value & 0x7f) | 0x80

    if (value < 0x4000) {
        buf[offset++] = value >>> 7
        return offset
    }
    buf[offset++] = ((value >>> 7) & 0x7f) | 0x80

    if (value < 0x200000) {
        buf[offset++] = value >>> 14
        return offset
    }
    buf[offset++] = ((value >>> 14) & 0x7f) | 0x80

    if (value < 0x10000000) {
        buf[offset++] = value >>> 21
        return offset
    }
    buf[offset++] = ((value >>> 21) & 0x7f) | 0x80
    buf[offset++] = value >>> 28
    return offset
}

/**
 * Decode a uint32 varint from buf at offset.
 * Returns [value, newOffset].
 */
export function decodeVarint32(buf: Uint8Array, offset: number): [number, number] {
    let b = buf[offset++]!
    let result = b & 0x7f

    if (b < 0x80) return [result, offset]

    b = buf[offset++]!
    result |= (b & 0x7f) << 7
    if (b < 0x80) return [result, offset]

    b = buf[offset++]!
    result |= (b & 0x7f) << 14
    if (b < 0x80) return [result, offset]

    b = buf[offset++]!
    result |= (b & 0x7f) << 21
    if (b < 0x80) return [result, offset]

    b = buf[offset++]!
    result |= (b & 0x0f) << 28 // only 4 bits from 5th byte for uint32
    if (b < 0x80) return [result >>> 0, offset]

    // Consume remaining bytes of a 64-bit varint (up to 10 bytes total)
    for (let i = 0; i < 5; i++) {
        if (buf[offset++]! < 0x80) return [result >>> 0, offset]
    }

    throw new RangeError('Varint too long')
}

/**
 * Encode a int64 varint (as two 32-bit halves: lo, hi) into buf at offset.
 * Returns new offset.
 */
export function encodeVarint64(lo: number, hi: number, buf: Uint8Array, offset: number): number {
    while (hi > 0 || lo > 127) {
        buf[offset++] = (lo & 0x7f) | 0x80
        lo = ((lo >>> 7) | (hi << 25)) >>> 0
        hi = hi >>> 7
    }
    buf[offset++] = lo
    return offset
}

/**
 * Decode a uint64 varint from buf at offset.
 * Returns [lo, hi, newOffset] where lo and hi are unsigned 32-bit halves.
 */
export function decodeVarint64(buf: Uint8Array, offset: number): [number, number, number] {
    let lo = 0
    let hi = 0
    let shift = 0
    let b: number

    // Read up to 10 bytes
    for (let i = 0; i < 10; i++) {
        b = buf[offset++]!
        if (shift < 28) {
            lo |= (b & 0x7f) << shift
        } else if (shift === 28) {
            lo |= (b & 0x0f) << 28
            hi |= (b & 0x7f) >> 4
        } else {
            hi |= (b & 0x7f) << (shift - 32)
        }
        if (b < 0x80) {
            return [lo >>> 0, hi >>> 0, offset]
        }
        shift += 7
    }

    throw new RangeError('Varint too long')
}

/** Calculate the byte length of a uint32 encoded as varint. */
export function varint32Size(value: number): number {
    value = value >>> 0
    if (value < 0x80) return 1
    if (value < 0x4000) return 2
    if (value < 0x200000) return 3
    if (value < 0x10000000) return 4
    return 5
}

/** Calculate the byte length of a uint64 (lo, hi) encoded as varint. */
export function varint64Size(lo: number, hi: number): number {
    if (hi === 0) return varint32Size(lo)
    if (hi < 0x08) return 5
    if (hi < 0x400) return 6
    if (hi < 0x20000) return 7
    if (hi < 0x1000000) return 8
    if (hi < 0x80000000) return 9
    return 10
}
