/**
 * Deep freeze an object and all its nested objects.
 * Returns the frozen object with a Readonly type.
 */
export function freeze<T>(obj: T): Readonly<T> {
    if (obj === null || typeof obj !== 'object') return obj
    Object.freeze(obj)
    for (const val of Object.values(obj as Record<string, unknown>)) {
        if (typeof val === 'object' && val !== null && !Object.isFrozen(val)) {
            freeze(val)
        }
    }
    return obj
}
