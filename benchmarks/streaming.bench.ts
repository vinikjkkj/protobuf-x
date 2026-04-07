import { encodeDelimited } from '../packages/runtime/src/streaming/encode-stream.js'
import { Deframer } from '../packages/runtime/src/streaming/framer.js'

import { benchAsync, printResults } from './harness.js'
import { SmallMessage } from './messages.js'

// ── Streaming throughput: encode + frame + deframe + decode ──

const msg = new SmallMessage({ name: 'test', id: 1, active: true })
const msgSize = msg.toBinary().length

// Pre-build a batch of framed messages
const BATCH_SIZE = 1000
const framedBatch: Uint8Array[] = []
for (let i = 0; i < BATCH_SIZE; i++) {
    framedBatch.push(encodeDelimited(msg))
}
// Concatenate into single chunk (simulates network receive)
const totalLen = framedBatch.reduce((acc, f) => acc + f.length, 0)
const bigChunk = new Uint8Array(totalLen)
let offset = 0
for (const f of framedBatch) {
    bigChunk.set(f, offset)
    offset += f.length
}

console.log('=== Streaming Benchmarks ===')
console.log(
    `Message size: ${msgSize} bytes, batch: ${BATCH_SIZE} msgs, chunk: ${bigChunk.length} bytes`
)

async function run() {
    const results = [
        await benchAsync(
            'encode+frame 1 msg',
            async () => {
                encodeDelimited(msg)
            },
            {
                iterations: 200_000,
                bytesPerOp: msgSize
            }
        ),

        await benchAsync(
            `deframe ${BATCH_SIZE} msgs (single chunk)`,
            async () => {
                const deframer = new Deframer()
                deframer.push(bigChunk)
            },
            {
                iterations: 5_000,
                bytesPerOp: bigChunk.length
            }
        ),

        await benchAsync(
            `deframe+decode ${BATCH_SIZE} msgs`,
            async () => {
                const deframer = new Deframer()
                const raw = deframer.push(bigChunk)
                for (const r of raw) {
                    SmallMessage.decode(r)
                }
            },
            {
                iterations: 2_000,
                bytesPerOp: bigChunk.length
            }
        )
    ]

    printResults(results)
}

run()
