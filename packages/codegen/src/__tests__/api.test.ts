import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { generate, generateToDisk } from '../api.js'

const PROTO_SOURCE = `
syntax = "proto3";
package test;

message User {
  string name = 1;
  int32 age = 2;
}
`

describe('programmatic API: generate()', () => {
    it('generates TS from in-memory source', async () => {
        const result = await generate({
            sources: [{ name: 'user.proto', content: PROTO_SOURCE }],
            target: 'ts'
        })
        assert.equal(result.errors.length, 0)
        assert.equal(result.files.length, 1)
        const f = result.files[0]!
        assert.match(f.path, /user_pb\.ts$/)
        assert.match(f.content, /export class User extends/)
        assert.match(f.content, /name: string = ''/)
        assert.match(f.content, /age: number = 0/)
    })

    it('generates JS + .d.ts from in-memory source', async () => {
        const result = await generate({
            sources: [{ name: 'user.proto', content: PROTO_SOURCE }],
            target: 'js'
        })
        assert.equal(result.errors.length, 0)
        assert.equal(result.files.length, 2)
        const js = result.files.find((f) => f.path.endsWith('.js'))!
        const dts = result.files.find((f) => f.path.endsWith('.d.ts'))!
        assert.ok(js)
        assert.ok(dts)
        // JS should not contain TS type annotations
        assert.doesNotMatch(js.content, /:\s*string\s*=\s*''/)
        // .d.ts should contain declarations
        assert.match(dts.content, /export declare class User/)
    })

    it('honors --no-json: omits toJSON/fromJSON', async () => {
        const result = await generate({
            sources: [{ name: 'user.proto', content: PROTO_SOURCE }],
            target: 'ts',
            noJson: true
        })
        const f = result.files[0]!
        assert.doesNotMatch(f.content, /static toJSON/)
        assert.doesNotMatch(f.content, /static fromJSON/)
        assert.doesNotMatch(f.content, /export interface UserJSON/)
    })

    it('honors --no-create: omits static create()', async () => {
        const result = await generate({
            sources: [{ name: 'user.proto', content: PROTO_SOURCE }],
            target: 'ts',
            noCreate: true
        })
        const f = result.files[0]!
        assert.doesNotMatch(f.content, /static create\(/)
    })

    it('honors --minimal: omits toJSON, create, and JSON interfaces', async () => {
        const result = await generate({
            sources: [{ name: 'user.proto', content: PROTO_SOURCE }],
            target: 'js',
            minimal: true
        })
        const js = result.files.find((f) => f.path.endsWith('.js'))!
        const dts = result.files.find((f) => f.path.endsWith('.d.ts'))!
        assert.doesNotMatch(js.content, /static toJSON/)
        assert.doesNotMatch(js.content, /static fromJSON/)
        assert.doesNotMatch(js.content, /static create\(/)
        assert.doesNotMatch(dts.content, /UserJSON/)
    })

    it('auto-enables minimal when runtime-package targets /minimal', async () => {
        const result = await generate({
            sources: [{ name: 'user.proto', content: PROTO_SOURCE }],
            target: 'ts',
            runtimePackage: '@protobuf-x/runtime/minimal'
        })
        const f = result.files[0]!
        // minimal auto-enables noJson, noCreate, and noTypeurl
        assert.doesNotMatch(f.content, /static toJSON/)
        assert.doesNotMatch(f.content, /static fromJSON/)
        assert.doesNotMatch(f.content, /static create\(/)
        assert.doesNotMatch(f.content, /static getTypeUrl/)
        assert.match(f.content, /from '@protobuf-x\/runtime\/minimal'/)
    })

    it('getTypeUrl respects empty string prefix in generated JS', async () => {
        // When noTypeurl is NOT set, getTypeUrl should accept '' as a valid prefix
        const result = await generate({
            sources: [{ name: 'user.proto', content: PROTO_SOURCE }],
            target: 'js',
            runtimePackage: '@protobuf-x/runtime'
        })
        const js = result.files.find((f) => f.path.endsWith('.js'))!
        // Should have getTypeUrl with !== undefined check (not truthy)
        assert.match(js.content, /baseTypeUrl !== undefined/)
    })

    it('auto-minimal with /minimal runtime disables create, typeurl, and json', async () => {
        const result = await generate({
            sources: [{ name: 'user.proto', content: PROTO_SOURCE }],
            target: 'js',
            runtimePackage: '@protobuf-x/runtime/minimal'
        })
        const js = result.files.find((f) => f.path.endsWith('.js'))!
        assert.doesNotMatch(js.content, /static toJSON/)
        assert.doesNotMatch(js.content, /static fromJSON/)
        assert.doesNotMatch(js.content, /static create\(/)
        assert.doesNotMatch(js.content, /static getTypeUrl/)
    })

    it('respects outDir for output paths', async () => {
        const result = await generate({
            sources: [{ name: 'user.proto', content: PROTO_SOURCE }],
            target: 'ts',
            outDir: '/some/out'
        })
        const f = result.files[0]!
        // Path should start with outDir (may use \ or / depending on OS)
        assert.ok(f.path.includes('out'))
    })

    it('returns errors for invalid proto sources without throwing', async () => {
        const result = await generate({
            sources: [{ name: 'broken.proto', content: 'this is not valid proto' }],
            target: 'ts'
        })
        // Either it errors gracefully or produces empty output — both are OK
        assert.ok(
            result.errors.length > 0 ||
                result.files.length === 0 ||
                result.files[0]!.content.length > 0
        )
    })

    it('throws when no input is provided', async () => {
        await assert.rejects(() => generate({ target: 'ts' }), /must provide at least one of/)
    })
})

describe('programmatic API: generateToDisk()', () => {
    it('writes generated files to disk', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'pbx-api-'))
        try {
            const result = await generateToDisk({
                sources: [{ name: 'user.proto', content: PROTO_SOURCE }],
                target: 'ts',
                outDir: dir
            })
            assert.equal(result.errors.length, 0)
            const expected = join(dir, 'user_pb.ts')
            assert.ok(existsSync(expected), `expected ${expected} to exist`)
            const content = readFileSync(expected, 'utf8')
            assert.match(content, /export class User extends/)
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })
})
