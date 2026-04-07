import { bench, printResults } from './harness.js'
import { SmallMessage, MediumMessage, LargeMessage, Address } from './messages.js'

// ── Pre-encode test data ────────────────────────────────────

const smallBuf = new SmallMessage({ name: 'Alice', id: 42, active: true }).toBinary()

const mediumBuf = new MediumMessage({
    name: 'Bob',
    age: 30,
    address: new Address({ street: '123 Main St', city: 'Springfield', zip: '62701' }),
    tags: ['admin', 'user', 'verified']
}).toBinary()

const longStr = 'x'.repeat(1000)
const largePayload = new Uint8Array(4096)
for (let i = 0; i < largePayload.length; i++) largePayload[i] = i & 0xff

const largeBuf = new LargeMessage({
    title: 'Benchmark Test Message',
    description: longStr,
    content: longStr.repeat(5),
    version: 42,
    score: 3.141592653589793,
    payload: largePayload,
    metadata: Array.from({ length: 20 }, (_, i) => `meta-${i}`)
}).toBinary()

// ── Benchmarks ──────────────────────────────────────────────

console.log('=== Decode Benchmarks ===')
console.log(`Small buf:  ${smallBuf.length} bytes`)
console.log(`Medium buf: ${mediumBuf.length} bytes`)
console.log(`Large buf:  ${largeBuf.length} bytes`)

const results = [
    bench(
        'decode small',
        () => {
            SmallMessage.decode(smallBuf)
        },
        {
            iterations: 500_000,
            bytesPerOp: smallBuf.length
        }
    ),
    bench(
        'decode medium',
        () => {
            MediumMessage.decode(mediumBuf)
        },
        {
            iterations: 200_000,
            bytesPerOp: mediumBuf.length
        }
    ),
    bench(
        'decode large',
        () => {
            LargeMessage.decode(largeBuf)
        },
        {
            iterations: 50_000,
            bytesPerOp: largeBuf.length
        }
    )
]

printResults(results)
