import type { Message } from '../message/base.js'

import { frame } from './framer.js'

/**
 * Encode messages into a stream of length-prefixed frames.
 *
 * Usage:
 *   const frames = encodeStream(messages);
 *   for await (const chunk of frames) {
 *     writable.write(chunk);
 *   }
 */
export async function* encodeStream<T extends Message<T>>(
    source: AsyncIterable<T> | Iterable<T>
): AsyncGenerator<Uint8Array> {
    for await (const msg of source) {
        const bytes = msg.toBinary()
        yield frame(bytes)
    }
}

/**
 * Encode a single message as a length-prefixed frame.
 */
export function encodeDelimited<T extends Message<T>>(msg: T): Uint8Array {
    return frame(msg.toBinary())
}
