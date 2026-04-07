/**
 * Generates static JS from bench.proto using both protobuf-x and protobufjs.
 * Run: node --import tsx benchmarks/generate.ts
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { main } from '../packages/codegen/src/cli/main.js'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const genDir = join(root, 'benchmarks', 'generated')
const proto = join(root, 'benchmarks', 'bench.proto')

// Clean
if (existsSync(genDir)) rmSync(genDir, { recursive: true })
mkdirSync(genDir, { recursive: true })

// protobuf-x: generate JS with file:// runtime import
const rt = pathToFileURL(join(root, 'packages', 'runtime', 'src', 'index.ts')).href
const code = await main([
    '--target',
    'js',
    '--out',
    join(genDir, 'x'),
    '--runtime-package',
    rt,
    proto
])
if (code !== 0) {
    console.error('protobuf-x codegen failed')
    process.exit(1)
}
console.log('protobuf-x: OK')

// protobufjs: generate static CJS via pbjs CLI
execSync(
    `pbjs -t static-module -w default --force-number -o "${join(genDir, 'bench_pbjs.cjs')}" "${proto}"`,
    { stdio: 'inherit' }
)
console.log('protobufjs:  OK')
console.log('Done. Run: npm run bench -- generated-compare')
