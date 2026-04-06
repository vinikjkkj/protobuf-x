/** A single validation error. */
export interface ValidationError {
    /** Dot-separated field path (e.g., "user.address.city"). */
    readonly path: string
    /** Human-readable error message. */
    readonly message: string
    /** The invalid value. */
    readonly value: unknown
}

/**
 * Validate a plain object against expected field types.
 * Returns an array of validation errors (empty if valid).
 */
export function validate(
    obj: Record<string, unknown>,
    schema: Record<string, FieldSchema>,
    prefix = ''
): ValidationError[] {
    const errors: ValidationError[] = []
    const keys = Object.keys(schema)

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!
        const field = schema[key]!
        const value = obj[key]

        if (field.required && (value === undefined || value === null)) {
            errors.push({
                path: prefix ? `${prefix}.${key}` : key,
                message: 'Required field is missing',
                value
            })
            continue
        }

        if (value === undefined || value === null) continue

        const path = prefix ? `${prefix}.${key}` : key

        switch (field.type) {
            case 'string':
                if (typeof value !== 'string')
                    errors.push({ path, message: `Expected string, got ${typeof value}`, value })
                break
            case 'number':
                if (typeof value !== 'number')
                    errors.push({ path, message: `Expected number, got ${typeof value}`, value })
                break
            case 'boolean':
                if (typeof value !== 'boolean')
                    errors.push({ path, message: `Expected boolean, got ${typeof value}`, value })
                break
            case 'bytes':
                if (!(value instanceof Uint8Array))
                    errors.push({ path, message: 'Expected Uint8Array', value })
                break
            case 'repeated':
                if (!Array.isArray(value)) errors.push({ path, message: 'Expected array', value })
                break
            case 'message':
                if (field.schema) {
                    if (typeof value !== 'object')
                        errors.push({ path, message: 'Expected object', value })
                    else
                        errors.push(
                            ...validate(value as Record<string, unknown>, field.schema, path)
                        )
                }
                break
        }

        if (field.validator) {
            const err = field.validator(value)
            if (err) errors.push({ path, message: err, value })
        }
    }

    return errors
}

/** Schema definition for a single field. */
export interface FieldSchema {
    type: 'string' | 'number' | 'boolean' | 'bytes' | 'repeated' | 'message'
    required?: boolean
    schema?: Record<string, FieldSchema>
    validator?: (value: unknown) => string | undefined
}
