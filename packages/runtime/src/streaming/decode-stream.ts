import type { MessageType, Message } from '../message/base.js'

import { Deframer } from './framer.js'

/**
 * Create an async iterable that decodes length-prefixed messages from a stream.
 *
 * Usage:
 *   for await (const msg of decodeStream(readable, MyMessage)) {
 *     console.log(msg);
 *   }
 */
export async function* decodeStream<T extends Message<T>>(
    source: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
    msgType: MessageType<T>
): AsyncGenerator<T> {
    const deframer = new Deframer()
    const iterable = isAsyncIterable(source) ? source : readableStreamToAsyncIterable(source)

    for await (const chunk of iterable) {
        const messages = deframer.push(chunk)
        for (const raw of messages) {
            yield msgType.decode(raw)
        }
    }

    // If there's remaining data, it's a truncated message
    if (deframer.hasPartial) {
        throw new Error('Stream ended with incomplete message')
    }
}

function isAsyncIterable(obj: unknown): obj is AsyncIterable<Uint8Array> {
    return obj !== null && typeof obj === 'object' && Symbol.asyncIterator in obj
}

async function* readableStreamToAsyncIterable(
    stream: ReadableStream<Uint8Array>
): AsyncGenerator<Uint8Array> {
    const reader = stream.getReader()
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            yield value
        }
    } finally {
        reader.releaseLock()
    }
}
