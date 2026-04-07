/**
 * Fair benchmark: protobuf-x vs protobufjs — ALL operations, ALL sizes.
 * Both sides use code-generated (or equivalent) methods.
 */
import protobuf from 'protobufjs'

import { bench, printResults } from './harness.js'
import type { BenchResult } from './harness.js'
import { SmallMessage, MediumMessage, LargeMessage, Address } from './messages.js'

// ── protobufjs type definitions ─────────────────────────────

const root = new protobuf.Root()

root.add(
    new protobuf.Type('SmallMessage')
        .add(new protobuf.Field('name', 1, 'string'))
        .add(new protobuf.Field('id', 2, 'int32'))
        .add(new protobuf.Field('active', 3, 'bool'))
)
root.add(
    new protobuf.Type('Address')
        .add(new protobuf.Field('street', 1, 'string'))
        .add(new protobuf.Field('city', 2, 'string'))
        .add(new protobuf.Field('zip', 3, 'string'))
)
root.add(
    new protobuf.Type('MediumMessage')
        .add(new protobuf.Field('name', 1, 'string'))
        .add(new protobuf.Field('age', 2, 'int32'))
        .add(new protobuf.Field('address', 3, 'Address'))
        .add(new protobuf.Field('tags', 4, 'string', 'repeated'))
)
root.add(
    new protobuf.Type('LargeMessage')
        .add(new protobuf.Field('title', 1, 'string'))
        .add(new protobuf.Field('description', 2, 'string'))
        .add(new protobuf.Field('content', 3, 'string'))
        .add(new protobuf.Field('version', 4, 'int32'))
        .add(new protobuf.Field('score', 5, 'double'))
        .add(new protobuf.Field('payload', 6, 'bytes'))
        .add(new protobuf.Field('metadata', 7, 'string', 'repeated'))
)

const PbSmall = root.lookupType('SmallMessage')
const PbMedium = root.lookupType('MediumMessage')
const PbLarge = root.lookupType('LargeMessage')

// ── Test data ───────────────────────────────────────────────

const xSmall = new SmallMessage({ name: 'Alice', id: 42, active: true })
const xMedium = new MediumMessage({
    name: 'Bob',
    age: 30,
    address: new Address({ street: '123 Main St', city: 'Springfield', zip: '62701' }),
    tags: ['admin', 'user', 'verified']
})

const longStr = 'x'.repeat(1000)
const largePayload = new Uint8Array(4096)
for (let i = 0; i < largePayload.length; i++) largePayload[i] = i & 0xff

const xLarge = new LargeMessage({
    title: 'Benchmark Test Message',
    description: longStr,
    content: longStr.repeat(5),
    version: 42,
    score: 3.141592653589793,
    payload: largePayload,
    metadata: Array.from({ length: 20 }, (_, i) => `meta-${i}`)
})

const smallData = { name: 'Alice', id: 42, active: true }
const mediumData = {
    name: 'Bob',
    age: 30,
    address: { street: '123 Main St', city: 'Springfield', zip: '62701' },
    tags: ['admin', 'user', 'verified']
}
const largeData = {
    title: 'Benchmark Test Message',
    description: longStr,
    content: longStr.repeat(5),
    version: 42,
    score: 3.141592653589793,
    payload: largePayload,
    metadata: Array.from({ length: 20 }, (_, i) => `meta-${i}`)
}

const pbSmall = PbSmall.create(smallData)
const pbMedium = PbMedium.create(mediumData)
const pbLarge = PbLarge.create(largeData)

const xSmallBuf = xSmall.toBinary()
const xMediumBuf = xMedium.toBinary()
const xLargeBuf = xLarge.toBinary()
const pbSmallBuf = PbSmall.encode(pbSmall).finish()
const pbMediumBuf = PbMedium.encode(pbMedium).finish()
const pbLargeBuf = PbLarge.encode(pbLarge).finish()

const xSmallJSON = xSmall.toJSON()
const xMediumJSON = xMedium.toJSON()
const pbSmallObj = PbSmall.toObject(pbSmall)
const pbMediumObj = PbMedium.toObject(pbMedium)

// ── Wire Compatibility (both directions, all sizes) ─────────

console.log('=== Wire Compatibility ===')
console.log(`Small  - x: ${xSmallBuf.length}B, pb: ${pbSmallBuf.length}B`)
console.log(`Medium - x: ${xMediumBuf.length}B, pb: ${pbMediumBuf.length}B`)
console.log(`Large  - x: ${xLargeBuf.length}B, pb: ${pbLargeBuf.length}B`)

// protobufjs -> protobuf-x
const xFromPbSmall = SmallMessage.decode(pbSmallBuf)
if (xFromPbSmall.name !== 'Alice' || xFromPbSmall.id !== 42) {
    console.error('FAIL: pb->x small')
    process.exit(1)
}
const xFromPbMedium = MediumMessage.decode(pbMediumBuf)
if (xFromPbMedium.name !== 'Bob' || xFromPbMedium.age !== 30) {
    console.error('FAIL: pb->x medium')
    process.exit(1)
}
const xFromPbLarge = LargeMessage.decode(pbLargeBuf)
if (xFromPbLarge.title !== 'Benchmark Test Message') {
    console.error('FAIL: pb->x large')
    process.exit(1)
}

