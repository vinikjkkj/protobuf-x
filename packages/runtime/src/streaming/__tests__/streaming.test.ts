import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { BinaryReader } from '../../binary/reader.js'
import { BinaryWriter } from '../../binary/writer.js'
import { Message } from '../../message/base.js'
import type { MessageDescriptor } from '../../types/descriptors.js'
import { decodeStream } from '../decode-stream.js'
import { encodeStream, encodeDelimited } from '../encode-stream.js'
import { frame, Deframer } from '../framer.js'

// Simple test message for streaming tests
class NumMsg extends Message<NumMsg> {
    value = 0

    constructor(init?: Partial<NumMsg>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor: MessageDescriptor = {
        name: 'NumMsg',
        fields: [],
        oneofs: [],
        nestedTypes: new Map(),
        nestedEnums: new Map()
    }

    static encode(msg: NumMsg, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.value !== 0) {
            w.raw(new Uint8Array([0x08]))
            w.uint32(msg.value)
        }
        return w
    }

    static decode(buf: Uint8Array): NumMsg {
        const r = BinaryReader.create(buf)
        const msg = new NumMsg()
        while (r.hasMore()) {
            const tag = r.uint32()
            if (tag >>> 3 === 1) msg.value = r.uint32()
            else r.skip(tag & 7)
        }
        return msg
    }
}

describe('frame / Deframer', () => {
    it('frames a message with length prefix', () => {
        const data = new Uint8Array([1, 2, 3])
        const framed = frame(data)
        assert.equal(framed[0], 3) // length = 3
        assert.deepEqual([...framed.subarray(1)], [1, 2, 3])
    })

    it('deframes a single complete message', () => {
        const data = new Uint8Array([1, 2, 3])
        const framed = frame(data)
        const deframer = new Deframer()
        const messages = deframer.push(framed)
        assert.equal(messages.length, 1)
        assert.deepEqual([...messages[0]!], [1, 2, 3])
    })

    it('deframes multiple messages in one chunk', () => {
        const f1 = frame(new Uint8Array([0x0a]))
        const f2 = frame(new Uint8Array([0x0b, 0x0c]))
        const combined = new Uint8Array(f1.length + f2.length)
        combined.set(f1, 0)
        combined.set(f2, f1.length)

        const deframer = new Deframer()
        const messages = deframer.push(combined)
        assert.equal(messages.length, 2)
        assert.deepEqual([...messages[0]!], [0x0a])
        assert.deepEqual([...messages[1]!], [0x0b, 0x0c])
    })

    it('handles message split across chunks', () => {
        const data = new Uint8Array([1, 2, 3, 4, 5])
        const framed = frame(data)
        const deframer = new Deframer()

        // Split in the middle
        const part1 = framed.subarray(0, 3)
        const part2 = framed.subarray(3)

        const msgs1 = deframer.push(part1)
        assert.equal(msgs1.length, 0) // incomplete

        const msgs2 = deframer.push(part2)
        assert.equal(msgs2.length, 1)
        assert.deepEqual([...msgs2[0]!], [1, 2, 3, 4, 5])
    })

    it('hasPartial tracks state correctly', () => {
        const deframer = new Deframer()
        assert.equal(deframer.hasPartial, false)

        const data = frame(new Uint8Array([1, 2]))
        deframer.push(data.subarray(0, 1)) // partial
        assert.equal(deframer.hasPartial, true)

        deframer.push(data.subarray(1)) // complete
        assert.equal(deframer.hasPartial, false)
    })
})

describe('decodeStream', () => {
    it('decodes messages from async iterable', async () => {
        const msgs = [new NumMsg({ value: 1 }), new NumMsg({ value: 2 }), new NumMsg({ value: 3 })]
        const frames = msgs.map((m) => encodeDelimited(m))

        async function* source() {
            for (const f of frames) yield f
        }

        const decoded: NumMsg[] = []
        for await (const msg of decodeStream(source(), NumMsg)) {
            decoded.push(msg)
        }

        assert.equal(decoded.length, 3)
        assert.equal(decoded[0]!.value, 1)
        assert.equal(decoded[1]!.value, 2)
        assert.equal(decoded[2]!.value, 3)
    })
})

describe('encodeStream', () => {
    it('produces framed output from iterable', async () => {
        const msgs = [new NumMsg({ value: 10 }), new NumMsg({ value: 20 })]
        const chunks: Uint8Array[] = []

        for await (const chunk of encodeStream(msgs)) {
            chunks.push(chunk)
        }

        assert.equal(chunks.length, 2)

        // Decode back
        const deframer = new Deframer()
        const allMsgs: Uint8Array[] = []
        for (const c of chunks) {
            allMsgs.push(...deframer.push(c))
        }
        assert.equal(allMsgs.length, 2)
    })
})

describe('encodeDelimited', () => {
    it('produces a length-prefixed frame', () => {
        const msg = new NumMsg({ value: 42 })
        const framed = encodeDelimited(msg)
        assert.ok(framed.length > 0)

        // Deframe and decode
        const deframer = new Deframer()
        const msgs = deframer.push(framed)
        assert.equal(msgs.length, 1)
        const decoded = NumMsg.decode(msgs[0]!)
        assert.equal(decoded.value, 42)
    })
})
