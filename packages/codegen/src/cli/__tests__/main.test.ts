import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { importGeneratedModule, runtimePackageSpecifier } from '../../__tests__/generated-module.js'
import { main } from '../main.js'

async function withSilencedConsole<T>(run: () => Promise<T>): Promise<T> {
    const originalLog = console.log
    const originalError = console.error
    console.log = () => undefined
    console.error = () => undefined

    try {
        return await run()
    } finally {
        console.log = originalLog
        console.error = originalError
    }
}

function fixturePath(name: string): string {
    return fileURLToPath(new URL(`../../../../../test-fixtures/${name}`, import.meta.url))
}

describe('CLI main', () => {
    it('generates executable TypeScript from a .proto file', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-cli-'))
        const outDir = join(dir, 'generated')
        const protoPath = join(dir, 'user.proto')

        writeFileSync(
            protoPath,
            `
            syntax = "proto3";
            package demo.v1;

            message User {
              string name = 1;
              int32 age = 2;
            }
            `,
            'utf-8'
        )

        const exitCode = await withSilencedConsole(() =>
            main(['--out', outDir, '--runtime-package', runtimePackageSpecifier(outDir), protoPath])
        )

        assert.equal(exitCode, 0)

        const generatedPath = join(outDir, 'user_pb.ts')
        const generatedSource = readFileSync(generatedPath, 'utf-8')
        assert.match(generatedSource, /export class User extends [A-Za-z_$][\w$]*<User>/)

        const module = await importGeneratedModule(generatedPath)
        const User = module['User'] as {
            new (init?: Record<string, unknown>): { toBinary(): Uint8Array }
            decode(buf: Uint8Array): { name: string; age: number }
        }

        const msg = new User({ name: 'Alice', age: 30 })
        const decoded = User.decode(msg.toBinary())

        assert.equal(decoded.name, 'Alice')
        assert.equal(decoded.age, 30)
    })

    it('generates executable JavaScript, declarations and service descriptors', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-cli-js-'))
        const outDir = join(dir, 'generated')
        const protoPath = join(dir, 'counter.proto')

        writeFileSync(
            protoPath,
            `
            syntax = "proto3";
            package demo.v1;

            message Counter {
              int32 value = 1;
            }

            service CounterService {
              rpc Increment (Counter) returns (Counter);
              rpc Watch (Counter) returns (stream Counter);
            }
            `,
            'utf-8'
        )

        const exitCode = await withSilencedConsole(() =>
            main([
                '--target',
                'both',
                '--out',
                outDir,
                '--runtime-package',
                runtimePackageSpecifier(outDir),
                protoPath
            ])
        )

        assert.equal(exitCode, 0)

        const jsPath = join(outDir, 'counter_pb.js')
        const dtsPath = join(outDir, 'counter_pb.d.ts')
        const dtsSource = readFileSync(dtsPath, 'utf-8')
        assert.match(dtsSource, /export declare class Counter extends [A-Za-z_$][\w$]*<Counter>/)
        assert.match(dtsSource, /export declare const CounterServiceDescriptor: ServiceDescriptor/)
        assert.doesNotMatch(dtsSource, /static readonly descriptor:\s*MessageDescriptor\s*=\s*\{/)
        assert.doesNotMatch(
            dtsSource,
            /export declare const CounterServiceDescriptor:\s*ServiceDescriptor\s*=\s*\{/
        )

        const module = await importGeneratedModule(jsPath)
        const Counter = module['Counter'] as {
            new (init?: Record<string, unknown>): { toBinary(): Uint8Array }
            decode(buf: Uint8Array): { value: number }
        }
        const descriptor = module['CounterServiceDescriptor'] as {
            name: string
            methods: Array<{
                name: string
                inputType: string
                outputType: string
                clientStreaming: boolean
                serverStreaming: boolean
            }>
        }

        const msg = new Counter({ value: 41 })
        const decoded = Counter.decode(msg.toBinary())

        assert.equal(decoded.value, 41)
        assert.deepEqual(descriptor, {
            name: 'demo.v1.CounterService',
            methods: [
                {
                    name: 'Increment',
                    inputType: 'demo.v1.Counter',
                    outputType: 'demo.v1.Counter',
                    clientStreaming: false,
                    serverStreaming: false
                },
                {
                    name: 'Watch',
                    inputType: 'demo.v1.Counter',
                    outputType: 'demo.v1.Counter',
                    clientStreaming: false,
                    serverStreaming: true
                }
            ]
        })
    })

    it('generates functional JavaScript and declarations for the all-types fixture', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-cli-fixture-'))
        const outDir = join(dir, 'generated')
        const protoPath = fixturePath('all-types.proto')

        const exitCode = await withSilencedConsole(() =>
            main([
                '--target',
                'both',
                '--out',
                outDir,
                '--runtime-package',
                runtimePackageSpecifier(outDir),
                protoPath
            ])
        )

        assert.equal(exitCode, 0)

        // Output preserves directory structure relative to CWD
        const jsPath = join(outDir, 'test-fixtures', 'all-types_pb.js')
        const dtsPath = join(outDir, 'test-fixtures', 'all-types_pb.d.ts')
        const jsSource = readFileSync(jsPath, 'utf-8')
        const dtsSource = readFileSync(dtsPath, 'utf-8')

        assert.doesNotMatch(jsSource, /export type\s+/)
        assert.doesNotMatch(jsSource, /Status\.encode|Status\.decode/)
        assert.doesNotMatch(dtsSource, /^\s*[A-Za-z_$][\w$]*\??:\s*.+\s=\s.+;$/m)
        assert.doesNotMatch(dtsSource, /static readonly descriptor:\s*MessageDescriptor\s*=\s*\{/)

        const module = await importGeneratedModule(jsPath)
        const Status = module['Status'] as { ACTIVE: number }
        const WithEnum = module['WithEnum'] as {
            new (init?: Record<string, unknown>): { toBinary(): Uint8Array }
            decode(buf: Uint8Array): { status?: number }
        }
        const WithOneof = module['WithOneof'] as {
            new (init?: Record<string, unknown>): { toBinary(): Uint8Array }
            decode(buf: Uint8Array): { value: { case: string; value?: string | number | boolean } }
        }

        const enumMsg = new WithEnum({ name: 'worker', status: Status.ACTIVE })
        const enumDecoded = WithEnum.decode(enumMsg.toBinary())
        const oneofMsg = new WithOneof({ value: { case: 'text', value: 'ready' } })
        const oneofDecoded = WithOneof.decode(oneofMsg.toBinary())

        assert.equal(enumDecoded.status, Status.ACTIVE)
        assert.deepEqual(oneofDecoded.value, { case: 'text', value: 'ready' })
    })

    it('generates dependent files for imported messages and enums', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-cli-imports-'))
        const outDir = join(dir, 'generated')
        const subDir = join(dir, 'sub')
        const rootProtoPath = join(dir, 'user.proto')
        const commonProtoPath = join(subDir, 'common.proto')
        mkdirSync(subDir, { recursive: true })

        writeFileSync(
            commonProtoPath,
            `
            syntax = "proto3";
            package demo.shared;

            enum Status {
              STATUS_UNSPECIFIED = 0;
              STATUS_ACTIVE = 1;
            }

            message Profile {
              string bio = 1;
            }
            `,
            'utf-8'
        )

        writeFileSync(
            rootProtoPath,
            `
            syntax = "proto3";
            package demo.app;
            import "sub/common.proto";

            message User {
              demo.shared.Profile profile = 1;
              map<string, demo.shared.Status> tags = 2;
            }
            `,
            'utf-8'
        )

        const exitCode = await withSilencedConsole(() =>
            main([
                '--target',
                'both',
                '--out',
                outDir,
                '--runtime-package',
                runtimePackageSpecifier(outDir),
                rootProtoPath
            ])
        )

        assert.equal(exitCode, 0)

        const userModule = await importGeneratedModule(join(outDir, 'user_pb.js'))
        const commonModule = await importGeneratedModule(join(outDir, 'sub', 'common_pb.js'))

        const User = userModule['User'] as {
            new (init?: Record<string, unknown>): { toBinary(): Uint8Array }
            decode(buf: Uint8Array): { profile?: { bio: string }; tags: Map<string, number> }
        }
        const Profile = commonModule['Profile'] as {
            new (init?: Record<string, unknown>): { bio: string }
        }
        const Status = commonModule['Status'] as { STATUS_ACTIVE: number }

        const msg = new User({
            profile: new Profile({ bio: 'runner' }),
            tags: new Map([['primary', Status.STATUS_ACTIVE]])
        })
        const decoded = User.decode(msg.toBinary())

        assert.equal(decoded.profile?.bio, 'runner')
        assert.equal(decoded.tags.get('primary'), Status.STATUS_ACTIVE)
    })

    it('generates imported well-known type modules on demand', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-cli-wkt-'))
        const outDir = join(dir, 'generated')
        const protoPath = join(dir, 'event.proto')

        writeFileSync(
            protoPath,
            `
            syntax = "proto3";
            package demo.app;
            import "google/protobuf/timestamp.proto";

            message Event {
              google.protobuf.Timestamp at = 1;
            }
            `,
            'utf-8'
        )

        const exitCode = await withSilencedConsole(() =>
            main([
                '--target',
                'both',
                '--out',
                outDir,
                '--runtime-package',
                runtimePackageSpecifier(outDir),
                protoPath
            ])
        )

        assert.equal(exitCode, 0)

        const eventModule = await importGeneratedModule(join(outDir, 'event_pb.js'))
        const timestampModule = await importGeneratedModule(
            join(outDir, 'google', 'protobuf', 'timestamp_pb.js')
        )

        const Event = eventModule['Event'] as {
            new (init?: Record<string, unknown>): { toBinary(): Uint8Array }
            decode(buf: Uint8Array): { at?: { seconds?: bigint; nanos: number } }
        }
        const Timestamp = timestampModule['Timestamp'] as {
            new (init?: Record<string, unknown>): { seconds?: bigint; nanos: number }
        }

        const msg = new Event({ at: new Timestamp({ seconds: 12n, nanos: 7 }) })
        const decoded = Event.decode(msg.toBinary())

        assert.equal(decoded.at?.seconds, 12n)
        assert.equal(decoded.at?.nanos, 7)
    })

    it('enforces proto2 required fields and keeps custom json_name metadata', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-cli-proto2-'))
        const outDir = join(dir, 'generated')
        const protoPath = join(dir, 'person.proto')

        writeFileSync(
            protoPath,
            `
            syntax = "proto2";
            package demo.legacy;

            message Person {
              required string name = 1 [json_name = "fullName"];
            }
            `,
            'utf-8'
        )

        const exitCode = await withSilencedConsole(() =>
            main([
                '--target',
                'both',
                '--out',
                outDir,
                '--runtime-package',
                runtimePackageSpecifier(outDir),
                protoPath
            ])
        )

        assert.equal(exitCode, 0)

        const module = await importGeneratedModule(join(outDir, 'person_pb.js'))
        const Person = module['Person'] as {
            new (init?: Record<string, unknown>): { toBinary(): Uint8Array }
            decode(buf: Uint8Array): { name?: string }
            descriptor: {
                fields: Array<{ jsonName: string }>
            }
        }

        assert.equal(Person.descriptor.fields[0]?.jsonName, 'fullName')
        assert.throws(() => Person.decode(new Uint8Array(0)), /Missing required field: name/)

        const msg = new Person({ name: 'Ada' })
        const decoded = Person.decode(msg.toBinary())
        assert.equal(decoded.name, 'Ada')
    })

    it('generates functional proto2 group fields end to end', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-cli-group-'))
        const outDir = join(dir, 'generated')
        const protoPath = join(dir, 'person.proto')

        writeFileSync(
            protoPath,
            `
            syntax = "proto2";
            package demo.legacy;

            message Person {
              optional group Contact = 1 {
                optional string email = 2;
              }
            }
            `,
            'utf-8'
        )

        const exitCode = await withSilencedConsole(() =>
            main([
                '--target',
                'both',
                '--out',
                outDir,
                '--runtime-package',
                runtimePackageSpecifier(outDir),
                protoPath
            ])
        )

        assert.equal(exitCode, 0)

        const module = await importGeneratedModule(join(outDir, 'person_pb.js'))
        const Person = module['Person'] as {
            new (init?: Record<string, unknown>): { toBinary(): Uint8Array }
            decode(buf: Uint8Array): { contact?: { email?: string } }
            descriptor: { fields: Array<{ wireType: number }> }
        }

        const msg = new Person({ contact: { email: 'ada@example.com' } })
        const decoded = Person.decode(msg.toBinary())

        assert.equal(Person.descriptor.fields[0]?.wireType, 3)
        assert.equal(decoded.contact?.email, 'ada@example.com')
    })

    it('emits reserved and extension metadata and patches extendees across files', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-cli-extend-'))
        const outDir = join(dir, 'generated')
        const baseProtoPath = join(dir, 'base.proto')
        const extProtoPath = join(dir, 'ext.proto')

        writeFileSync(
            baseProtoPath,
            `
            syntax = "proto2";
            package demo.base;

            message Extensible {
              extensions 100 to 199;
              reserved 5 to 6;
              reserved "legacy_name";
            }

            enum Status {
              STATUS_UNKNOWN = 0;
              STATUS_READY = 1;
              reserved 3 to 4;
              reserved "STATUS_OLD";
            }
            `,
            'utf-8'
        )

        writeFileSync(
            extProtoPath,
            `
            syntax = "proto2";
            package demo.ext;
            import "base.proto";

            extend demo.base.Extensible {
              optional string extra_field = 100 [json_name = "extraText"];
            }
            `,
            'utf-8'
        )

        const exitCode = await withSilencedConsole(() =>
            main([
                '--target',
                'both',
                '--out',
                outDir,
                '--runtime-package',
                runtimePackageSpecifier(outDir),
                extProtoPath
            ])
        )

        assert.equal(exitCode, 0)

        const baseModule = await importGeneratedModule(join(outDir, 'base_pb.js'))
        const extModule = await importGeneratedModule(join(outDir, 'ext_pb.js'))

        const Extensible = baseModule['Extensible'] as {
            descriptor: {
                reservedRanges?: Array<{ from: number; to: number }>
                reservedNames?: string[]
                extensionRanges?: Array<{ from: number; to: number }>
                extensions?: Array<{ extendee: string; field: { jsonName: string; no: number } }>
            }
        }
        const StatusDescriptor = baseModule['StatusDescriptor'] as {
            reservedRanges?: Array<{ from: number; to: number }>
            reservedNames?: string[]
        }
        const ExtensibleExtensions = extModule['ExtensibleExtensions'] as Record<
            string,
            { extendee: string; field: { jsonName: string; no: number } }
        >

        assert.deepEqual(Extensible.descriptor.reservedRanges, [{ from: 5, to: 6 }])
        assert.deepEqual(Extensible.descriptor.reservedNames, ['legacy_name'])
        assert.deepEqual(Extensible.descriptor.extensionRanges, [{ from: 100, to: 199 }])
        assert.deepEqual(StatusDescriptor.reservedRanges, [{ from: 3, to: 4 }])
        assert.deepEqual(StatusDescriptor.reservedNames, ['STATUS_OLD'])
        assert.equal(ExtensibleExtensions['extra_field']?.extendee, 'demo.base.Extensible')
        assert.equal(Extensible.descriptor.extensions?.[0]?.field.no, 100)
        assert.equal(Extensible.descriptor.extensions?.[0]?.field.jsonName, 'extraText')
    })
})
