/** A single field difference between two objects. */
export interface FieldDiff {
    /** Dot-separated field path. */
    readonly path: string
    /** Value in the first object. */
    readonly before: unknown
    /** Value in the second object. */
    readonly after: unknown
}

/**
 * Compute the diff between two message-like objects.
 * Returns an array of field changes.
 */
export function diff(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
    prefix = ''
): FieldDiff[] {
    const diffs: FieldDiff[] = []
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)])

    for (const key of allKeys) {
        const path = prefix ? `${prefix}.${key}` : key
        const va = a[key]
        const vb = b[key]

        if (va instanceof Uint8Array && vb instanceof Uint8Array) {
            if (!bytesEqual(va, vb)) {
                diffs.push({ path, before: va, after: vb })
            }
        } else if (Array.isArray(va) && Array.isArray(vb)) {
            if (!arraysEqual(va, vb)) {
                diffs.push({ path, before: va, after: vb })
            }
        } else if (isPlainObject(va) && isPlainObject(vb)) {
            diffs.push(...diff(va as Record<string, unknown>, vb as Record<string, unknown>, path))
        } else if (va !== vb) {
            diffs.push({ path, before: va, after: vb })
        }
    }

    return diffs
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

function isPlainObject(v: unknown): boolean {
    return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Uint8Array)
}
