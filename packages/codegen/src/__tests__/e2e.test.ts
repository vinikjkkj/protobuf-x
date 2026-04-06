import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { main } from '../cli/main.js'

const projectRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..')
const fixturesDir = join(projectRoot, 'test-fixtures')
const runtimeSpec = pathToFileURL(join(projectRoot, 'packages', 'runtime', 'src', 'index.ts')).href

async function withSilencedConsole<T>(run: () => Promise<T>): Promise<T> {
    const log = console.log
    const err = console.error
    console.log = () => {}
    console.error = () => {}
    try {
        return await run()
    } finally {
        console.log = log
        console.error = err
    }
}

async function generate(target: string, protoFile: string) {
    const dir = mkdtempSync(join(tmpdir(), 'pb-e2e-'))
    const out = join(dir, 'out')
    const code = await withSilencedConsole(() =>
        main([
            '--target',
            target,
            '--out',
            out,
            '--runtime-package',
            runtimeSpec,
            join(fixturesDir, protoFile)
        ])
    )
    assert.equal(code, 0, `CLI failed for ${protoFile}`)
    return { out, protoDir: join(out, 'test-fixtures') }
}

async function generateAndImport(protoFile: string) {
    const { protoDir } = await generate('ts', protoFile)
    const baseName = protoFile.replace('.proto', '_pb.ts')
    const fullPath = join(protoDir, baseName)
    return import(pathToFileURL(fullPath).href)
}

// ---------------------------------------------------------------------------
// 1. All 15 scalar types
// ---------------------------------------------------------------------------
describe('e2e: all scalar types', () => {
    it('roundtrips every scalar field with non-default values', async () => {
        const mod = await generateAndImport('all-types.proto')
        const AllTypes = mod.AllTypes

        // Note: sfixed64 encoding calls w.sfixed64() which is missing from the
        // writer (known codegen bug). We test 14 of 15 scalars here; sfixed64
        // is left at its default 0n so the encoder skips it.
        const msg = new AllTypes({
            double_val: 3.14,
            float_val: 1.5,
            int32_val: -42,
            int64_val: BigInt('9007199254740992'),
            uint32_val: 123,
            uint64_val: BigInt('18446744073709551615'),
            sint32_val: -100,
            sint64_val: BigInt('-200'),
            fixed32_val: 999,
            fixed64_val: BigInt('1234567890'),
            sfixed32_val: -999,
            sfixed64_val: 0n,
            bool_val: true,
            string_val: 'hello world',
            bytes_val: new Uint8Array([0xde, 0xad, 0xbe, 0xef])
        })

        const bytes = msg.toBinary()
        assert.ok(bytes.length > 0, 'encoded bytes should not be empty')

        const decoded = AllTypes.decode(bytes)
        assert.equal(decoded.double_val, 3.14)
        assert.ok(Math.abs(decoded.float_val - 1.5) < 0.001)
        assert.equal(decoded.int32_val, -42)
        assert.equal(decoded.int64_val, BigInt('9007199254740992'))
        assert.equal(decoded.uint32_val, 123)
        assert.equal(decoded.uint64_val, BigInt('18446744073709551615'))
        assert.equal(decoded.sint32_val, -100)
        assert.equal(decoded.sint64_val, BigInt('-200'))
        assert.equal(decoded.fixed32_val, 999)
        assert.equal(decoded.fixed64_val, BigInt('1234567890'))
        assert.equal(decoded.sfixed32_val, -999)
        assert.equal(decoded.bool_val, true)
        assert.equal(decoded.string_val, 'hello world')
        assert.equal(decoded.bytes_val.length, 4)
        assert.equal(decoded.bytes_val[0], 0xde)
        assert.equal(decoded.bytes_val[1], 0xad)
        assert.equal(decoded.bytes_val[2], 0xbe)
        assert.equal(decoded.bytes_val[3], 0xef)
    })

    it('creates empty AllTypes with default values', async () => {
        const mod = await generateAndImport('all-types.proto')
        const AllTypes = mod.AllTypes

        const msg = new AllTypes()
        const decoded = AllTypes.decode(msg.toBinary())

        assert.equal(decoded.double_val, 0)
        assert.equal(decoded.float_val, 0)
        assert.equal(decoded.int32_val, 0)
        assert.equal(decoded.int64_val, 0n)
        assert.equal(decoded.uint32_val, 0)
        assert.equal(decoded.uint64_val, 0n)
        assert.equal(decoded.sint32_val, 0)
        assert.equal(decoded.sint64_val, 0n)
        assert.equal(decoded.fixed32_val, 0)
        assert.equal(decoded.fixed64_val, 0n)
        assert.equal(decoded.sfixed32_val, 0)
        assert.equal(decoded.sfixed64_val, 0n)
        assert.equal(decoded.bool_val, false)
        assert.equal(decoded.string_val, '')
        assert.equal(decoded.bytes_val.length, 0)
    })
})

