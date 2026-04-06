import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { BinaryReader } from '../../binary/reader.js'
import { BinaryWriter } from '../../binary/writer.js'
import { Message } from '../../message/base.js'
import type { MessageDescriptor } from '../../types/descriptors.js'
import { decodeStream } from '../decode-stream.js'
import { frame, Deframer } from '../framer.js'

class StreamMsg extends Message<StreamMsg> {
    v = 0

    constructor(init?: Partial<StreamMsg>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor: MessageDescriptor = {
        name: 'StreamMsg',
        fields: [],
        oneofs: [],
        nestedTypes: new Map(),
        nestedEnums: new Map()
    }

    static encode(msg: StreamMsg, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.v !== 0) {
            w.raw(new Uint8Array([0x08]))
            w.uint32(msg.v)
        }
        return w
    }

    static decode(buf: Uint8Array): StreamMsg {
        const r = BinaryReader.create(buf)
        const msg = new StreamMsg()
        while (r.hasMore()) {
            const tag = r.uint32()
            if (tag >>> 3 === 1) msg.v = r.uint32()
            else r.skip(tag & 7)
        }
        return msg
    }
}

describe('streaming advanced behavior', () => {
    it('decodes from ReadableStream sources and reports truncation', async () => {
        const frames = [new StreamMsg({ v: 10 }), new StreamMsg({ v: 20 })].map((msg) =>
            frame(msg.toBinary())
        )

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const framed of frames) controller.enqueue(framed)
                controller.close()
            }
        })

        const decoded: StreamMsg[] = []
        for await (const msg of decodeStream(stream, StreamMsg)) {
            decoded.push(msg)
        }
        assert.deepEqual(
            decoded.map((msg) => msg.v),
            [10, 20]
        )

        async function* truncated() {
            yield frame(new StreamMsg({ v: 42 }).toBinary()).subarray(0, 1)
        }

        await assert.rejects(async () => {
            for await (const msg of decodeStream(truncated(), StreamMsg)) {
                void msg
            }
        }, /incomplete message/)
    })

    it('resets deframers and handles empty or invalid partial state', () => {
        const deframer = new Deframer()
        const partial = frame(new Uint8Array([1, 2, 3])).subarray(0, 2)
        deframer.push(partial)
        assert.equal(deframer.hasPartial, true)
        deframer.reset()
        assert.equal(deframer.hasPartial, false)

        const emptyMsgs = new Deframer().push(frame(new Uint8Array(0)))
        assert.equal(emptyMsgs.length, 1)
        assert.equal(emptyMsgs[0]?.length, 0)

        const broken = new Deframer()
        const invalidVarint = new Uint8Array(12).fill(0x80)
        assert.deepEqual(broken.push(invalidVarint), [])
        assert.equal(broken.hasPartial, true)
        assert.ok(Array.isArray(broken.push(frame(new Uint8Array([1, 2, 3])))))
    })

    it('uses the ReadableStream fallback path and releases reader locks', async () => {
        const framed1 = frame(new StreamMsg({ v: 7 }).toBinary())
        const framed2 = frame(new StreamMsg({ v: 8 }).toBinary())

        const fakeStream = {
            getReader() {
                let calls = 0
                return {
                    read() {
                        calls++
                        if (calls === 1)
                            return Promise.resolve({ done: false as const, value: framed1 })
                        if (calls === 2)
                            return Promise.resolve({ done: false as const, value: framed2 })
                        return Promise.resolve({ done: true as const, value: undefined })
                    },
                    releaseLock() {}
                }
            }
        } as unknown as ReadableStream<Uint8Array>

        const decoded: StreamMsg[] = []
        for await (const msg of decodeStream(fakeStream, StreamMsg)) {
            decoded.push(msg)
        }
        assert.deepEqual(
            decoded.map((msg) => msg.v),
            [7, 8]
        )

        let lockReleased = false
        const erroringStream = {
            getReader() {
                let calls = 0
                return {
                    read() {
                        calls++
                        if (calls === 1)
                            return Promise.resolve({
                                done: false as const,
                                value: frame(new StreamMsg({ v: 1 }).toBinary())
                            })
                        return Promise.reject(new Error('stream error'))
                    },
                    releaseLock() {
                        lockReleased = true
                    }
                }
            }
        } as unknown as ReadableStream<Uint8Array>

        await assert.rejects(async () => {
            for await (const msg of decodeStream(erroringStream, StreamMsg)) {
                void msg
            }
        }, /stream error/)
        assert.equal(lockReleased, true)
    })
})
