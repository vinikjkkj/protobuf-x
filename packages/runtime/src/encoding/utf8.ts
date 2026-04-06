// Singleton instances — never reallocated
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Encode a string to UTF-8 bytes. */
export function encodeUtf8(str: string): Uint8Array {
    return encoder.encode(str)
}

/** Decode UTF-8 bytes to a string (zero-copy via subarray). */
export function decodeUtf8(buf: Uint8Array, start?: number, end?: number): string {
    if (start !== undefined || end !== undefined) {
        return decoder.decode(buf.subarray(start ?? 0, end ?? buf.length))
    }
    return decoder.decode(buf)
}

/** Calculate the byte length of a string in UTF-8 without encoding it. */
export function utf8ByteLength(str: string): number {
    let len = 0
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i)
        if (code < 0x80) {
            len += 1
        } else if (code < 0x800) {
            len += 2
        } else if (code >= 0xd800 && code <= 0xdbff) {
            // Surrogate pair
            len += 4
            i++ // skip low surrogate
        } else {
            len += 3
        }
    }
    return len
}