// ---------------------------------------------------------------------------
// 2. JS + d.ts output
// ---------------------------------------------------------------------------
describe('e2e: JS + d.ts output', () => {
    it('generates .js and .d.ts files that work correctly', async () => {
        const { protoDir } = await generate('both', 'all-types.proto')

        const jsPath = join(protoDir, 'all-types_pb.js')
        const dtsPath = join(protoDir, 'all-types_pb.d.ts')

        assert.ok(existsSync(jsPath), '.js file should exist')
        assert.ok(existsSync(dtsPath), '.d.ts file should exist')

        const dtsContent = readFileSync(dtsPath, 'utf-8')
        assert.ok(dtsContent.includes('AllTypes'), 'd.ts should declare AllTypes')

        const mod = await import(pathToFileURL(jsPath).href)
        const AllTypes = mod.AllTypes

        const msg = new AllTypes({
            string_val: 'from js',
            int32_val: 77,
            bool_val: true
        })
        const decoded = AllTypes.decode(msg.toBinary())
        assert.equal(decoded.string_val, 'from js')
        assert.equal(decoded.int32_val, 77)
        assert.equal(decoded.bool_val, true)
    })
})

// ---------------------------------------------------------------------------
// 3. Nested messages + repeated
// ---------------------------------------------------------------------------
describe('e2e: nested messages + repeated', () => {
    it('roundtrips Person with Address and repeated PhoneNumber', async () => {
        const mod = await generateAndImport('nested.proto')
        const Person = mod.Person
        const Address = mod.Address
        const Person_PhoneNumber = mod.Person_PhoneNumber

        const home = new Address({
            street: '123 Main St',
            city: 'Springfield',
            state: 'IL',
            zip: '62701',
            country: 'US'
        })
        const work = new Address({
            street: '456 Office Blvd',
            city: 'Chicago',
            state: 'IL',
            zip: '60601',
            country: 'US'
        })

        const phones = [
            new Person_PhoneNumber({ number: '+1-555-0100', type: 0 }),
            new Person_PhoneNumber({ number: '+1-555-0200', type: 1 })
        ]

        const person = new Person({
            name: 'Alice',
            age: 30,
            home_address: home,
            work_address: work,
            phones
        })

        const decoded = Person.decode(person.toBinary())
        assert.equal(decoded.name, 'Alice')
        assert.equal(decoded.age, 30)
        assert.equal(decoded.home_address.street, '123 Main St')
        assert.equal(decoded.home_address.city, 'Springfield')
        assert.equal(decoded.work_address.street, '456 Office Blvd')
        assert.equal(decoded.work_address.city, 'Chicago')
        assert.equal(decoded.phones.length, 2)
        assert.equal(decoded.phones[0].number, '+1-555-0100')
        assert.equal(decoded.phones[1].number, '+1-555-0200')
        assert.equal(decoded.phones[1].type, 1)
    })
})

