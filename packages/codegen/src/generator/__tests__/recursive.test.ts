import { strict as assert } from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { main } from '../../cli/main.js'

// packages/codegen/src/generator/__tests__/ → 5 levels up to monorepo root
const projectRoot = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..', '..')
const fixturesDir = join(projectRoot, 'test-fixtures')
const runtimeEntry = join(projectRoot, 'packages', 'runtime', 'src', 'index.ts')

function runtimeSpec(fromDir: string): string {
    // Use file:// URL to avoid relative path resolution issues in temp dirs
    return pathToFileURL(runtimeEntry).href
}

async function silenced<T>(fn: () => Promise<T>): Promise<T> {
    const log = console.log
    const err = console.error
    console.log = () => {}
    console.error = () => {}
    try {
        return await fn()
    } finally {
        console.log = log
        console.error = err
    }
}

describe('Recursive message types', () => {
    it('generates and runs self-referencing TreeNode', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'pb-recursive-'))
        const out = join(dir, 'out')
        const protoDir = join(out, 'test-fixtures')

        const exit = await silenced(() =>
            main([
                '--target',
                'ts',
                '--out',
                out,
                '--runtime-package',
                runtimeSpec(protoDir),
                join(fixturesDir, 'recursive.proto')
            ])
        )
        assert.equal(exit, 0)

        const mod = await import(pathToFileURL(join(protoDir, 'recursive_pb.ts')).href)
        const TreeNode = mod.TreeNode as {
            new (init?: Record<string, unknown>): Record<string, unknown>
            encode(msg: unknown, w?: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): Record<string, unknown>
        }

        // Build: root -> [child1, child2 -> [grandchild]]
        const gc = new TreeNode({ label: 'gc' })
        const c1 = new TreeNode({ label: 'c1' })
        const c2 = new TreeNode({ label: 'c2', children: [gc] })
        const root = new TreeNode({ label: 'root', children: [c1, c2] })

        const buf = TreeNode.encode(root).finish()
        assert.ok(buf.length > 0)

        const decoded = TreeNode.decode(buf)
        assert.equal(decoded.label, 'root')
        assert.equal((decoded.children as unknown[]).length, 2)
        const decodedC2 = (decoded.children as Record<string, unknown>[])[1]!
        assert.equal(decodedC2.label, 'c2')
        assert.equal((decodedC2.children as unknown[]).length, 1)
        assert.equal((decodedC2.children as Record<string, unknown>[])[0]!.label, 'gc')
    })

    it('generates and runs mutually recursive Person/Company', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'pb-mutual-'))
        const out = join(dir, 'out')
        const protoDir = join(out, 'test-fixtures')

        const exit = await main([
            '--target',
            'ts',
            '--out',
            out,
            '--runtime-package',
            runtimeSpec(protoDir),
            join(fixturesDir, 'recursive.proto')
        ])
        assert.equal(exit, 0)

        const mod = await import(pathToFileURL(join(protoDir, 'recursive_pb.ts')).href)
        const Person = mod.Person as {
            new (init?: Record<string, unknown>): Record<string, unknown>
            encode(msg: unknown, w?: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): Record<string, unknown>
        }
        const Company = mod.Company as {
            new (init?: Record<string, unknown>): Record<string, unknown>
            encode(msg: unknown, w?: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): Record<string, unknown>
        }

        const alice = new Person({ name: 'Alice' })
        const corp = new Company({ name: 'Acme', employees: [alice] })
        const bob = new Person({ name: 'Bob', employer: corp })

        const buf = Person.encode(bob).finish()
        const decoded = Person.decode(buf)
        assert.equal(decoded.name, 'Bob')
        const employer = decoded.employer as Record<string, unknown>
        assert.equal(employer.name, 'Acme')
        assert.equal((employer.employees as Record<string, unknown>[])[0]!.name, 'Alice')
    })

    it('generates and runs self-referencing linked list', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'pb-list-'))
        const out = join(dir, 'out')
        const protoDir = join(out, 'test-fixtures')

        const exit = await silenced(() =>
            main([
                '--target',
                'ts',
                '--out',
                out,
                '--runtime-package',
                runtimeSpec(protoDir),
                join(fixturesDir, 'recursive.proto')
            ])
        )

        if (exit !== 0) {
            // Re-run without silencing to see the error
            await main([
                '--target',
                'ts',
                '--out',
                out,
                '--runtime-package',
                runtimeSpec(protoDir),
                join(fixturesDir, 'recursive.proto')
            ])
        }
        assert.equal(exit, 0)

        const mod = await import(pathToFileURL(join(protoDir, 'recursive_pb.ts')).href)
        const ListNode = mod.ListNode as {
            new (init?: Record<string, unknown>): Record<string, unknown>
            encode(msg: unknown, w?: unknown): { finish(): Uint8Array }
            decode(buf: Uint8Array): Record<string, unknown>
        }

        const list = new ListNode({
            value: 1,
            next: new ListNode({
                value: 2,
                next: new ListNode({ value: 3 })
            })
        })

        const buf = ListNode.encode(list).finish()
        const decoded = ListNode.decode(buf)
        assert.equal(decoded.value, 1)
        const n2 = decoded.next as Record<string, unknown>
        assert.equal(n2.value, 2)
        const n3 = n2.next as Record<string, unknown>
        assert.equal(n3.value, 3)
    })
})
