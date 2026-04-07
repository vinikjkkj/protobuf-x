/**
 * Measures the runtime library bundle size and enforces size budgets.
 * Run via `npm run bundle-size`.
 *
 * Uses esbuild to bundle (with tree-shaking) the way real users would, then
 * reports raw, gzip, and brotli sizes for both `minimal` and `full` entries.
 */
import { brotliCompressSync, gzipSync } from 'node:zlib'

import * as esbuild from 'esbuild'

interface SizeBudget {
    name: string
    entry: string
    /** Max gzipped size in bytes. Build fails if exceeded. */
    maxGzip: number
    /** Max brotli size in bytes. Soft warning if exceeded. */
    softBrotli?: number
}

const BUDGETS: SizeBudget[] = [
    {
        name: 'protobuf-x runtime (minimal)',
        entry: 'packages/runtime/dist/esm/minimal.js',
        maxGzip: 4500
    },
    {
        name: 'protobuf-x runtime (full)',
        entry: 'packages/runtime/dist/esm/index.js',
        maxGzip: 9000
    }
]

function fmt(n: number): string {
    return n.toLocaleString('en-US').padStart(7)
}

async function bundle(entry: string): Promise<Buffer> {
    const result = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        format: 'esm',
        minify: true,
        write: false,
        platform: 'neutral',
        target: 'es2022'
    })
    return Buffer.from(result.outputFiles[0]!.contents)
}

let exitCode = 0

console.log('Bundle size budgets')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

for (const budget of BUDGETS) {
    const buf = await bundle(budget.entry)
    const raw = buf.length
    const gz = gzipSync(buf).length
    const br = brotliCompressSync(buf).length

    const status = gz > budget.maxGzip ? '❌' : '✅'
    console.log(
        `${status} ${budget.name.padEnd(34)} raw: ${fmt(raw)} B  gz: ${fmt(gz)} B  br: ${fmt(br)} B  (limit: ${budget.maxGzip} gz)`
    )

    if (gz > budget.maxGzip) {
        console.log(
            `   ::error::${budget.name} gzip ${gz} B exceeds budget of ${budget.maxGzip} B (+${gz - budget.maxGzip})`
        )
        exitCode = 1
    }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

process.exit(exitCode)
