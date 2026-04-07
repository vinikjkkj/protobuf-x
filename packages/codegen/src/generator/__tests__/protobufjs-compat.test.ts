/**
 * Tests for protobufjs migration features:
 *  - `IFoo` POJO interface emission
 *  - proto3 implicit-presence warning header
 *  - `--int64-as` flag (bigint | number | string)
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    generateAndImportJsModule,
    generateAndImportModule
} from '../../__tests__/generated-module.js'
import { generateJavaScript } from '../js-generator.js'
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

describe('IFoo POJO interface', () => {
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

describe('implicit-presence warning header', () => {
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

describe('--int64-as flag', () => {
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

describe('JS target: TS-only syntax stripping (regression)', () => {
    it('strips `implements IFoo` from class declaration in .js output', () => {
        const proto = makeProto([
            {
                name: 'User',
                fields: [{ name: 'name', number: 1, type: 'string', label: 'optional' }],
                oneofs: [],
                nestedMessages: [],
                nestedEnums: []
            }
        ])
        const { js, dts } = generateJavaScript(proto)
        // .js must NOT contain `implements IUser` (TS-only syntax)
        assert.doesNotMatch(js, /implements\s+IUser/)
        assert.match(js, /export class User extends \w+\s*\{/)
        // .d.ts retains the `implements` clause
        assert.match(dts, /class User extends \w+<User>\s+implements IUser \{/)
    })

    it('strips `implements` from nested message classes too', () => {
        const proto = makeProto([
            {
                name: 'Outer',
                fields: [],
                oneofs: [],
                nestedMessages: [
                    {
                        name: 'Inner',
                        generatedName: 'Outer_Inner',
                        fields: [{ name: 'x', number: 1, type: 'int32', label: 'optional' }],
                        oneofs: [],
                        nestedMessages: [],
                        nestedEnums: []
                    }
                ],
                nestedEnums: []
            }
        ])
        const { js } = generateJavaScript(proto)
        assert.doesNotMatch(js, /implements\s+I/)
    })

    it('generated .js loads without errors via dynamic import', async () => {
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
        // Real ESM import — fails with SyntaxError if any TS-only syntax leaks
        // through, fails with ReferenceError if any symbol isn't properly
        // exported, and the import link itself walks every top-level statement.
        const { module } = await generateAndImportJsModule(proto, 'js_import_user_pb.js')
        const User = module['User'] as {
            new (init?: Record<string, unknown>): { name: string; age: number }
            encode(msg: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): { name: string; age: number }
        }
        assert.equal(typeof User, 'function')
        // Round-trip to confirm the imported class actually works at runtime
        const back = User.decode(User.encode(new User({ name: 'Alice', age: 30 })).finish())
        assert.equal(back.name, 'Alice')
        assert.equal(back.age, 30)
    })

    it('generated .js loads without errors for a message with int64 + nested + oneof', async () => {
        const proto = makeProto([
            {
                name: 'M',
                fields: [
                    { name: 'count', number: 1, type: 'int64', label: 'optional' },
                    {
                        name: 'inner',
                        number: 2,
                        type: 'Inner',
                        typeExpr: 'M_Inner',
                        label: 'optional',
                        isMessage: true
                    },
                    {
                        name: 'chosen',
                        number: 3,
                        type: 'string',
                        label: 'optional'
                    }
                ],
                oneofs: [{ name: 'choice', fields: [] }],
                nestedMessages: [
                    {
                        name: 'Inner',
                        generatedName: 'M_Inner',
                        fields: [{ name: 'x', number: 1, type: 'int32', label: 'optional' }],
                        oneofs: [],
                        nestedMessages: [],
                        nestedEnums: []
                    }
                ],
                nestedEnums: []
            }
        ])
        // Wire up the oneof field reference
        proto.messages[0]!.oneofs[0]!.fields = [proto.messages[0]!.fields[2]!]
        const { module } = await generateAndImportJsModule(proto, 'js_import_complex_pb.js')
        assert.equal(typeof module['M'], 'function')
        assert.equal(typeof module['M_Inner'], 'function')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Deep nested namespace propagation (3+ levels) — fix for the bug where
// `Parent.Child.GrandChild` resolved as a value but `Parent.Child.GrandChild`
// failed as a type because `export type Child = Parent_Child` is only a type
// alias and does NOT carry along the merged namespace.
// ─────────────────────────────────────────────────────────────────────────────

describe('Deep nested namespace propagation', () => {
    function makeDeepProto(): ProtoFile {
        return makeProto([
            {
                name: 'SessionStructure',
                fields: [
                    {
                        name: 'chain',
                        number: 1,
                        type: 'Chain',
                        typeExpr: 'SessionStructure_Chain',
                        label: 'optional',
                        isMessage: true
                    }
                ],
                oneofs: [],
                nestedMessages: [
                    {
                        name: 'Chain',
                        generatedName: 'SessionStructure_Chain',
                        fields: [
                            {
                                name: 'key',
                                number: 1,
                                type: 'MessageKey',
                                typeExpr: 'SessionStructure_Chain_MessageKey',
                                label: 'optional',
                                isMessage: true
                            }
                        ],
                        oneofs: [],
                        nestedMessages: [
                            {
                                name: 'MessageKey',
                                generatedName: 'SessionStructure_Chain_MessageKey',
                                fields: [
                                    {
                                        name: 'index',
                                        number: 1,
                                        type: 'int32',
                                        label: 'optional'
                                    }
                                ],
                                oneofs: [],
                                nestedMessages: [],
                                nestedEnums: []
                            }
                        ],
                        nestedEnums: []
                    }
                ],
                nestedEnums: []
            }
        ])
    }

    it('uses `export import` for nested types that have their own children', () => {
        const src = generateTypeScript(makeDeepProto())
        // Middle level (Chain has children) — must use export import so its
        // namespace propagates upward.
        assert.match(
            src,
            /export namespace SessionStructure \{[^}]*export import Chain = SessionStructure_Chain/s
        )
    })

    it('uses const+type for leaf nested types (no merged namespace to propagate)', () => {
        const src = generateTypeScript(makeDeepProto())
        // Leaf level (MessageKey has no children) — must NOT use export import,
        // because the leaf class has no namespace component and TS would error
        // with "only refers to a type, but is being used as a namespace".
        assert.match(
            src,
            /export namespace SessionStructure_Chain \{[^}]*export const MessageKey = SessionStructure_Chain_MessageKey/s
        )
        assert.doesNotMatch(
            src,
            /export namespace SessionStructure_Chain \{[^}]*export import MessageKey/s
        )
    })

    it('3-level deep type access compiles when imported by a consumer', async () => {
        // Generate, write to disk, and import to verify the namespace alias
        // chain actually resolves at compile time. The earlier `export type`
        // form would let the *value* path work but break type-only access at
        // 3 levels deep, which a static-only test can't catch.
        const { module } = await generateAndImportModule(makeDeepProto(), 'deep_pb.ts')
        const SessionStructure = module['SessionStructure'] as {
            new (init?: Record<string, unknown>): unknown
            Chain: {
                new (init?: Record<string, unknown>): unknown
                MessageKey: { new (init?: Record<string, unknown>): { index: number } }
            }
        }
        assert.equal(typeof SessionStructure.Chain, 'function')
        assert.equal(typeof SessionStructure.Chain.MessageKey, 'function')
        const k = new SessionStructure.Chain.MessageKey({ index: 42 })
        assert.equal(k.index, 42)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Class field types using IFoo peer (POJO-friendly fields). Class field decls
// reference the I-prefixed peer interface for message-typed fields, so plain
// object literals satisfy `typeof Foo.prototype.bar` without forcing
// `new Bar(...)` at every boundary.
// ─────────────────────────────────────────────────────────────────────────────

describe('Class field types use IFoo peer', () => {
    function makeNestedProto(): ProtoFile {
        return makeProto([
            {
                name: 'User',
                fields: [
                    {
                        name: 'profile',
                        number: 1,
                        type: 'Profile',
                        typeExpr: 'User_Profile',
                        label: 'optional',
                        isMessage: true
                    },
                    {
                        name: 'friends',
                        number: 2,
                        type: 'User',
                        label: 'repeated',
                        isMessage: true
                    },
                    { name: 'name', number: 3, type: 'string', label: 'optional' }
                ],
                oneofs: [],
                nestedMessages: [
                    {
                        name: 'Profile',
                        generatedName: 'User_Profile',
                        fields: [{ name: 'bio', number: 1, type: 'string', label: 'optional' }],
                        oneofs: [],
                        nestedMessages: [],
                        nestedEnums: []
                    }
                ],
                nestedEnums: []
            }
        ])
    }

    it('singular message field uses I-peer type', () => {
        const src = generateTypeScript(makeNestedProto())
        // Class field declaration references the I-peer, not the strict class.
        assert.match(src, /export class User .*\{[\s\S]*?profile\?: IUser_Profile;/)
    })

    it('repeated message field uses I-peer element type', () => {
        const src = generateTypeScript(makeNestedProto())
        assert.match(src, /export class User .*\{[\s\S]*?friends: IUser\[\] = \[\];/)
    })

    it('scalar field types are unchanged (no IFoo widening for primitives)', () => {
        const src = generateTypeScript(makeNestedProto())
        // Scalar fields stay as the bare scalar type — no `IString`, no nullable.
        assert.match(src, /export class User .*\{[\s\S]*?name: string = '';/)
    })

    it('static encode/sizeOf/encodeTo accept the I-peer interface as parameter', () => {
        const src = generateTypeScript(makeNestedProto())
        assert.match(src, /static encode\(msg: IUser, w\?: BinaryWriter\): BinaryWriter/)
        assert.match(src, /static sizeOf\(msg: IUser\): number/)
        assert.match(src, /static encodeTo\(msg: IUser, buf: Uint8Array, p: number\): number/)
    })

    it('decode still returns the strict class type (instance)', () => {
        const src = generateTypeScript(makeNestedProto())
        // decode returns a real class instance (not the I-peer), preserving
        // narrow downstream typing for the consumer.
        assert.match(src, /static decode\(input: Uint8Array, length\?: number\): User/)
        assert.match(src, /static decodeFrom\(r: BinaryReader, end: number\): User/)
    })

    it('encode body uses loose `!= null` for message fields', () => {
        const src = generateTypeScript(makeNestedProto())
        // The skip-default check tolerates explicit `null` from POJO inputs.
        assert.match(src, /msg\.profile != null/)
    })

    it('encode body uses loose `!= null && !== ""` for scalar fields', () => {
        const src = generateTypeScript(makeNestedProto())
        assert.match(src, /msg\.name != null && msg\.name !== ''/)
    })

    it('repeated field iteration handles null POJO input', () => {
        const src = generateTypeScript(makeNestedProto())
        assert.match(src, /for \(const v of \(msg\.friends \?\? \[\]\)\)/)
    })

    it('end-to-end: POJO literal can be passed to encode without instantiation', async () => {
        const { module } = await generateAndImportModule(makeNestedProto(), 'pojo_encode_pb.ts')
        const User = module['User'] as {
            new (init?: Record<string, unknown>): unknown
            encode(msg: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): { name: string; profile?: { bio: string } }
        }
        // Pure POJO — no `new User()` anywhere
        const buf = User.encode({
            name: 'Alice',
            profile: { bio: 'hello' },
            friends: [{ name: 'Bob' }]
        }).finish()
        const back = User.decode(buf)
        assert.equal(back.name, 'Alice')
        assert.equal(back.profile?.bio, 'hello')
    })

    it('end-to-end: explicit `null` field is treated as missing', async () => {
        const { module } = await generateAndImportModule(makeNestedProto(), 'null_field_pb.ts')
        const User = module['User'] as {
            encode(msg: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): { name: string; profile?: { bio: string } }
        }
        // Explicit null on a message field — must NOT crash, must be skipped.
        const buf = User.encode({ name: '', profile: null, friends: null }).finish()
        // All fields are at-default → empty wire output
        assert.equal(buf.length, 0)
        const back = User.decode(buf)
        assert.equal(back.name, '')
        assert.equal(back.profile, undefined)
    })
})
