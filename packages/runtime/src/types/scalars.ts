/** All protobuf scalar types. */
export const enum ScalarType {
    DOUBLE = 1,
    FLOAT = 2,
    INT64 = 3,
    UINT64 = 4,
    INT32 = 5,
    FIXED64 = 6,
    FIXED32 = 7,
    BOOL = 8,
    STRING = 9,
    BYTES = 12,
    UINT32 = 13,
    SFIXED32 = 15,
    SFIXED64 = 16,
    SINT32 = 17,
    SINT64 = 18
}

/** Returns the default value for a given scalar type. */
export function scalarDefaultValue(type: ScalarType): unknown {
    switch (type) {
        case ScalarType.DOUBLE:
        case ScalarType.FLOAT:
        case ScalarType.INT64:
        case ScalarType.UINT64:
        case ScalarType.INT32:
        case ScalarType.FIXED64:
        case ScalarType.FIXED32:
        case ScalarType.UINT32:
        case ScalarType.SFIXED32:
        case ScalarType.SFIXED64:
        case ScalarType.SINT32:
        case ScalarType.SINT64:
            return 0
        case ScalarType.BOOL:
            return false
        case ScalarType.STRING:
            return ''
        case ScalarType.BYTES:
            return new Uint8Array(0)
    }
}

/** Check whether a value is the default for its scalar type. */
export function isScalarDefault(type: ScalarType, value: unknown): boolean {
    switch (type) {
        case ScalarType.DOUBLE:
        case ScalarType.FLOAT:
        case ScalarType.INT32:
        case ScalarType.UINT32:
        case ScalarType.SINT32:
        case ScalarType.SFIXED32:
        case ScalarType.FIXED32:
            return value === 0
        case ScalarType.INT64:
        case ScalarType.UINT64:
        case ScalarType.SINT64:
        case ScalarType.SFIXED64:
        case ScalarType.FIXED64:
            return value === 0 || value === 0n
        case ScalarType.BOOL:
            return value === false
        case ScalarType.STRING:
            return value === ''
        case ScalarType.BYTES:
            return value instanceof Uint8Array && value.length === 0
    }
}
