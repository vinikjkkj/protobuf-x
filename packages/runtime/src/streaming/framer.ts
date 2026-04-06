import { encodeVarint32, decodeVarint32, varint32Size } from '../binary/varint.js'

/**
 * Frame a message with a varint32 length prefix.
 * Used for length-delimited streaming.
 */
export function frame(msg: Uint8Array): Uint8Array {
    const lenSize = varint32Size(msg.length)
    const framed = new Uint8Array(lenSize + msg.length)
    const offset = encodeVarint32(msg.length, framed, 0)
    framed.set(msg, offset)
    return framed
}

/**
 * Incremental deframer for length-prefixed messages.
 * Buffers partial data and yields complete messages.
 */
export class Deframer {
    private buffer: Uint8Array | null = null
    private offset = 0

    /**
     * Push new data into the deframer.
     * Returns an array of complete message payloads.
     */
    push(chunk: Uint8Array): Uint8Array[] {
        // Append chunk to buffer
        if (this.buffer && this.offset < this.buffer.length) {
            const remaining = this.buffer.subarray(this.offset)
            const combined = new Uint8Array(remaining.length + chunk.length)
            combined.set(remaining, 0)
            combined.set(chunk, remaining.length)
            this.buffer = combined
            this.offset = 0
        } else {
            this.buffer = chunk
            this.offset = 0
        }

        const messages: Uint8Array[] = []

        while (this.buffer && this.offset < this.buffer.length) {
            // Try to read length prefix
            const startOffset = this.offset

            // Check if we have enough bytes for the varint
            if (this.buffer[this.offset]! >= 0x80 && this.offset + 1 >= this.buffer.length) break

            let msgLen: number
            let newOffset: number
            try {
                ;[msgLen, newOffset] = decodeVarint32(this.buffer, this.offset)
            } catch {
                // Not enough data for varint
                break
            }

            // Check if we have the full message
            if (newOffset + msgLen > this.buffer.length) {
                // Incomplete message, wait for more data
                this.offset = startOffset
                break
            }

            // Extract complete message (zero-copy subarray)
            messages.push(this.buffer.subarray(newOffset, newOffset + msgLen))
            this.offset = newOffset + msgLen
        }

        // Clean up consumed buffer
        if (this.buffer && this.offset >= this.buffer.length) {
            this.buffer = null
            this.offset = 0
        }

        return messages
    }

    /** Check if there's buffered partial data. */
    get hasPartial(): boolean {
        return this.buffer !== null && this.offset < this.buffer.length
    }

    /** Reset the deframer state. */
    reset(): void {
        this.buffer = null
        this.offset = 0
    }
}
