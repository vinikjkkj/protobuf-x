import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { wellKnownToJSON, wellKnownFromJSON, isWellKnownType } from '../well-known-json.js'

describe('isWellKnownType', () => {
    it('returns true for all well-known types', () => {
        assert.ok(isWellKnownType('google.protobuf.Timestamp'))
        assert.ok(isWellKnownType('google.protobuf.Duration'))
        assert.ok(isWellKnownType('google.protobuf.Any'))
        assert.ok(isWellKnownType('google.protobuf.Struct'))
        assert.ok(isWellKnownType('google.protobuf.Value'))
        assert.ok(isWellKnownType('google.protobuf.ListValue'))
        assert.ok(isWellKnownType('google.protobuf.FieldMask'))
        assert.ok(isWellKnownType('google.protobuf.Empty'))
        assert.ok(isWellKnownType('google.protobuf.StringValue'))
        assert.ok(isWellKnownType('google.protobuf.Int32Value'))
        assert.ok(isWellKnownType('google.protobuf.BoolValue'))
    })

    it('returns false for non-well-known types', () => {
        assert.ok(!isWellKnownType('my.package.MyMessage'))
        assert.ok(!isWellKnownType('google.protobuf.Unknown'))
        assert.ok(!isWellKnownType(''))
    })
})

describe('Timestamp', () => {
    const typeName = 'google.protobuf.Timestamp'

    it('serializes to ISO 8601 string', () => {
        const msg = { seconds: 1672531200, nanos: 0 }
        const json = wellKnownToJSON(typeName, msg)
        assert.equal(json, '2023-01-01T00:00:00.000Z')
    })

    it('serializes with millisecond precision', () => {
        const msg = { seconds: 1672531200, nanos: 500_000_000 }
        const json = wellKnownToJSON(typeName, msg)
        assert.equal(json, '2023-01-01T00:00:00.500Z')
    })

    it('serializes with nanosecond precision', () => {
        const msg = { seconds: 1672531200, nanos: 123_456_789 }
        const json = wellKnownToJSON(typeName, msg)
        assert.equal(json, '2023-01-01T00:00:00.123456789Z')
    })

    it('deserializes from ISO 8601 string', () => {
        const result = wellKnownFromJSON(typeName, '2023-01-01T00:00:00.000Z')
        assert.equal(result.seconds, 1672531200)
        assert.equal(result.nanos, 0)
    })

    it('deserializes with fractional seconds', () => {
        const result = wellKnownFromJSON(typeName, '2023-01-01T00:00:00.500Z')
        assert.equal(result.seconds, 1672531200)
        assert.equal(result.nanos, 500_000_000)
    })

    it('round-trips correctly', () => {
        const original = { seconds: 1672531200, nanos: 123_000_000 }
        const json = wellKnownToJSON(typeName, original)
        const restored = wellKnownFromJSON(typeName, json)
        assert.equal(restored.seconds, original.seconds)
        assert.equal(restored.nanos, original.nanos)
    })

    it('handles zero timestamp', () => {
        const msg = { seconds: 0, nanos: 0 }
        const json = wellKnownToJSON(typeName, msg)
        assert.equal(json, '1970-01-01T00:00:00.000Z')
    })
})

describe('Duration', () => {
    const typeName = 'google.protobuf.Duration'

    it('serializes whole seconds', () => {
        const msg = { seconds: 123, nanos: 0 }
        assert.equal(wellKnownToJSON(typeName, msg), '123s')
    })

    it('serializes with nanos', () => {
        const msg = { seconds: 123, nanos: 456_000_000 }
        assert.equal(wellKnownToJSON(typeName, msg), '123.456s')
    })

    it('serializes negative duration', () => {
        const msg = { seconds: -5, nanos: -500_000_000 }
        assert.equal(wellKnownToJSON(typeName, msg), '-5.5s')
    })

    it('serializes zero duration', () => {
        const msg = { seconds: 0, nanos: 0 }
        assert.equal(wellKnownToJSON(typeName, msg), '0s')
    })

    it('deserializes whole seconds', () => {
        const result = wellKnownFromJSON(typeName, '123s')
        assert.equal(result.seconds, 123)
        assert.equal(result.nanos, 0)
    })

    it('deserializes with nanos', () => {
        const result = wellKnownFromJSON(typeName, '123.456s')
        assert.equal(result.seconds, 123)
        assert.equal(result.nanos, 456_000_000)
    })

    it('deserializes negative duration', () => {
        const result = wellKnownFromJSON(typeName, '-5.5s')
        assert.equal(result.seconds, -5)
        assert.equal(result.nanos, -500_000_000)
    })

    it('round-trips correctly', () => {
        const original = { seconds: 42, nanos: 100_000_000 }
        const json = wellKnownToJSON(typeName, original)
        const restored = wellKnownFromJSON(typeName, json)
        assert.equal(restored.seconds, original.seconds)
        assert.equal(restored.nanos, original.nanos)
    })
})

