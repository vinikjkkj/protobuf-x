import { encodeBase64, decodeBase64 } from '../encoding/base64.js'

/**
 * Convert a message-like object to canonical proto3 JSON.
 * Handles bytes → base64, nested messages recursively.
 */
export function toJSON(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(obj)) {
        result[key] = valueToJSON(val)
    }
    return result
}

/**
 * Convert a proto3 JSON object back to a message-like object.
 * Handles base64 → bytes when a field schema indicates bytes type.
 */
export function fromJSON(
    json: Record<string, unknown>,
    bytesFields?: ReadonlySet<string>
): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(json)) {
        if (bytesFields?.has(key) && typeof val === 'string') {
            result[key] = decodeBase64(val)
        } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            result[key] = fromJSON(val as Record<string, unknown>)
        } else if (Array.isArray(val)) {
            result[key] = val.map((item) =>
                typeof item === 'object' && item !== null && !Array.isArray(item)
                    ? fromJSON(item as Record<string, unknown>)
                    : item
            )
        } else {
            result[key] = val
        }
    }
    return result
}

function valueToJSON(val: unknown): unknown {
    if (val instanceof Uint8Array) {
        return encodeBase64(val)
    }
    if (typeof val === 'bigint') {
        return val.toString()
    }
    if (Array.isArray(val)) {
        return val.map(valueToJSON)
    }
    if (val !== null && typeof val === 'object') {
        return toJSON(val as Record<string, unknown>)
    }
    return val
}
