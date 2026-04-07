/**
 * Benchmark: generated static JS from protobuf-x vs protobufjs.
 * Both sides use code generated from the same bench.proto.
 *
 * protobuf-x: benchmarks/generated/x/benchmarks/bench_pb.js
 * protobufjs: benchmarks/generated/bench_pbjs.cjs (static-module, --force-number)
 *
 * Regenerate with:
 *   node --import tsx benchmarks/generate.ts
 */
import { createRequire } from 'node:module'

import { bench, printResults } from './harness.js'
import type { BenchResult } from './harness.js'

// ── Load generated modules ──────────────────────────────────

// protobuf-x generated JS (ESM)
const xMod = await import('./generated/x/benchmarks/bench_pb.js')
const XSmall = xMod.SmallMessage as {
    new (init?: Record<string, unknown>): Record<string, unknown>
    encode(msg: unknown, w?: unknown): { finish(): Uint8Array }
    decode(buf: Uint8Array): Record<string, unknown>
    toJSON?(msg: unknown): Record<string, unknown>
    fromJSON?(json: Record<string, unknown>): Record<string, unknown>
}
const XMedium = xMod.MediumMessage as typeof XSmall
const XAddress = xMod.Address as typeof XSmall
const XLarge = xMod.LargeMessage as typeof XSmall

// protobufjs generated JS (CJS static-module)
const require2 = createRequire(import.meta.url)
const pbMod = require2('./generated/bench_pbjs.cjs') as { bench: Record<string, unknown> }
const pb = pbMod.bench
const PbSmall = pb.SmallMessage as {
    create(obj: Record<string, unknown>): Record<string, unknown>
    encode(msg: unknown): { finish(): Uint8Array }
    decode(buf: Uint8Array): Record<string, unknown>
    verify(msg: unknown): string | null
    toObject(msg: unknown): Record<string, unknown>
    fromObject(obj: Record<string, unknown>): Record<string, unknown>
}
const PbMedium = pb.MediumMessage as typeof PbSmall
const PbLarge = pb.LargeMessage as typeof PbSmall

// ── Test data ───────────────────────────────────────────────

const xSmall = new XSmall({ name: 'Alice', id: 42, active: true })
const xMedium = new XMedium({
    name: 'Bob',
    age: 30,
    address: new XAddress({ street: '123 Main St', city: 'Springfield', zip: '62701' }),
    tags: ['admin', 'user', 'verified']
})

const longStr = 'x'.repeat(1000)
const largePayload = new Uint8Array(4096)
for (let i = 0; i < largePayload.length; i++) largePayload[i] = i & 0xff

const xLarge = new XLarge({
    title: 'Benchmark Test Message',
    description: longStr,
    content: longStr.repeat(5),
    version: 42,
    score: 3.141592653589793,
    payload: largePayload,
    metadata: Array.from({ length: 20 }, (_, i) => `meta-${i}`)
})

const pbSmall = PbSmall.create({ name: 'Alice', id: 42, active: true })
const pbMedium = PbMedium.create({
    name: 'Bob',
    age: 30,
    address: { street: '123 Main St', city: 'Springfield', zip: '62701' },
    tags: ['admin', 'user', 'verified']
})
const pbLarge = PbLarge.create({
    title: 'Benchmark Test Message',
    description: longStr,
    content: longStr.repeat(5),
    version: 42,
    score: 3.141592653589793,
    payload: largePayload,
    metadata: Array.from({ length: 20 }, (_, i) => `meta-${i}`)
})

// Pre-encode
const xSmallBuf = XSmall.encode(xSmall).finish()
const xMediumBuf = XMedium.encode(xMedium).finish()
const xLargeBuf = XLarge.encode(xLarge).finish()
const pbSmallBuf = PbSmall.encode(pbSmall).finish()
const pbMediumBuf = PbMedium.encode(pbMedium).finish()
const pbLargeBuf = PbLarge.encode(pbLarge).finish()

// ── Wire compat ─────────────────────────────────────────────

console.log('=== Generated JS: Wire Compatibility ===')
console.log(`Small  - x: ${xSmallBuf.length}B, pb: ${pbSmallBuf.length}B`)
console.log(`Medium - x: ${xMediumBuf.length}B, pb: ${pbMediumBuf.length}B`)
console.log(`Large  - x: ${xLargeBuf.length}B, pb: ${pbLargeBuf.length}B`)