describe('Any', () => {
    const typeName = 'google.protobuf.Any'

    it('serializes with @type field', () => {
        const msg = { type_url: 'type.googleapis.com/my.Message', value: new Uint8Array(0) }
        const json = wellKnownToJSON(typeName, msg) as Record<string, unknown>
        assert.equal(json['@type'], 'type.googleapis.com/my.Message')
    })

    it('preserves extra fields in serialization', () => {
        const msg = {
            type_url: 'type.googleapis.com/my.Message',
            value: new Uint8Array(0),
            name: 'test'
        }
        const json = wellKnownToJSON(typeName, msg) as Record<string, unknown>
        assert.equal(json['@type'], 'type.googleapis.com/my.Message')
        assert.equal(json.name, 'test')
        assert.equal(json.value, undefined)
    })

    it('deserializes from JSON with @type', () => {
        const result = wellKnownFromJSON(typeName, {
            '@type': 'type.googleapis.com/my.Message',
            name: 'test'
        })
        assert.equal(result.type_url, 'type.googleapis.com/my.Message')
        assert.equal(result.name, 'test')
    })
})

describe('Struct', () => {
    const typeName = 'google.protobuf.Struct'

    it('serializes Map-based fields to plain object', () => {
        const fields = new Map<string, Record<string, unknown>>()
        fields.set('name', { stringValue: 'hello' })
        fields.set('count', { numberValue: 42 })
        const msg = { fields }
        const json = wellKnownToJSON(typeName, msg) as Record<string, unknown>
        assert.equal(json.name, 'hello')
        assert.equal(json.count, 42)
    })

    it('deserializes plain object to Map-based fields', () => {
        const result = wellKnownFromJSON(typeName, { name: 'hello', count: 42 })
        const fields = result.fields as Map<string, Record<string, unknown>>
        assert.ok(fields instanceof Map)
        assert.deepEqual(fields.get('name'), { stringValue: 'hello' })
        assert.deepEqual(fields.get('count'), { numberValue: 42 })
    })
})

describe('Value', () => {
    const typeName = 'google.protobuf.Value'

    it('serializes null value', () => {
        assert.equal(wellKnownToJSON(typeName, { nullValue: 0 }), null)
    })

    it('serializes number value', () => {
        assert.equal(wellKnownToJSON(typeName, { numberValue: 3.14 }), 3.14)
    })

    it('serializes string value', () => {
        assert.equal(wellKnownToJSON(typeName, { stringValue: 'hello' }), 'hello')
    })

    it('serializes bool value', () => {
        assert.equal(wellKnownToJSON(typeName, { boolValue: true }), true)
    })

    it('deserializes null', () => {
        assert.deepEqual(wellKnownFromJSON(typeName, null), { nullValue: 0 })
    })

    it('deserializes number', () => {
        assert.deepEqual(wellKnownFromJSON(typeName, 42), { numberValue: 42 })
    })

    it('deserializes string', () => {
        assert.deepEqual(wellKnownFromJSON(typeName, 'test'), { stringValue: 'test' })
    })

    it('deserializes boolean', () => {
        assert.deepEqual(wellKnownFromJSON(typeName, false), { boolValue: false })
    })

    it('deserializes array as listValue', () => {
        const result = wellKnownFromJSON(typeName, [1, 'two'])
        assert.ok(result.listValue !== undefined)
    })

    it('deserializes object as structValue', () => {
        const result = wellKnownFromJSON(typeName, { key: 'val' })
        assert.ok(result.structValue !== undefined)
    })
})

