/**
 * Tests for protobufjs migration features:
 *  - Etapa 1: `IFoo` POJO interface emission
 *  - Etapa 2: proto3 implicit-presence warning header
 *  - Etapa 3: `--int64-as` flag (bigint | number | string)
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { generateAndImportModule } from '../../__tests__/generated-module.js'
import { generateTypeScript } from '../ts-generator.js'
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

describe('Etapa 1: IFoo POJO interface', () => {
    it('emits an `IFoo` interface alongside the class', () => {
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
        const src = generateTypeScript(proto)
        assert.match(src, /export interface IUser \{/)
        assert.match(src, /name\?: string \| null;/)
        assert.match(src, /age\?: number \| null;/)
        assert.match(src, /export class User .* implements IUser \{/)
    })

    it('uses I-prefixed peer types for nested message fields', () => {
        const proto = makeProto([
            {
                name: 'Person',
                fields: [
                    {
                        name: 'address',
                        number: 1,
                        type: 'Address',
                        typeExpr: 'Person_Address',
                        label: 'optional',
                        isMessage: true
                    }
                ],
                oneofs: [],
                nestedMessages: [
                    {
                        name: 'Address',
                        generatedName: 'Person_Address',
                        fields: [{ name: 'street', number: 1, type: 'string', label: 'optional' }],
                        oneofs: [],
                        nestedMessages: [],
                        nestedEnums: []
                    }
                ],
                nestedEnums: []
            }
        ])
        const src = generateTypeScript(proto)
        assert.match(src, /export interface IPerson \{/)
        assert.match(src, /address\?: IPerson_Address \| null;/)
        assert.match(src, /export interface IPerson_Address \{/)
        // Namespace alias for nested type
        assert.match(src, /type IAddress = IPerson_Address;/)
    })

    it('IFoo oneof field uses the discriminated union type (compatible with class)', () => {
        const proto = makeProto([
            {
                name: 'M',
                fields: [
                    {
                        name: 'a',
                        number: 1,
                        type: 'string',
                        label: 'optional'
                    },
                    {
                        name: 'b',
                        number: 2,
                        type: 'int32',
                        label: 'optional'
                    }
                ],
                oneofs: [{ name: 'choice', fields: [] }],
                nestedMessages: [],
                nestedEnums: []
            }
        ])
        // Wire up oneof.fields refs
        proto.messages[0]!.oneofs[0]!.fields = proto.messages[0]!.fields
        const src = generateTypeScript(proto)
        assert.match(src, /export interface IM \{/)
        // No more `case: string; value: unknown` placeholder
        assert.doesNotMatch(src, /choice\?: \{ case: string; value: unknown \}/)
        assert.match(src, /choice\?: M_Choice \| null;/)
    })

    it('roundtrips a message typed via IFoo at construction', async () => {
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
        const { module } = await generateAndImportModule(proto, 'iuser_pb.ts')
        const User = module['User'] as {
            new (init?: Record<string, unknown>): { name: string; age: number }
            encode(msg: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): { name: string; age: number }
        }
        // Plain POJO matching IUser shape
        const pojo = { name: 'Bob', age: 42 }
        const msg = new User(pojo)
        const buf = User.encode(msg).finish()
        const back = User.decode(buf)
        assert.equal(back.name, 'Bob')
        assert.equal(back.age, 42)
    })
})

describe('Etapa 2: implicit-presence warning header', () => {
    it('emits a warning listing implicit-presence scalar fields', () => {
        const proto = makeProto([
            {
                name: 'Foo',
                fields: [
                    { name: 'count', number: 1, type: 'int32', label: 'optional' },
                    { name: 'label', number: 2, type: 'string', label: 'optional' }
                ],
                oneofs: [],
                nestedMessages: [],
                nestedEnums: []
            }
        ])
        const src = generateTypeScript(proto)
        assert.match(src, /proto3 implicit-presence fields below decode to their zero value/)
        assert.match(src, /Foo\.count \(int32\)/)
        assert.match(src, /Foo\.label \(string\)/)
    })

    it('does NOT emit the warning when all scalar fields have explicit presence', () => {
        const proto = makeProto([
            {
                name: 'Foo',
                fields: [
                    {
                        name: 'count',
                        number: 1,
                        type: 'int32',
                        label: 'optional',
                        hasPresence: true
                    }
                ],
                oneofs: [],
                nestedMessages: [],
                nestedEnums: []
            }
        ])
        const src = generateTypeScript(proto)
        assert.doesNotMatch(src, /implicit-presence fields below decode/)
    })

    it('skips repeated, message, and map fields from the warning', () => {
        const proto = makeProto([
            {
                name: 'Foo',
                fields: [
                    { name: 'tags', number: 1, type: 'string', label: 'repeated' },
                    {
                        name: 'nested',
                        number: 2,
                        type: 'Bar',
                        label: 'optional',
                        isMessage: true
                    }
                ],
                oneofs: [],
                nestedMessages: [],
                nestedEnums: []
            }
        ])
        const src = generateTypeScript(proto)
        assert.doesNotMatch(src, /implicit-presence fields below decode/)
    })

    it('caps the warning preview to a fixed number and shows an overflow line', () => {
        const fields = Array.from({ length: 35 }, (_, i) => ({
            name: `f${i}`,
            number: i + 1,
            type: 'int32',
            label: 'optional' as const
        }))
        const proto = makeProto([
            {
                name: 'Big',
                fields,
                oneofs: [],
                nestedMessages: [],
                nestedEnums: []
            }
        ])
        const src = generateTypeScript(proto)
        assert.match(src, /\.\.\.and 5 more/)
    })
})

describe('Etapa 3: --int64-as flag', () => {
    const int64Proto = (): ProtoFile =>
        makeProto([
            {
                name: 'M',
                fields: [
                    { name: 'a', number: 1, type: 'int64', label: 'optional' },
                    { name: 'b', number: 2, type: 'uint64', label: 'optional' },
                    { name: 'c', number: 3, type: 'sint64', label: 'optional' },
                    { name: 'd', number: 4, type: 'fixed64', label: 'optional' },
                    { name: 'e', number: 5, type: 'sfixed64', label: 'optional' },
                    { name: 'list', number: 6, type: 'int64', label: 'repeated' }
                ],
                oneofs: [],
                nestedMessages: [],
                nestedEnums: []
            }
        ])

    it('default mode emits bigint type', () => {
        const src = generateTypeScript(int64Proto())
        assert.match(src, /a: bigint = 0n;/)
        assert.match(src, /a\?: bigint \| null;/) // IFoo
        assert.match(src, /list: bigint\[\] = \[\];/)
    })

    it('number mode emits number type', () => {
        const src = generateTypeScript(int64Proto(), { int64As: 'number' })
        assert.match(src, /a: number = 0;/)
        assert.match(src, /a\?: number \| null;/)
        assert.match(src, /list: number\[\] = \[\];/)
    })

    it('string mode emits string type', () => {
        const src = generateTypeScript(int64Proto(), { int64As: 'string' })
        assert.match(src, /a: string = '0';/)
        assert.match(src, /a\?: string \| null;/)
        assert.match(src, /list: string\[\] = \[\];/)
    })

    it('roundtrips int64 values as number', async () => {
        const { module } = await generateAndImportModule(int64Proto(), 'm_num_pb.ts', {
            int64As: 'number'
        })
        const M = module['M'] as {
            new (init?: Record<string, unknown>): {
                a: number
                b: number
                c: number
                d: number
                e: number
                list: number[]
            }
            encode(msg: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): {
                a: number
                b: number
                c: number
                d: number
                e: number
                list: number[]
            }
        }
        const msg = new M({ a: 100, b: 200, c: -300, d: 400, e: -500, list: [1, 2, 3] })
        const back = M.decode(M.encode(msg).finish())
        assert.equal(back.a, 100)
        assert.equal(typeof back.a, 'number')
        assert.equal(back.b, 200)
        assert.equal(back.c, -300)
        assert.equal(back.d, 400)
        assert.equal(back.e, -500)
        assert.deepEqual(back.list, [1, 2, 3])
        assert.equal(typeof back.list[0], 'number')
    })

    it('roundtrips int64 values as string', async () => {
        const { module } = await generateAndImportModule(int64Proto(), 'm_str_pb.ts', {
            int64As: 'string'
        })
        const M = module['M'] as {
            new (init?: Record<string, unknown>): {
                a: string
                list: string[]
            }
            encode(msg: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): {
                a: string
                b: string
                c: string
                list: string[]
            }
        }
        const msg = new M({ a: '100', b: '200', c: '-300', d: '400', e: '-500', list: ['1', '2'] })
        const back = M.decode(M.encode(msg).finish())
        assert.equal(back.a, '100')
        assert.equal(typeof back.a, 'string')
        assert.equal(back.b, '200')
        assert.equal(back.c, '-300')
        assert.deepEqual(back.list, ['1', '2'])
        assert.equal(typeof back.list[0], 'string')
    })

    it('roundtrips int64 values as bigint (default)', async () => {
        const { module } = await generateAndImportModule(int64Proto(), 'm_big_pb.ts')
        const M = module['M'] as {
            new (init?: Record<string, unknown>): { a: bigint; list: bigint[] }
            encode(msg: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): { a: bigint; b: bigint; list: bigint[] }
        }
        const msg = new M({ a: 100n, b: 200n, c: -300n, d: 400n, e: -500n, list: [1n, 2n] })
        const back = M.decode(M.encode(msg).finish())
        assert.equal(back.a, 100n)
        assert.equal(typeof back.a, 'bigint')
        assert.equal(back.b, 200n)
        assert.deepEqual(back.list, [1n, 2n])
    })

    it('roundtrips int64 oneof field as number', async () => {
        const proto = makeProto([
            {
                name: 'M',
                fields: [
                    {
                        name: 'chosen',
                        number: 1,
                        type: 'int64',
                        label: 'optional'
                    }
                ],
                oneofs: [{ name: 'choice', fields: [] }],
                nestedMessages: [],
                nestedEnums: []
            }
        ])
        proto.messages[0]!.oneofs[0]!.fields = proto.messages[0]!.fields
        const { module } = await generateAndImportModule(proto, 'oneof_num_pb.ts', {
            int64As: 'number'
        })
        const M = module['M'] as {
            new (init?: Record<string, unknown>): {
                choice: { case: string | undefined; value?: unknown }
            }
            encode(msg: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): {
                choice: { case: string | undefined; value?: unknown }
            }
        }
        const msg = new M({ choice: { case: 'chosen', value: 999 } })
        const back = M.decode(M.encode(msg).finish())
        assert.equal(back.choice.case, 'chosen')
        assert.equal(back.choice.value, 999)
        assert.equal(typeof back.choice.value, 'number')
    })
})
