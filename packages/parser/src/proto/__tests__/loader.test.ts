import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { ProtoLoader } from '../loader.js'

describe('ProtoLoader', () => {
    it('loads transitive imports from configured import paths', () => {
        const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-loader-'))
        const sharedDir = join(dir, 'shared')
        mkdirSync(sharedDir, { recursive: true })

        writeFileSync(
            join(sharedDir, 'address.proto'),
            `
            syntax = "proto3";

            message Address {
              string city = 1;
            }
            `,
            'utf-8'
        )

        const rootPath = join(dir, 'user.proto')
        writeFileSync(
            rootPath,
            `
            syntax = "proto3";
            import "address.proto";

            message User {
              Address address = 1;
            }
            `,
            'utf-8'
        )

        const loader = new ProtoLoader({ importPaths: [sharedDir] })
        const file = loader.load(rootPath)
        const all = loader.loadAll(rootPath)

        assert.equal(file.lookupMessage('User')?.name, 'User')
        assert.equal(all.size, 2)

        const importedEntry = [...all.entries()].find(([filePath]) =>
            filePath.endsWith('address.proto')
        )
        assert.ok(importedEntry)
        assert.equal(importedEntry[1].messages[0]?.name, 'Address')
    })

    it('resolves imports relative to the importing file', () => {
        const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-loader-relative-'))
        const nestedDir = join(dir, 'common')
        mkdirSync(nestedDir, { recursive: true })

        writeFileSync(
            join(nestedDir, 'types.proto'),
            `
            syntax = "proto3";

            enum Status {
              STATUS_UNSPECIFIED = 0;
              STATUS_READY = 1;
            }
            `,
            'utf-8'
        )

        const rootPath = join(dir, 'task.proto')
        writeFileSync(
            rootPath,
            `
            syntax = "proto3";
            import "common/types.proto";

            message Task {
              Status status = 1;
            }
            `,
            'utf-8'
        )

        const loader = new ProtoLoader()
        const all = loader.loadAll(rootPath)

        assert.equal(all.size, 2)

        const importedEntry = [...all.entries()].find(([filePath]) =>
            filePath.endsWith('types.proto')
        )
        assert.ok(importedEntry)
        assert.equal(importedEntry[1].enums[0]?.name, 'Status')
    })
})
