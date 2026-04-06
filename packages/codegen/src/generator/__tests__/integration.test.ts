import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { generateAndImportModule } from '../../__tests__/generated-module.js'
import type { ProtoFile } from '../ts-generator.js'

function makeProto(messages: ProtoFile['messages']): ProtoFile {
    return {
        syntax: 'proto3',
        packageName: 'demo.v1',
        imports: [],
        options: {},
        messages,
        enums: [],
        services: [],
        extensions: []
    }
}

describe('generated code integration', () => {
    it('roundtrips a simple generated message', async () => {
        const proto = makeProto([
            {
                name: 'User',
                fields: [
                    { name: 'name', number: 1, type: 'string', label: 'optional' },
                    { name: 'age', number: 2, type: 'int32', label: 'optional' }
                ],
                oneofs: [],
                nestedMessages: [],
                nestedEnums: []
            }
        ])

        const { module } = await generateAndImportModule(proto, 'user_pb.ts')
        const User = module['User'] as {
            new (init?: Record<string, unknown>): {
                toBinary(): Uint8Array
                name: string
                age: number
            }
            decode(buf: Uint8Array): { name: string; age: number }
        }

        const msg = new User({ name: 'Alice', age: 30 })
        const decoded = User.decode(msg.toBinary())

        assert.equal(decoded.name, 'Alice')
        assert.equal(decoded.age, 30)
    })

    it('roundtrips nested message fields through the generated decoder', async () => {
        const proto = makeProto([
            {
                name: 'Person',
                fields: [
                    {
                        name: 'address',
                        number: 1,
                        type: 'Address',
                        label: 'optional',
                        isMessage: true
                    }
                ],
                oneofs: [],
                nestedMessages: [
                    {
                        name: 'Address',
                        fields: [{ name: 'city', number: 1, type: 'string', label: 'optional' }],
                        oneofs: [],
                        nestedMessages: [],
                        nestedEnums: []
                    }
                ],
                nestedEnums: []
            }
        ])

        const { module } = await generateAndImportModule(proto, 'person_pb.ts')
        const Person = module['Person'] as {
            new (init?: Record<string, unknown>): {
                toBinary(): Uint8Array
                address?: { city: string }
            }
            decode(buf: Uint8Array): { address?: { city: string } }
        }
        const Address = module['Address'] as {
            new (init?: Record<string, unknown>): {
                city: string
            }
        }

        const msg = new Person({ address: new Address({ city: 'Sao Paulo' }) })
        const decoded = Person.decode(msg.toBinary())

        assert.equal(decoded.address?.city, 'Sao Paulo')
    })

    it('roundtrips deprecated group fields through the generated encoder and decoder', async () => {
        const proto = makeProto([
            {
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
                oneofs: [],
                nestedMessages: [
                    {
                        name: 'Contact',
                        fields: [{ name: 'email', number: 2, type: 'string', label: 'optional' }],
                        oneofs: [],
                        nestedMessages: [],
                        nestedEnums: []
                    }
                ],
                nestedEnums: []
            }
        ])

        const { module } = await generateAndImportModule(proto, 'person-group_pb.ts')
        const Person = module['Person'] as {
            new (init?: Record<string, unknown>): {
                toBinary(): Uint8Array
                contact?: { email: string }
            }
            decode(buf: Uint8Array): { contact?: { email: string } }
            descriptor: { fields: Array<{ wireType: number }> }
        }
        const Contact = module['Contact'] as {
            new (init?: Record<string, unknown>): {
                email: string
            }
        }

        const msg = new Person({ contact: new Contact({ email: 'ada@example.com' }) })
        const decoded = Person.decode(msg.toBinary())

        assert.equal(Person.descriptor.fields[0]?.wireType, 3)
        assert.equal(decoded.contact?.email, 'ada@example.com')
    })

    it('preserves signed int64 values in generated roundtrips', async () => {
        const proto = makeProto([
            {
                name: 'Counter',
                fields: [{ name: 'delta', number: 1, type: 'int64', label: 'optional' }],
                oneofs: [],
                nestedMessages: [],
                nestedEnums: []
            }
        ])

        const { module } = await generateAndImportModule(proto, 'counter_pb.ts')
        const Counter = module['Counter'] as {
            new (init?: Record<string, unknown>): {
                toBinary(): Uint8Array
            }
            decode(buf: Uint8Array): { delta: bigint }
        }

        const msg = new Counter({ delta: -1n })
        const decoded = Counter.decode(msg.toBinary())

        assert.equal(decoded.delta, -1n)
    })

    it('accepts the unpacked wire form for packed repeated scalars', async () => {
        const proto = makeProto([
            {
                name: 'Numbers',
                fields: [
                    { name: 'values', number: 1, type: 'int32', label: 'repeated', packed: true }
                ],
                oneofs: [],
                nestedMessages: [],
                nestedEnums: []
            }
        ])

        const { module } = await generateAndImportModule(proto, 'numbers_pb.ts')
        const Numbers = module['Numbers'] as {
            decode(buf: Uint8Array): { values: number[] }
        }

        const decoded = Numbers.decode(Uint8Array.from([0x08, 0x96, 0x01, 0x08, 0x01]))

        assert.deepEqual(decoded.values, [150, 1])
    })

    it('roundtrips 64-bit oneof values with the generated code', async () => {
        const oneofFields = [
            { name: 'count', number: 1, type: 'int64', label: 'optional' as const },
            { name: 'name', number: 2, type: 'string', label: 'optional' as const }
        ]

        const proto = makeProto([
            {
                name: 'Result',
                fields: oneofFields,
                oneofs: [{ name: 'value', fields: oneofFields }],
                nestedMessages: [],
                nestedEnums: []
            }
        ])

        const { module } = await generateAndImportModule(proto, 'result_pb.ts')
        const Result = module['Result'] as {
            new (init?: Record<string, unknown>): {
                toBinary(): Uint8Array
            }
            decode(buf: Uint8Array): { value: { case: string; value: bigint | string } }
        }

        const msg = new Result({ value: { case: 'count', value: -2n } })
        const decoded = Result.decode(msg.toBinary())

        assert.deepEqual(decoded.value, { case: 'count', value: -2n })
    })
})