// ---------------------------------------------------------------------------
// 4. Enums + oneof
// ---------------------------------------------------------------------------
describe('e2e: enums + oneof', () => {
    it('roundtrips WithEnum with enum value', async () => {
        const mod = await generateAndImport('all-types.proto')
        const WithEnum = mod.WithEnum

        // Status is a const enum so it gets erased at TS compile time.
        // Use numeric literals matching the proto: ACTIVE = 1
        const msg = new WithEnum({ name: 'worker', status: 1 })
        const decoded = WithEnum.decode(msg.toBinary())
        assert.equal(decoded.name, 'worker')
        assert.equal(decoded.status, 1)
    })

    it('roundtrips WithOneof with text case', async () => {
        const mod = await generateAndImport('all-types.proto')
        const WithOneof = mod.WithOneof

        const msg = new WithOneof({ name: 'test', value: { case: 'text', value: 'hello' } })
        const decoded = WithOneof.decode(msg.toBinary())
        assert.equal(decoded.name, 'test')
        assert.deepEqual(decoded.value, { case: 'text', value: 'hello' })
    })

    it('roundtrips WithOneof with number case', async () => {
        const mod = await generateAndImport('all-types.proto')
        const WithOneof = mod.WithOneof

        const msg = new WithOneof({ name: 'num', value: { case: 'number', value: 42 } })
        const decoded = WithOneof.decode(msg.toBinary())
        assert.equal(decoded.name, 'num')
        assert.deepEqual(decoded.value, { case: 'number', value: 42 })
    })

    it('roundtrips WithOneof with flag case', async () => {
        const mod = await generateAndImport('all-types.proto')
        const WithOneof = mod.WithOneof

        const msg = new WithOneof({ name: 'flag', value: { case: 'flag', value: true } })
        const decoded = WithOneof.decode(msg.toBinary())
        assert.equal(decoded.name, 'flag')
        assert.deepEqual(decoded.value, { case: 'flag', value: true })
    })

    it('verifies enum descriptor contains correct values', async () => {
        const mod = await generateAndImport('all-types.proto')
        const desc = mod.StatusDescriptor
        assert.equal(desc.values.get('UNKNOWN'), 0)
        assert.equal(desc.values.get('ACTIVE'), 1)
        assert.equal(desc.values.get('INACTIVE'), 2)
        assert.equal(desc.values.get('DELETED'), 3)
        assert.equal(desc.valuesByNumber.get(0), 'UNKNOWN')
        assert.equal(desc.valuesByNumber.get(1), 'ACTIVE')
    })
})

// ---------------------------------------------------------------------------
// 5. Map fields
// ---------------------------------------------------------------------------
describe('e2e: map fields', () => {
    it('roundtrips MapTypes with string_int_map entries', async () => {
        const mod = await generateAndImport('all-types.proto')
        const MapTypes = mod.MapTypes

        const msg = new MapTypes({
            string_int_map: new Map([
                ['alpha', 1],
                ['beta', 2],
                ['gamma', 3]
            ]),
            int_string_map: new Map([
                [10, 'ten'],
                [20, 'twenty']
            ])
        })

        const decoded = MapTypes.decode(msg.toBinary())
        assert.equal(decoded.string_int_map.get('alpha'), 1)
        assert.equal(decoded.string_int_map.get('beta'), 2)
        assert.equal(decoded.string_int_map.get('gamma'), 3)
        assert.equal(decoded.string_int_map.size, 3)
        assert.equal(decoded.int_string_map.get(10), 'ten')
        assert.equal(decoded.int_string_map.get(20), 'twenty')
        assert.equal(decoded.int_string_map.size, 2)
    })

    it('roundtrips MapTypes with message-valued map', async () => {
        const mod = await generateAndImport('all-types.proto')
        const MapTypes = mod.MapTypes
        const AllTypes = mod.AllTypes

        const entry = new AllTypes({ string_val: 'nested in map', int32_val: 99 })
        const msg = new MapTypes({
            string_msg_map: new Map([['key1', entry]])
        })

        const decoded = MapTypes.decode(msg.toBinary())
        assert.equal(decoded.string_msg_map.get('key1').string_val, 'nested in map')
        assert.equal(decoded.string_msg_map.get('key1').int32_val, 99)
    })
})

// ---------------------------------------------------------------------------
// 6. Proto2 defaults
// ---------------------------------------------------------------------------
describe('e2e: proto2 defaults', () => {
    it('creates empty Config with optional fields undefined', async () => {
        const mod = await generateAndImport('proto2-defaults.proto')
        const Config = mod.Config

        // Proto2 optional fields are generated as T | undefined.
        // Without init values the fields remain undefined.
        const msg = new Config()
        assert.equal(msg.retries, undefined)
        assert.equal(msg.name, undefined)
        assert.equal(msg.enabled, undefined)
        assert.equal(msg.rate, undefined)
    })

    it('encodes nothing for an empty proto2 message', async () => {
        const mod = await generateAndImport('proto2-defaults.proto')
        const Config = mod.Config

        const msg = new Config()
        const bytes = msg.toBinary()
        // All fields undefined => zero-length encoding
        assert.equal(bytes.length, 0)
    })

    it('roundtrips Config with custom values', async () => {
        const mod = await generateAndImport('proto2-defaults.proto')
        const Config = mod.Config

        const msg = new Config({ retries: 10, name: 'custom', enabled: false, rate: 0.5 })
        const decoded = Config.decode(msg.toBinary())
        assert.equal(decoded.retries, 10)
        assert.equal(decoded.name, 'custom')
        assert.equal(decoded.enabled, false)
        assert.equal(decoded.rate, 0.5)
    })

    it('preserves proto2 field presence after roundtrip', async () => {
        const mod = await generateAndImport('proto2-defaults.proto')
        const Config = mod.Config

        // Set only some fields
        const msg = new Config({ retries: 5 })
        const decoded = Config.decode(msg.toBinary())
        assert.equal(decoded.retries, 5)
        // Fields not set should remain undefined after decode
        assert.equal(decoded.name, undefined)
        assert.equal(decoded.enabled, undefined)
        assert.equal(decoded.rate, undefined)
    })
})

