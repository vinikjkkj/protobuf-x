/**
 * Platform-optimized UTF-8 string encoding/decoding.
 * Uses Node.js Buffer native methods when available (5-10x faster),
 * falls back to TextEncoder/TextDecoder for browsers.
 */

// Detect Node.js Buffer
const hasBuffer =
    typeof globalThis.Buffer === 'function' && typeof globalThis.Buffer.allocUnsafe === 'function'

// Browser fallbacks
const encoder = hasBuffer ? null : new TextEncoder()
const decoder = hasBuffer ? null : new TextDecoder()

/** Calculate UTF-8 byte length of a string. */
export function utf8Length(str: string): number {
    if (hasBuffer) return globalThis.Buffer.byteLength(str, 'utf8')
    // Fast path for ASCII-only
    let len = str.length
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i)
        if (c > 0x7f) {
            // Recalculate properly
            len = 0
            for (let j = 0; j < str.length; j++) {
                const code = str.charCodeAt(j)
                if (code < 0x80) {
                    len++
                } else if (code < 0x800) {
                    len += 2
                } else if (code >= 0xd800 && code <= 0xdbff) {
                    len += 4
                    j++
                } else {
                    len += 3
                }
            }
            return len
        }
    }
    return len
}

/**
 * Write a UTF-8 string directly into a buffer at the given offset.
 * Returns the number of bytes written.
 */
export function utf8Write(str: string, buf: Uint8Array, offset: number): number {
    if (hasBuffer) {
        // Buffer.from(buf.buffer) creates a Buffer view over the same memory
        const b = globalThis.Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) as unknown as {
            utf8Write(s: string, o: number, l: number): number
        }
        return b.utf8Write(str, offset, buf.length - offset)
    }
    const result = encoder!.encodeInto(str, buf.subarray(offset))
    return result.written
}

/**
 * Read a UTF-8 string from a buffer slice.
 */
export function utf8Read(buf: Uint8Array, start: number, end: number): string {
    if (hasBuffer) {
        return globalThis.Buffer.from(buf.buffer, buf.byteOffset + start, end - start).toString(
            'utf8'
        )
    }
    return decoder!.decode(buf.subarray(start, end))
}
