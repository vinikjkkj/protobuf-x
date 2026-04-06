/**
 * ZigZag encoding for signed integers.
 * Maps signed integers to unsigned integers so that numbers with small
 * absolute values have small varint encoded values.
 */

/** ZigZag encode a signed 32-bit integer. */
export function zigzagEncode32(n: number): number {
    return ((n << 1) ^ (n >> 31)) >>> 0
}

/** ZigZag decode an unsigned 32-bit integer back to signed. */
export function zigzagDecode32(n: number): number {
    return ((n >>> 1) ^ -(n & 1)) | 0
}

/** ZigZag encode a signed 64-bit value (lo, hi halves). Returns [lo, hi]. */
export function zigzagEncode64(lo: number, hi: number): [number, number] {
    const signBit = hi >> 31 // -1 if negative, 0 if positive
    // (lo, hi) << 1
    const shiftHi = ((hi << 1) | (lo >>> 31)) >>> 0
    const shiftLo = (lo << 1) >>> 0
    // XOR with sign extension
    return [(shiftLo ^ signBit) >>> 0, (shiftHi ^ signBit) >>> 0]
}

/** ZigZag decode an unsigned 64-bit value (lo, hi halves). Returns [lo, hi]. */
export function zigzagDecode64(lo: number, hi: number): [number, number] {
    const signBit = -(lo & 1) // -1 if odd, 0 if even
    // (lo, hi) >>> 1
    const shiftLo = ((lo >>> 1) | (hi << 31)) >>> 0
    const shiftHi = hi >>> 1
    // XOR with sign extension
    return [(shiftLo ^ signBit) >>> 0, (shiftHi ^ signBit) >>> 0]
}
