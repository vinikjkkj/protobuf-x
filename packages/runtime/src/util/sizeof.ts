import type { Message } from '../message/base.js'

/**
 * Calculate the wire size of a message without allocating a buffer.
 * Uses the writer's length property which tracks size via the linked list.
 */
export function sizeOf<T extends Message<T>>(msg: T): number {
    const writer = msg.encode()
    return writer.length
}
