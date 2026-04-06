const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Lookup table for decoding
const LOOKUP = new Uint8Array(128)
LOOKUP.fill(0xff)
for (let i = 0; i < CHARS.length; i++) {
    LOOKUP[CHARS.charCodeAt(i)] = i
}
LOOKUP['='.charCodeAt(0)] = 0

/** Encode bytes to base64 string. */
export function encodeBase64(buf: Uint8Array): string {
    let result = ''
    const len = buf.length
    const rem = len % 3
    const end = len - rem

    for (let i = 0; i < end; i += 3) {
        const b0 = buf[i]!
        const b1 = buf[i + 1]!
        const b2 = buf[i + 2]!
        result += CHARS[b0 >> 2]
        result += CHARS[((b0 & 3) << 4) | (b1 >> 4)]
        result += CHARS[((b1 & 15) << 2) | (b2 >> 6)]
        result += CHARS[b2 & 63]
    }

    if (rem === 1) {
        const b0 = buf[end]!
        result += CHARS[b0 >> 2]
        result += CHARS[(b0 & 3) << 4]
        result += '=='
    } else if (rem === 2) {
        const b0 = buf[end]!
        const b1 = buf[end + 1]!
        result += CHARS[b0 >> 2]
        result += CHARS[((b0 & 3) << 4) | (b1 >> 4)]
        result += CHARS[(b1 & 15) << 2]
        result += '='
    }

    return result
}

/** Decode base64 string to bytes. */
export function decodeBase64(str: string): Uint8Array {
    // Remove padding to calculate output length
    let len = str.length
    while (len > 0 && str[len - 1] === '=') len--

    const outLen = (len * 3) >> 2
    const buf = new Uint8Array(outLen)
    let j = 0

    for (let i = 0; i < str.length; i += 4) {
        const a = LOOKUP[str.charCodeAt(i)]!
        const b = LOOKUP[str.charCodeAt(i + 1)]!
        const c = LOOKUP[str.charCodeAt(i + 2)]!
        const d = LOOKUP[str.charCodeAt(i + 3)]!

        buf[j++] = (a << 2) | (b >> 4)
        if (j < outLen) buf[j++] = ((b & 15) << 4) | (c >> 2)
        if (j < outLen) buf[j++] = ((c & 3) << 6) | d
    }

    return buf
}