// Cross-decode
const xFromPb = XSmall.decode(pbSmallBuf)
if (xFromPb.name !== 'Alice') {
    console.error('FAIL: pb->x')
    process.exit(1)
}
const pbFromX = PbSmall.decode(xSmallBuf)
if (pbFromX.name !== 'Alice') {
    console.error('FAIL: x->pb')
    process.exit(1)
}
console.log('Cross-decode: OK\n')

// ── Benchmark ───────────────────────────────────────────────

const all: Array<{ section: string; results: BenchResult[] }> = []
function section(name: string) {
    all.push({ section: name, results: [] })
}
function run(name: string, fn: () => void, iterations = 500_000) {
    all[all.length - 1]!.results.push(bench(name, fn, { iterations }))
}

// Encode — protobuf-x uses two-pass toBinary(), protobufjs uses encode().finish()
section('Encode (generated static JS)')
const xSmallEnc = xSmall as unknown as { toBinary(): Uint8Array }
const xMediumEnc = xMedium as unknown as { toBinary(): Uint8Array }
const xLargeEnc = xLarge as unknown as { toBinary(): Uint8Array }
run('x  encode small', () => {
    xSmallEnc.toBinary()
})
run('pb encode small', () => {
    PbSmall.encode(pbSmall).finish()
})
run(
    'x  encode medium',
    () => {
        xMediumEnc.toBinary()
    },
    200_000
)
run(
    'pb encode medium',
    () => {
        PbMedium.encode(pbMedium).finish()
    },
    200_000
)
run(
    'x  encode large',
    () => {
        xLargeEnc.toBinary()
    },
    50_000
)
run(
    'pb encode large',
    () => {
        PbLarge.encode(pbLarge).finish()
    },
    50_000
)

// Decode
section('Decode (generated static JS)')
run('x  decode small', () => {
    XSmall.decode(xSmallBuf)
})
run('pb decode small', () => {
    PbSmall.decode(pbSmallBuf)
})
run(
    'x  decode medium',
    () => {
        XMedium.decode(xMediumBuf)
    },
    200_000
)
run(
    'pb decode medium',
    () => {
        PbMedium.decode(pbMediumBuf)
    },
    200_000
)
run(
    'x  decode large',
    () => {
        XLarge.decode(xLargeBuf)
    },
    50_000
)
run(
    'pb decode large',
    () => {
        PbLarge.decode(pbLargeBuf)
    },
    50_000
)

// Create
section('Create')
run('x  create small', () => {
    new XSmall({ name: 'Alice', id: 42, active: true })
})
run('pb create small', () => {
    PbSmall.create({ name: 'Alice', id: 42, active: true })
})

// toJSON / toObject
section('toJSON / toObject')
if (XSmall.toJSON) {
    run('x  toJSON small', () => {
        XSmall.toJSON!(xSmall)
    })
} else {
    run('x  toJSON small', () => {
        ;(xSmall as { toJSON(): unknown }).toJSON()
    })
}
run('pb toObject small', () => {
    PbSmall.toObject(pbSmall)
})

// Verify
section('Verify')
run('pb verify small', () => {
    PbSmall.verify(pbSmall)
})

// Clone (encode+decode)
section('Clone')
run('x  clone small', () => {
    XSmall.decode(xSmallEnc.toBinary())
})
run('pb clone small', () => {
    PbSmall.decode(PbSmall.encode(pbSmall).finish())
})
run(
    'x  clone medium',
    () => {
        XMedium.decode(xMediumEnc.toBinary())
    },
    200_000
)
run(
    'pb clone medium',
    () => {
        PbMedium.decode(PbMedium.encode(pbMedium).finish())
    },
    200_000
)

// ── Print ───────────────────────────────────────────────────

let wins = 0
let total = 0

for (const { section: name, results } of all) {
    console.log(`=== ${name} ===`)
    printResults(results)
    for (let i = 0; i < results.length; i += 2) {
        if (i + 1 >= results.length) continue // odd count (verify only has pb)
        const x = results[i]!
        const pb = results[i + 1]!
        const ratio = x.opsPerSec / pb.opsPerSec
        const label = x.name.replace('x  ', '')
        console.log(`  ${label}: ${ratio.toFixed(2)}x ${ratio >= 1 ? 'FASTER' : 'SLOWER'}`)
        total++
        if (ratio >= 1) wins++
    }
    console.log()
}

console.log(`=== FINAL: ${wins}/${total} operations faster (generated static JS) ===`)
