import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { generateMessage } from '../message-codegen.js'
import type { ProtoMessage } from '../message-codegen.js'

function makeMessage(overrides: Partial<ProtoMessage> & Pick<ProtoMessage, 'name'>): ProtoMessage {
    return {
        fields: [],
        oneofs: [],
        nestedMessages: [],
        nestedEnums: [],
        ...overrides
    }
}

describe('generateMessage', () => {
    it('should generate a simple message with scalar fields', () => {
        const msg = makeMessage({
            name: 'User',
            fields: [
                { name: 'name', number: 1, type: 'string', label: 'optional' },
                { name: 'age', number: 2, type: 'int32', label: 'optional' }
            ]
        })

        const code = generateMessage(msg)

        // Should have class declaration
        assert.match(code, /export class User extends [A-Za-z_$][\w$]*<User>/)

        // Should have field declarations with defaults
        assert.ok(code.includes("name: string = '';"))
        assert.ok(code.includes('age: number = 0;'))

        // Should have constructor
        assert.ok(code.includes('constructor(init?: Partial<User>)'))
        assert.ok(code.includes('super();'))
        assert.ok(code.includes('Object.assign(this, init)'))

        // Should have descriptor
        assert.ok(code.includes('static readonly descriptor: MessageDescriptor'))
        assert.ok(code.includes("name: 'User'"))

        // Should have static encode
        assert.ok(code.includes('static encode(msg: User, w?: BinaryWriter): BinaryWriter'))
        assert.ok(code.includes('if (w === undefined) {'))
        assert.ok(code.includes('User.sizeOf(msg)'))
        assert.ok(code.includes('User.encodeTo(msg, buf, 0)'))
        assert.ok(code.includes("msg.name !== ''"))
        assert.ok(code.includes('w.string(msg.name)'))
        assert.ok(code.includes('msg.age !== 0'))
        assert.ok(code.includes('w.int32(msg.age)'))
        assert.ok(code.includes('return w;'))

        // Should have static decode
        assert.ok(code.includes('static decode(input: Uint8Array, length?: number): User'))
        assert.ok(code.includes('return User.decodeFrom(r, r.end);'))
        assert.ok(code.includes('static decodeFrom(r: BinaryReader, end: number): User'))
        assert.ok(code.includes('const msg = new User();'))
        assert.ok(code.includes('const tag = r.uint32()'))
        assert.ok(code.includes('switch (tag >>> 3)'))
        assert.ok(code.includes('case 1: msg.name = r.string(); break;'))
        assert.ok(code.includes('case 2: msg.age = r.int32(); break;'))
        assert.ok(code.includes('default: r.skipTag(tag)'))
        assert.ok(code.includes('return msg;'))

        // Should have field descriptors
        assert.ok(code.includes('const _fd_User_name = '))
        assert.ok(code.includes('const _fd_User_age = '))
    })

    it('should generate a message with nested message field', () => {
        const msg = makeMessage({
            name: 'User',
            fields: [
                { name: 'name', number: 1, type: 'string', label: 'optional' },
                { name: 'address', number: 2, type: 'Address', label: 'optional', isMessage: true }
            ]
        })

        const code = generateMessage(msg)

        // Message field should be optional (undefined default)
        assert.ok(code.includes('address?: Address;'))

        // Encode should use fork/join for message field
        assert.ok(code.includes('Address.encode(msg.address, w)'))
        assert.ok(code.includes('w.fork()'))
        assert.ok(code.includes('w.join()'))

        // Decode should reuse reader for nested messages (zero alloc)
        assert.ok(code.includes('Address.decodeFrom(r, r.pos + _len)'))
        assert.ok(code.includes('static decodeFrom(r: BinaryReader, end: number): User {'))
        assert.ok(code.includes('Address.decode'))
    })

    it('should generate a message with repeated field', () => {
        const msg = makeMessage({
            name: 'User',
            fields: [{ name: 'tags', number: 1, type: 'string', label: 'repeated' }]
        })

        const code = generateMessage(msg)

        // Repeated field should have array type and empty array default
        assert.ok(code.includes('tags: string[] = [];'))

        // Encode should iterate
        assert.ok(code.includes('for (const v of msg.tags)'))

        // Decode should push
        assert.ok(code.includes('msg.tags.push'))
    })

    it('should generate a message with enum field', () => {
        const msg = makeMessage({
            name: 'User',
            fields: [{ name: 'status', number: 1, type: 'Status', label: 'optional', isEnum: true }]
        })

        const code = generateMessage(msg)

        // Enum field defaults to 0
        assert.ok(code.includes('status: Status = 0;'))

        // Encode uses uint32
        assert.ok(code.includes('w.uint32(msg.status as number)'))

        // Decode uses uint32
        assert.ok(code.includes('r.uint32()'))
    })

    it('should generate a message with oneof', () => {
        const oneofFields = [
            { name: 'success', number: 2, type: 'string', label: 'optional' as const },
            { name: 'error', number: 3, type: 'string', label: 'optional' as const }
        ]

        const msg = makeMessage({
            name: 'Result',
            fields: [{ name: 'id', number: 1, type: 'int32', label: 'optional' }, ...oneofFields],
            oneofs: [{ name: 'value', fields: oneofFields }]
        })

        const code = generateMessage(msg)

        // Should generate oneof case enum
        assert.ok(code.includes('Result_ValueCase'))
        assert.ok(code.includes('NOT_SET = 0'))

        // Should generate discriminated union type
        assert.ok(code.includes('Result_Value'))

        // Should have the oneof field in the class
        assert.ok(code.includes('value:'))
        assert.ok(code.includes('case: undefined'))

        // Regular field should still be present
        assert.ok(code.includes('id: number = 0;'))

        // Encode should check case
        assert.ok(code.includes("msg.value.case === 'success'"))
        assert.ok(code.includes("msg.value.case === 'error'"))

        // Decode should set discriminated union
        assert.ok(code.includes("case: 'success'"))
        assert.ok(code.includes("case: 'error'"))
    })

    it('should generate a message with nested enum', () => {
        const msg = makeMessage({
            name: 'User',
            fields: [{ name: 'role', number: 1, type: 'Role', label: 'optional', isEnum: true }],
            nestedEnums: [
                {
                    name: 'Role',
                    values: [
                        { name: 'UNKNOWN', number: 0 },
                        { name: 'ADMIN', number: 1 }
                    ]
                }
            ]
        })

        const code = generateMessage(msg)

        // Should contain the nested enum
        assert.ok(code.includes('export const enum Role'))
        assert.ok(code.includes('UNKNOWN = 0'))
        assert.ok(code.includes('ADMIN = 1'))
    })

    it('should generate a message with nested message', () => {
        const nestedMsg = makeMessage({
            name: 'Address',
            fields: [{ name: 'street', number: 1, type: 'string', label: 'optional' }]
        })

        const msg = makeMessage({
            name: 'User',
            fields: [
                { name: 'home', number: 1, type: 'Address', label: 'optional', isMessage: true }
            ],
            nestedMessages: [nestedMsg]
        })

        const code = generateMessage(msg)

        // Should contain both classes
        assert.match(code, /export class Address extends [A-Za-z_$][\w$]*<Address>/)
        assert.match(code, /export class User extends [A-Za-z_$][\w$]*<User>/)
    })

    it('should include package name in descriptor', () => {
        const msg = makeMessage({
            name: 'User',
            fields: [{ name: 'id', number: 1, type: 'int32', label: 'optional' }]
        })

        const code = generateMessage(msg, 'myapp.v1')

        assert.ok(code.includes("name: 'myapp.v1.User'"))
    })

    it('should handle bool field encode/decode', () => {
        const msg = makeMessage({
            name: 'Config',
            fields: [{ name: 'enabled', number: 1, type: 'bool', label: 'optional' }]
        })

        const code = generateMessage(msg)

        assert.ok(code.includes('enabled: boolean = false;'))
        assert.ok(code.includes('msg.enabled !== false'))
        assert.ok(code.includes('w.bool(msg.enabled)'))
        assert.ok(code.includes('r.bool()'))
    })

    it('should handle bytes field', () => {
        const msg = makeMessage({
            name: 'Blob',
            fields: [{ name: 'data', number: 1, type: 'bytes', label: 'optional' }]
        })

        const code = generateMessage(msg)

        assert.ok(code.includes('data: Uint8Array = new Uint8Array(0);'))
        assert.ok(code.includes('msg.data.length > 0'))
        assert.ok(code.includes('w.bytes(msg.data)'))
        assert.ok(code.includes('r.bytes()'))
    })

    it('should handle double field', () => {
        const msg = makeMessage({
            name: 'Point',
            fields: [
                { name: 'lat', number: 1, type: 'double', label: 'optional' },
                { name: 'lng', number: 2, type: 'double', label: 'optional' }
            ]
        })

        const code = generateMessage(msg)

        assert.ok(code.includes('lat: number = 0;'))
        assert.ok(code.includes('lng: number = 0;'))
        assert.ok(code.includes('w.double(msg.lat)'))
        assert.ok(code.includes('r.double()'))
    })

    it('should generate packed repeated int32 encode/decode', () => {
        const msg = makeMessage({
            name: 'Numbers',
            fields: [{ name: 'values', number: 1, type: 'int32', label: 'repeated', packed: true }]
        })

        const code = generateMessage(msg)

        // Encode: packed
        assert.ok(code.includes('msg.values.length > 0'))
        assert.ok(code.includes('w.fork()'))
        assert.ok(code.includes('w.join()'))

        // Decode: packed
        assert.ok(code.includes('pLen'))
        assert.ok(code.includes('pEnd'))
    })

    it('should generate repeated message field encode/decode', () => {
        const msg = makeMessage({
            name: 'UserList',
            fields: [{ name: 'users', number: 1, type: 'User', label: 'repeated', isMessage: true }]
        })

        const code = generateMessage(msg)

        assert.ok(code.includes('users: User[] = [];'))
        assert.ok(code.includes('for (const v of msg.users)'))
        assert.ok(code.includes('User.encode(v, w)'))
        assert.ok(code.includes('msg.users.push'))
        assert.ok(code.includes('User.decode'))
    })

    it('should generate deprecated group fields with start/end-group wire handling', () => {
        const msg = makeMessage({
            name: 'Person',
            fields: [
                {
                    name: 'contact',
                    number: 1,
                    type: 'Contact',
                    label: 'optional',
                    isMessage: true,
                    isGroup: true
                }
            ],
            nestedMessages: [
                makeMessage({
                    name: 'Contact',
                    fields: [{ name: 'email', number: 2, type: 'string', label: 'optional' }]
                })
            ]
        })

        const code = generateMessage(msg)

        assert.ok(code.includes('wireType: 3'))
        assert.ok(code.includes('Contact.encode(msg.contact, w); w.tag(1, 4);'))
        assert.ok(code.includes('msg.contact = Contact.decode(r.group(1));'))
    })

    it('should include reserved and extension metadata in the descriptor', () => {
        const msg = makeMessage({
            name: 'Extensible',
            reservedRanges: [{ from: 5, to: 6 }],
            reservedNames: ['legacy_name'],
            extensionRanges: [{ from: 100, to: 199 }],
            fields: [{ name: 'name', number: 1, type: 'string', label: 'optional' }]
        })

        const code = generateMessage(msg, 'demo.v1')

        assert.ok(code.includes('reservedRanges: [{ from: 5, to: 6 }],'))
        assert.ok(code.includes("reservedNames: ['legacy_name'],"))
        assert.ok(code.includes('extensionRanges: [{ from: 100, to: 199 }],'))
        assert.ok(code.includes('extensions: [],'))
    })

    it('should use proto2 default values from defaultValueExpr', () => {
        const msg = makeMessage({
            name: 'Config',
            fields: [
                {
                    name: 'retries',
                    number: 1,
                    type: 'int32',
                    label: 'optional',
                    hasPresence: true,
                    defaultValueExpr: '3'
                },
                {
                    name: 'name',
                    number: 2,
                    type: 'string',
                    label: 'optional',
                    hasPresence: true,
                    defaultValueExpr: '"unnamed"'
                },
                {
                    name: 'enabled',
                    number: 3,
                    type: 'bool',
                    label: 'optional',
                    hasPresence: true,
                    defaultValueExpr: 'true'
                },
                {
                    name: 'rate',
                    number: 4,
                    type: 'double',
                    label: 'optional',
                    hasPresence: true,
                    defaultValueExpr: '1.5'
                }
            ]
        })

        const code = generateMessage(msg, 'test.defaults')

        // Proto2 fields with hasPresence are optional (no default assignment in declaration)
        // but getDefaultValue returns the defaultValueExpr
        assert.ok(code.includes('retries?: number;'))
        assert.ok(code.includes('name?: string;'))
        assert.ok(code.includes('enabled?: boolean;'))
        assert.ok(code.includes('rate?: number;'))
    })

    it('should generate toJSON using jsonName for keys', () => {
        const msg = makeMessage({
            name: 'User',
            fields: [
                {
                    name: 'first_name',
                    number: 1,
                    type: 'string',
                    label: 'optional',
                    jsonName: 'firstName'
                },
                {
                    name: 'last_name',
                    number: 2,
                    type: 'string',
                    label: 'optional',
                    jsonName: 'lastName'
                },
                { name: 'age', number: 3, type: 'int32', label: 'optional' }
            ]
        })

        const code = generateMessage(msg)

        // toJSON should use jsonName keys
        assert.ok(code.includes("json['firstName']"))
        assert.ok(code.includes("json['lastName']"))
        assert.ok(code.includes("json['age']"))

        // fromJSON should accept both proto name and json name
        assert.ok(code.includes("json['firstName']"))
        assert.ok(code.includes("json['first_name']"))
        assert.ok(code.includes("json['lastName']"))
        assert.ok(code.includes("json['last_name']"))
    })

    it('should generate fromJSON that accepts both proto and json field names', () => {
        const msg = makeMessage({
            name: 'Item',
            fields: [
                {
                    name: 'display_name',
                    number: 1,
                    type: 'string',
                    label: 'optional',
                    jsonName: 'displayName'
                }
            ]
        })

        const code = generateMessage(msg)

        // Static fromJSON should be generated
        assert.ok(code.includes('static fromJSON(json: ItemJSON): Item'))
        assert.ok(code.includes("json['displayName']"))
        assert.ok(code.includes("json['display_name']"))
    })

    it('should generate toJSON with default camelCase when jsonName is not set', () => {
        const msg = makeMessage({
            name: 'Msg',
            fields: [{ name: 'field_one', number: 1, type: 'string', label: 'optional' }]
        })

        const code = generateMessage(msg)

        // Should use camelCase derived from snake_case
        assert.ok(code.includes("json['fieldOne']"))
    })
})
