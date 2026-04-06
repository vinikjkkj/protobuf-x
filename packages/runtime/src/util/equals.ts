import type { Message } from '../message/base.js'

/**
 * Fast byte-level equality check between two messages.
 * Encodes both and compares the resulting bytes.
 */
export function equals<T extends Message<T>>(a: T, b: T): boolean {
    return a.equals(b)
}

/**
 * Shallow structural equality check (without encoding).
 * Faster for simple messages, but does not handle nested messages correctly.
 */
export function shallowEquals(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false

    for (const key of keysA) {
        const valA = a[key]
        const valB = b[key]
        if (valA instanceof Uint8Array && valB instanceof Uint8Array) {
            if (valA.length !== valB.length) return false
            for (let i = 0; i < valA.length; i++) {
                if (valA[i] !== valB[i]) return false
            }
        } else if (valA !== valB) {
            return false
        }
    }
    return true
}