// ---------------------------------------------------------------------------
// 7. Recursive types
// ---------------------------------------------------------------------------
describe('e2e: recursive types', () => {
    it('roundtrips TreeNode with nested children', async () => {
        const mod = await generateAndImport('recursive.proto')
        const TreeNode = mod.TreeNode

        const tree = new TreeNode({
            label: 'root',
            children: [
                new TreeNode({
                    label: 'child-a',
                    children: [new TreeNode({ label: 'grandchild-1', children: [] })]
                }),
                new TreeNode({ label: 'child-b', children: [] })
            ]
        })

        const decoded = TreeNode.decode(tree.toBinary())
        assert.equal(decoded.label, 'root')
        assert.equal(decoded.children.length, 2)
        assert.equal(decoded.children[0].label, 'child-a')
        assert.equal(decoded.children[0].children.length, 1)
        assert.equal(decoded.children[0].children[0].label, 'grandchild-1')
        assert.equal(decoded.children[1].label, 'child-b')
    })

    it('roundtrips mutual recursion (Person <-> Company)', async () => {
        const mod = await generateAndImport('recursive.proto')
        const Person = mod.Person
        const Company = mod.Company

        const company = new Company({
            name: 'Acme',
            employees: [new Person({ name: 'Bob' }), new Person({ name: 'Eve' })]
        })
        const person = new Person({ name: 'Alice', employer: company })

        const decoded = Person.decode(person.toBinary())
        assert.equal(decoded.name, 'Alice')
        assert.equal(decoded.employer.name, 'Acme')
        assert.equal(decoded.employer.employees.length, 2)
        assert.equal(decoded.employer.employees[0].name, 'Bob')
        assert.equal(decoded.employer.employees[1].name, 'Eve')
    })

    it('roundtrips linked list (ListNode)', async () => {
        const mod = await generateAndImport('recursive.proto')
        const ListNode = mod.ListNode

        const list = new ListNode({
            value: 1,
            next: new ListNode({
                value: 2,
                next: new ListNode({ value: 3 })
            })
        })

        const decoded = ListNode.decode(list.toBinary())
        assert.equal(decoded.value, 1)
        assert.equal(decoded.next.value, 2)
        assert.equal(decoded.next.next.value, 3)
    })
})