// protobuf-x -> protobufjs
const pbFromXSmall = PbSmall.decode(xSmallBuf)
if (pbFromXSmall.name !== 'Alice' || pbFromXSmall.id !== 42) {
    console.error('FAIL: x->pb small')
    process.exit(1)
}
const pbFromXMedium = PbMedium.decode(xMediumBuf)
if (pbFromXMedium.name !== 'Bob' || pbFromXMedium.age !== 30) {
    console.error('FAIL: x->pb medium')
    process.exit(1)
}
const pbFromXLarge = PbLarge.decode(xLargeBuf)
if (pbFromXLarge.title !== 'Benchmark Test Message') {
    console.error('FAIL: x->pb large')
    process.exit(1)
}

console.log('Cross-decode (both directions, all sizes): OK\n')

// ── Benchmark runner ────────────────────────────────────────

const all: Array<{ section: string; results: BenchResult[] }> = []
function section(name: string) {
    all.push({ section: name, results: [] })
}
function run(name: string, fn: () => void, iterations = 500_000) {
    all[all.length - 1]!.results.push(bench(name, fn, { iterations }))
}

// 1. Create
section('Create')
run('x  create small', () => {
    new SmallMessage({ name: 'Alice', id: 42, active: true })
})
run('pb create small', () => {
    PbSmall.create(smallData)
})
run(
    'x  create medium',
    () => {
        new MediumMessage({
            name: 'Bob',
            age: 30,
            address: new Address({ street: '123 Main St', city: 'Springfield', zip: '62701' }),
            tags: ['admin', 'user', 'verified']
        })
    },
    200_000
)
run(
    'pb create medium',
    () => {
        PbMedium.create(mediumData)
    },
    200_000
)

// 2. Encode (all sizes)
section('Encode')
run('x  encode small', () => {
    xSmall.toBinary()
})
run('pb encode small', () => {
    PbSmall.encode(pbSmall).finish()
})
run(
    'x  encode medium',
    () => {
        xMedium.toBinary()
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
        xLarge.toBinary()
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

// 3. Decode (all sizes)
section('Decode')
run('x  decode small', () => {
    SmallMessage.decode(xSmallBuf)
})
run('pb decode small', () => {
    PbSmall.decode(pbSmallBuf)
})
run(
    'x  decode medium',
    () => {
        MediumMessage.decode(xMediumBuf)
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
        LargeMessage.decode(xLargeBuf)
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

// 4. toJSON / toObject (both code-generated)
section('toJSON / toObject')
run('x  toJSON small', () => {
    xSmall.toJSON()
})
run('pb toObject small', () => {
    PbSmall.toObject(pbSmall)
})
run(
    'x  toJSON medium',
    () => {
        xMedium.toJSON()
    },
    200_000
)
run(
    'pb toObject medium',
    () => {
        PbMedium.toObject(pbMedium)
    },
    200_000
)

// 5. fromJSON / fromObject (both code-generated)
section('fromJSON / fromObject')
run('x  fromJSON small', () => {
    SmallMessage.fromJSON(xSmallJSON)
})
run('pb fromObject small', () => {
    PbSmall.fromObject(pbSmallObj)
})
run(
    'x  fromJSON medium',
    () => {
        MediumMessage.fromJSON(xMediumJSON)
    },
    200_000
)
run(
    'pb fromObject medium',
    () => {
        PbMedium.fromObject(pbMediumObj)
    },
    200_000
)

// 6. Verify (both code-generated)
section('Verify')
run('x  verify small', () => {
    SmallMessage.verify(xSmall)
})
run('pb verify small', () => {
    PbSmall.verify(pbSmall)
})
run(
    'x  verify medium',
    () => {
        MediumMessage.verify(xMedium)
    },
    200_000
)
run(
    'pb verify medium',
    () => {
        PbMedium.verify(pbMedium)
    },
    200_000
)

// 7. Clone (all sizes)
section('Clone')
run('x  clone small', () => {
    xSmall.clone()
})
run('pb clone small', () => {
    PbSmall.decode(PbSmall.encode(pbSmall).finish())
})
run(
    'x  clone medium',
    () => {
        xMedium.clone()
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

// 8. Equals — both sides must encode + byte compare (no pre-encoded shortcuts)
section('Equals')
const xSmall2 = new SmallMessage({ name: 'Alice', id: 42, active: true })
const pbSmall2 = PbSmall.create(smallData)
run('x  equals small', () => {
    xSmall.equals(xSmall2)
})
run('pb equals small', () => {
    // protobufjs has no equals — must encode both then compare bytes (same work as ours)
    const a = PbSmall.encode(pbSmall).finish()
    const b = PbSmall.encode(pbSmall2).finish()
    if (a.length !== b.length) return
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return
})

// 9. Merge — both sides do Object.assign-style merge
section('Merge')
run('x  merge small', () => {
    const m = new SmallMessage({ name: 'Alice', id: 42, active: true })
    m.merge({ name: 'Bob' })
})
run('pb merge small', () => {
    const m = PbSmall.create(smallData)
    Object.assign(m, { name: 'Bob' })
})

// ── Print results + summary ─────────────────────────────────

let totalWins = 0
let totalTests = 0

for (const { section: name, results } of all) {
    console.log(`=== ${name} ===`)
    printResults(results)
    for (let i = 0; i < results.length; i += 2) {
        const x = results[i]!
        const pb = results[i + 1]!
        const ratio = x.opsPerSec / pb.opsPerSec
        const label = x.name.replace('x  ', '')
        console.log(`  ${label}: ${ratio.toFixed(2)}x ${ratio >= 1 ? 'FASTER' : 'SLOWER'}`)
        totalTests++
        if (ratio >= 1) totalWins++
    }
    console.log()
}

console.log(`=== FINAL: ${totalWins}/${totalTests} operations faster than protobufjs ===`)
