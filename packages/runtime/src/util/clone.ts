import type { Message } from '../message/base.js'

/** Clone a message via encode/decode (guaranteed deep copy). */
export function clone<T extends Message<T>>(msg: T): T {
    return msg.clone()
}