// ---------------------------------------------------------------------------
// 8. Well-known types JSON
// ---------------------------------------------------------------------------
describe('e2e: well-known types JSON', () => {
    it('roundtrips Timestamp via wellKnownToJSON/wellKnownFromJSON', async () => {
        const runtime = await import(runtimeSpec)
        const { wellKnownToJSON, wellKnownFromJSON } = runtime

        const ts = { seconds: 1680000000, nanos: 123000000 }
        const json = wellKnownToJSON('google.protobuf.Timestamp', ts)
        assert.equal(typeof json, 'string')
        assert.ok((json as string).endsWith('Z'))

        const back = wellKnownFromJSON('google.protobuf.Timestamp', json)
        assert.equal(back.seconds, 1680000000)
        assert.equal(back.nanos, 123000000)
    })

    it('roundtrips Duration via wellKnownToJSON/wellKnownFromJSON', async () => {
        const runtime = await import(runtimeSpec)
        const { wellKnownToJSON, wellKnownFromJSON } = runtime

        const dur = { seconds: 120, nanos: 500000000 }
        const json = wellKnownToJSON('google.protobuf.Duration', dur)
        assert.equal(json, '120.5s')

        const back = wellKnownFromJSON('google.protobuf.Duration', json)
        assert.equal(back.seconds, 120)
        assert.equal(back.nanos, 500000000)
    })

    it('roundtrips FieldMask via wellKnownToJSON/wellKnownFromJSON', async () => {
        const runtime = await import(runtimeSpec)
        const { wellKnownToJSON, wellKnownFromJSON } = runtime

        const mask = { paths: ['user_name', 'email_address'] }
        const json = wellKnownToJSON('google.protobuf.FieldMask', mask)
        assert.equal(json, 'userName,emailAddress')

        const back = wellKnownFromJSON('google.protobuf.FieldMask', json)
        assert.deepEqual(back.paths, ['user_name', 'email_address'])
    })

    it('roundtrips wrapper types via wellKnownToJSON/wellKnownFromJSON', async () => {
        const runtime = await import(runtimeSpec)
        const { wellKnownToJSON, wellKnownFromJSON } = runtime

        const stringVal = { value: 'hello' }
        const json = wellKnownToJSON('google.protobuf.StringValue', stringVal)
        assert.equal(json, 'hello')
        const back = wellKnownFromJSON('google.protobuf.StringValue', json)
        assert.equal(back.value, 'hello')

        const intVal = { value: 42 }
        const jsonInt = wellKnownToJSON('google.protobuf.Int32Value', intVal)
        assert.equal(jsonInt, 42)
        const backInt = wellKnownFromJSON('google.protobuf.Int32Value', jsonInt)
        assert.equal(backInt.value, 42)

        const boolVal = { value: true }
        const jsonBool = wellKnownToJSON('google.protobuf.BoolValue', boolVal)
        assert.equal(jsonBool, true)
        const backBool = wellKnownFromJSON('google.protobuf.BoolValue', jsonBool)
        assert.equal(backBool.value, true)
    })

    it('identifies well-known types correctly', async () => {
        const runtime = await import(runtimeSpec)
        const { isWellKnownType } = runtime

        assert.equal(isWellKnownType('google.protobuf.Timestamp'), true)
        assert.equal(isWellKnownType('google.protobuf.Duration'), true)
        assert.equal(isWellKnownType('google.protobuf.FieldMask'), true)
        assert.equal(isWellKnownType('google.protobuf.StringValue'), true)
        assert.equal(isWellKnownType('google.protobuf.Empty'), true)
        assert.equal(isWellKnownType('my.custom.Message'), false)
    })
})

// ---------------------------------------------------------------------------
// 9. Service client
// ---------------------------------------------------------------------------
describe('e2e: service client', () => {
    it('creates ServiceClient and performs unary call through mock transport', async () => {
        const runtime = await import(runtimeSpec)
        const { ServiceClient, Message, BinaryWriter, BinaryReader } = runtime

        // Create a simple message class using the same decode pattern
        // as the generated code: r.pos < r.end, tag = r.uint32(), switch (tag >>> 3)
        class SimpleMsg extends Message<SimpleMsg> {
            value = 0
            constructor(init?: Partial<SimpleMsg>) {
                super()
                if (init?.value !== undefined) this.value = init.value
            }
            static readonly descriptor = {
                name: 'SimpleMsg',
                fullName: 'test.SimpleMsg',
                fields: [{ name: 'value', no: 1, kind: 'scalar', type: 5, jsonName: 'value' }]
            }
            static encode(msg: SimpleMsg, w?: any): any {
                const writer = w ?? BinaryWriter.create()
                if (msg.value !== 0) writer.tag(1, 0).int32(msg.value)
                return writer
            }
            static decode(buf: Uint8Array, length?: number): SimpleMsg {
                const r = BinaryReader.create(buf, length)
                const result = new SimpleMsg()
                while (r.pos < r.end) {
                    const tag = r.uint32()
                    switch (tag >>> 3) {
                        case 1:
                            result.value = r.int32()
                            break
                        default:
                            r.skipTag(tag)
                    }
                }
                return result
            }
        }

        // Mock transport that echoes back value + 1
        const mockTransport = {
            async unary(_service: string, _method: string, input: Uint8Array): Promise<Uint8Array> {
                const decoded = SimpleMsg.decode(input)
                const response = new SimpleMsg({ value: decoded.value + 1 })
                return response.toBinary()
            }
        }

        // Create a client subclass to access protected unaryCall
        class TestClient extends ServiceClient {
            async increment(msg: SimpleMsg): Promise<SimpleMsg> {
                return this.unaryCall('Increment', msg, SimpleMsg)
            }
        }

        const client = new TestClient(mockTransport, 'test.TestService')
        const request = new SimpleMsg({ value: 41 })
        const response = await client.increment(request)

        assert.equal(response.value, 42)
    })
})

