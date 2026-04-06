import type { Message } from '../message/base.js'

/**
 * Deep merge two messages following proto3 merge semantics:
 * - Scalars: source value wins
 * - Repeated: values are concatenated
 * - Messages: recursively merged
 *
 * Returns the target (mutated in-place).
 */
export function merge<T extends Message<T>>(target: T, source: Partial<T>): T {
    return target.merge(source) as unknown as T
}
