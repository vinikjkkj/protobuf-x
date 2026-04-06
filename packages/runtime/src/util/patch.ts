/**
 * Apply a partial update to a message-like object.
 * Only overwrites fields present in the partial.
 */
export function patch<T extends Record<string, unknown>>(target: T, partial: Partial<T>): T {
    return Object.assign(target, partial)
}