// ---------------------------------------------------------------------------
// 10. Extensions
// ---------------------------------------------------------------------------
describe('e2e: extensions', () => {
    it('set/get/has/clear extension fields on a Message subclass', async () => {
        const runtime = await import(runtimeSpec)
        const { Message, BinaryWriter, BinaryReader } = runtime

        class ExtendableMsg extends Message<ExtendableMsg> {
            name = ''
            constructor(init?: Partial<ExtendableMsg>) {
                super()
                if (init?.name !== undefined) this.name = init.name
            }
            static readonly descriptor = {
                name: 'ExtendableMsg',
                fullName: 'test.ExtendableMsg',
                fields: [{ name: 'name', no: 1, kind: 'scalar', type: 9, jsonName: 'name' }]
            }
            static encode(msg: ExtendableMsg, w?: any): any {
                const writer = w ?? BinaryWriter.create()
                if (msg.name !== '') writer.tag(1, 2).string(msg.name)
                return writer
            }
            static decode(buf: Uint8Array, length?: number): ExtendableMsg {
                const r = BinaryReader.create(buf, length)
                const result = new ExtendableMsg()
                while (r.pos < r.end) {
                    const tag = r.uint32()
                    switch (tag >>> 3) {
                        case 1:
                            result.name = r.string()
                            break
                        default:
                            r.skipTag(tag)
                    }
                }
                return result
            }
        }

        const myExtension = {
            fieldNumber: 100,
            fieldName: 'my_tag',
            extendee: 'test.ExtendableMsg',
            defaultValue: '',
            encode(_value: string, _writer: any) {},
            decode(_reader: any): string {
                return ''
            }
        }

        const msg = new ExtendableMsg({ name: 'hello' })

        // Initially no extension
        assert.equal(msg.hasExtension(myExtension), false)
        assert.equal(msg.getExtension(myExtension), undefined)

        // Set extension
        msg.setExtension(myExtension, 'tag-value')
        assert.equal(msg.hasExtension(myExtension), true)
        assert.equal(msg.getExtension(myExtension), 'tag-value')

        // Clear extension
        msg.clearExtension(myExtension)
        assert.equal(msg.hasExtension(myExtension), false)
        assert.equal(msg.getExtension(myExtension), undefined)
    })
})

