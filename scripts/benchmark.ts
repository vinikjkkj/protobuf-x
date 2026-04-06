import { execSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const benchDir = join(ROOT, 'benchmarks')

const benches = [
    'encode.bench.ts',
    'decode.bench.ts',
    'streaming.bench.ts',
    'compare-protobufjs.bench.ts',
    'generated-compare.bench.ts'
]
const target = process.argv[2] // optional: 'encode', 'decode', 'streaming', 'compare'

const toRun = target ? benches.filter((b) => b.startsWith(target)) : benches

if (toRun.length === 0) {
    console.error(`Unknown benchmark: ${target}`)
    console.error(`Available: ${benches.map((b) => b.replace('.bench.ts', '')).join(', ')}`)
    process.exit(1)
}

for (const b of toRun) {
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`Running: ${b}`)
    console.log('─'.repeat(60))
    execSync(`node --import tsx ${join(benchDir, b)}`, {
        stdio: 'inherit',
        cwd: ROOT
    })
}
