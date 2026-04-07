import { bench, printResults } from './harness.js'
import { SmallMessage, MediumMessage, LargeMessage, Address } from './messages.js'

// ── Test data ───────────────────────────────────────────────

const small = new SmallMessage({ name: 'Alice', id: 42, active: true })

const medium = new MediumMessage({
    name: 'Bob',
    age: 30,
    address: new Address({ street: '123 Main St', city: 'Springfield', zip: '62701' }),
    tags: ['admin', 'user', 'verified']
})

const longStr = 'x'.repeat(1000)
const largePayload = new Uint8Array(4096)
for (let i = 0; i < largePayload.length; i++) largePayload[i] = i & 0xff

const large = new LargeMessage({
    title: 'Benchmark Test Message',
    description: longStr,
    content: longStr.repeat(5),
    version: 42,
    score: 3.141592653589793,
    payload: largePayload,
    metadata: Array.from({ length: 20 }, (_, i) => `meta-${i}`)
})

// ── Pre-compute sizes for throughput ────────────────────────

const smallSize = small.toBinary().length
const mediumSize = medium.toBinary().length
const largeSize = large.toBinary().length

// ── Benchmarks ──────────────────────────────────────────────

console.log('=== Encode Benchmarks ===')
console.log(`Small msg:  ${smallSize} bytes`)
console.log(`Medium msg: ${mediumSize} bytes`)
console.log(`Large msg:  ${largeSize} bytes`)

const results = [
    bench(
        'encode small',
        () => {
            small.toBinary()
        },
        {
            iterations: 500_000,
            bytesPerOp: smallSize
        }
    ),
    bench(
        'encode medium',
        () => {
            medium.toBinary()
        },
        {
            iterations: 200_000,
            bytesPerOp: mediumSize
        }
    ),
    bench(
        'encode large',
        () => {
            large.toBinary()
        },
        {
            iterations: 50_000,
            bytesPerOp: largeSize
        }
    )
]

printResults(results)