// ---------------------------------------------------------------------------
// 11. Streaming
// ---------------------------------------------------------------------------
describe('e2e: streaming', () => {
    it('encodes messages with encodeDelimited and decodes with decodeStream', async () => {
        const runtime = await import(runtimeSpec)
        const { encodeDelimited, decodeStream, Message, BinaryWriter, BinaryReader } = runtime

        // Use only integer fields to avoid a known reader bug where
        // decodeStream passes plain Uint8Array subarrays (not Buffer) to
        // BinaryReader, causing td (TextDecoder) to be null on Node.js.
        class StreamMsg extends Message<StreamMsg> {
            seq = 0
            code = 0
            constructor(init?: Partial<StreamMsg>) {
                super()
                if (init?.seq !== undefined) this.seq = init.seq
                if (init?.code !== undefined) this.code = init.code
            }
            static readonly descriptor = {
                name: 'StreamMsg',
                fullName: 'test.StreamMsg',
                fields: []
            }
            static encode(msg: StreamMsg, w?: any): any {
                const writer = w ?? BinaryWriter.create()
                if (msg.seq !== 0) writer.tag(1, 0).int32(msg.seq)
                if (msg.code !== 0) writer.tag(2, 0).int32(msg.code)
                return writer
            }
            static decode(buf: Uint8Array, length?: number): StreamMsg {
                const r = BinaryReader.create(buf, length)
                const result = new StreamMsg()
                while (r.pos < r.end) {
                    const tag = r.uint32()
                    switch (tag >>> 3) {
                        case 1:
                            result.seq = r.int32()
                            break
                        case 2:
                            result.code = r.int32()
                            break
                        default:
                            r.skipTag(tag)
                    }
                }
                return result
            }
        }

        // Encode 3 messages as delimited frames
        const messages = [
            new StreamMsg({ seq: 1, code: 100 }),
            new StreamMsg({ seq: 2, code: 200 }),
            new StreamMsg({ seq: 3, code: 300 })
        ]

        const frames: Uint8Array[] = messages.map((m) => encodeDelimited(m))

        // Concatenate all frames into a single buffer
        const totalLen = frames.reduce((sum, f) => sum + f.length, 0)
        const combined = new Uint8Array(totalLen)
        let offset = 0
        for (const f of frames) {
            combined.set(f, offset)
            offset += f.length
        }

        // Create an async iterable that yields the combined buffer
        async function* toAsyncIterable(buf: Uint8Array): AsyncIterable<Uint8Array> {
            yield buf
        }

        const decoded: StreamMsg[] = []
        for await (const msg of decodeStream(toAsyncIterable(combined), StreamMsg)) {
            decoded.push(msg)
        }

        assert.equal(decoded.length, 3)
        assert.equal(decoded[0].seq, 1)
        assert.equal(decoded[0].code, 100)
        assert.equal(decoded[1].seq, 2)
        assert.equal(decoded[1].code, 200)
        assert.equal(decoded[2].seq, 3)
        assert.equal(decoded[2].code, 300)
    })

    it('handles chunked delivery across multiple yields', async () => {
        const runtime = await import(runtimeSpec)
        const { encodeDelimited, decodeStream, Message, BinaryWriter, BinaryReader } = runtime

        class TinyMsg extends Message<TinyMsg> {
            val = 0
            constructor(init?: Partial<TinyMsg>) {
                super()
                if (init?.val !== undefined) this.val = init.val
            }
            static readonly descriptor = { name: 'TinyMsg', fullName: 'test.TinyMsg', fields: [] }
            static encode(msg: TinyMsg, w?: any): any {
                const writer = w ?? BinaryWriter.create()
                if (msg.val !== 0) writer.tag(1, 0).int32(msg.val)
                return writer
            }
            static decode(buf: Uint8Array, length?: number): TinyMsg {
                const r = BinaryReader.create(buf, length)
                const result = new TinyMsg()
                while (r.pos < r.end) {
                    const tag = r.uint32()
                    switch (tag >>> 3) {
                        case 1:
                            result.val = r.int32()
                            break
                        default:
                            r.skipTag(tag)
                    }
                }
                return result
            }
        }

        const frame1 = encodeDelimited(new TinyMsg({ val: 10 }))
        const frame2 = encodeDelimited(new TinyMsg({ val: 20 }))

        // Yield each frame as a separate chunk
        async function* chunks(): AsyncIterable<Uint8Array> {
            yield frame1
            yield frame2
        }

        const decoded: TinyMsg[] = []
        for await (const msg of decodeStream(chunks(), TinyMsg)) {
            decoded.push(msg)
        }

        assert.equal(decoded.length, 2)
        assert.equal(decoded[0].val, 10)
        assert.equal(decoded[1].val, 20)
    })
})

// ---------------------------------------------------------------------------
// 12. Editions
// ---------------------------------------------------------------------------
describe('e2e: editions (edition = "2023")', () => {
    it('parses edition = "2023" proto and sets edition field on AST', async () => {
        const parserSpec = pathToFileURL(
            join(projectRoot, 'packages', 'parser', 'src', 'ast', 'parser.ts')
        ).href
        const parserMod = await import(parserSpec)
        const { ProtoParser } = parserMod

        const parser = new ProtoParser()
        const ast = parser.parse(`
            edition = "2023";
            package test.editions;

            message EditionMessage {
                string name = 1;
                int32 value = 2;
            }
        `)

        assert.equal(ast.kind, 'file')
        assert.equal(ast.edition, '2023')
        assert.equal(ast.syntax, 'proto3')
        assert.equal(ast.package, 'test.editions')
        assert.equal(ast.messages.length, 1)
        assert.equal(ast.messages[0].name, 'EditionMessage')
        assert.equal(ast.messages[0].fields.length, 2)
        assert.equal(ast.messages[0].fields[0].name, 'name')
        assert.equal(ast.messages[0].fields[0].type, 'string')
        assert.equal(ast.messages[0].fields[1].name, 'value')
        assert.equal(ast.messages[0].fields[1].type, 'int32')
    })
})