describe('ListValue', () => {
    const typeName = 'google.protobuf.ListValue'

    it('serializes to JS array', () => {
        const msg = {
            values: [{ numberValue: 1 }, { stringValue: 'two' }, { boolValue: true }]
        }
        const json = wellKnownToJSON(typeName, msg) as unknown[]
        assert.deepEqual(json, [1, 'two', true])
    })

    it('deserializes from JS array', () => {
        const result = wellKnownFromJSON(typeName, [1, 'two', true])
        const values = result.values as Record<string, unknown>[]
        assert.equal(values.length, 3)
        assert.deepEqual(values[0], { numberValue: 1 })
        assert.deepEqual(values[1], { stringValue: 'two' })
        assert.deepEqual(values[2], { boolValue: true })
    })

    it('handles empty array', () => {
        assert.deepEqual(wellKnownToJSON(typeName, { values: [] }), [])
        assert.deepEqual(wellKnownFromJSON(typeName, []), { values: [] })
    })
})

describe('FieldMask', () => {
    const typeName = 'google.protobuf.FieldMask'

    it('serializes to comma-separated string', () => {
        const msg = { paths: ['user_name', 'display_name'] }
        assert.equal(wellKnownToJSON(typeName, msg), 'userName,displayName')
    })

    it('serializes nested paths', () => {
        const msg = { paths: ['field1', 'field2.nested_field'] }
        assert.equal(wellKnownToJSON(typeName, msg), 'field1,field2.nestedField')
    })

    it('serializes empty paths', () => {
        assert.equal(wellKnownToJSON(typeName, { paths: [] }), '')
    })

    it('deserializes from comma-separated string', () => {
        const result = wellKnownFromJSON(typeName, 'userName,displayName')
        assert.deepEqual(result.paths, ['user_name', 'display_name'])
    })

    it('deserializes empty string', () => {
        assert.deepEqual(wellKnownFromJSON(typeName, ''), { paths: [] })
    })
})

describe('Empty', () => {
    const typeName = 'google.protobuf.Empty'

    it('serializes to empty object', () => {
        assert.deepEqual(wellKnownToJSON(typeName, {}), {})
    })

    it('deserializes from empty object', () => {
        assert.deepEqual(wellKnownFromJSON(typeName, {}), {})
    })
})

describe('Wrapper types', () => {
    it('serializes StringValue to unwrapped scalar', () => {
        assert.equal(wellKnownToJSON('google.protobuf.StringValue', { value: 'hello' }), 'hello')
    })

    it('serializes Int32Value to unwrapped scalar', () => {
        assert.equal(wellKnownToJSON('google.protobuf.Int32Value', { value: 42 }), 42)
    })

    it('serializes BoolValue to unwrapped scalar', () => {
        assert.equal(wellKnownToJSON('google.protobuf.BoolValue', { value: true }), true)
    })

    it('serializes DoubleValue to unwrapped scalar', () => {
        assert.equal(wellKnownToJSON('google.protobuf.DoubleValue', { value: 3.14 }), 3.14)
    })

    it('serializes FloatValue to unwrapped scalar', () => {
        assert.equal(wellKnownToJSON('google.protobuf.FloatValue', { value: 1.5 }), 1.5)
    })

    it('serializes UInt32Value to unwrapped scalar', () => {
        assert.equal(wellKnownToJSON('google.protobuf.UInt32Value', { value: 100 }), 100)
    })

    it('deserializes StringValue from scalar', () => {
        assert.deepEqual(wellKnownFromJSON('google.protobuf.StringValue', 'hello'), {
            value: 'hello'
        })
    })

    it('deserializes Int32Value from scalar', () => {
        assert.deepEqual(wellKnownFromJSON('google.protobuf.Int32Value', 42), { value: 42 })
    })

    it('deserializes BoolValue from scalar', () => {
        assert.deepEqual(wellKnownFromJSON('google.protobuf.BoolValue', false), { value: false })
    })

    it('deserializes Int64Value from scalar', () => {
        assert.deepEqual(wellKnownFromJSON('google.protobuf.Int64Value', '123'), { value: '123' })
    })

    it('deserializes UInt64Value from scalar', () => {
        assert.deepEqual(wellKnownFromJSON('google.protobuf.UInt64Value', '456'), { value: '456' })
    })

    it('deserializes BytesValue from scalar', () => {
        assert.deepEqual(wellKnownFromJSON('google.protobuf.BytesValue', 'AQID'), { value: 'AQID' })
    })
})
