import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { BinaryReader } from '../../binary/reader.js'
import { BinaryWriter } from '../../binary/writer.js'
import { Message } from '../../message/base.js'
import type { MessageType } from '../../message/base.js'
import type { MessageDescriptor } from '../../types/descriptors.js'
import { ServiceClient } from '../client.js'
import type { Transport } from '../transport.js'

// ── Minimal test messages ─────────────────────────────────────

class EchoRequest extends Message<EchoRequest> {
    text = ''

    constructor(init?: Partial<EchoRequest>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor: MessageDescriptor = {
        name: 'EchoRequest',
        fields: [],
        oneofs: [],
        nestedTypes: new Map(),
        nestedEnums: new Map()
    }

    static encode(msg: EchoRequest, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.text !== '') {
            w.uint32((1 << 3) | 2) // field 1, LEN
            w.string(msg.text)
        }
        return w
    }

    static decode(buf: Uint8Array, length?: number): EchoRequest {
        const r = BinaryReader.create(buf, length)
        const msg = new EchoRequest()
        while (r.hasMore()) {
            const tag = r.uint32()
            switch (tag >>> 3) {
                case 1:
                    msg.text = r.string()
                    break
                default:
                    r.skip(tag & 7)
                    break
            }
        }
        return msg
    }
}

class EchoResponse extends Message<EchoResponse> {
    text = ''

    constructor(init?: Partial<EchoResponse>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor: MessageDescriptor = {
        name: 'EchoResponse',
        fields: [],
        oneofs: [],
        nestedTypes: new Map(),
        nestedEnums: new Map()
    }

    static encode(msg: EchoResponse, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.text !== '') {
            w.uint32((1 << 3) | 2) // field 1, LEN
            w.string(msg.text)
        }
        return w
    }

    static decode(buf: Uint8Array, length?: number): EchoResponse {
        const r = BinaryReader.create(buf, length)
        const msg = new EchoResponse()
        while (r.hasMore()) {
            const tag = r.uint32()
            switch (tag >>> 3) {
                case 1:
                    msg.text = r.string()
                    break
                default:
                    r.skip(tag & 7)
                    break
            }
        }
        return msg
    }
}

// ── Concrete test client ──────────────────────────────────────

class EchoClient extends ServiceClient {
    constructor(transport: Transport) {
        super(transport, 'EchoService')
    }

    async echo(request: EchoRequest): Promise<EchoResponse> {
        return this.unaryCall('Echo', request, EchoResponse as unknown as MessageType<EchoResponse>)
    }

    serverEcho(request: EchoRequest): AsyncIterable<EchoResponse> {
        return this.serverStreamCall(
            'ServerEcho',
            request,
            EchoResponse as unknown as MessageType<EchoResponse>
        )
    }

    async clientEcho(requests: AsyncIterable<EchoRequest>): Promise<EchoResponse> {
        return this.clientStreamCall(
            'ClientEcho',
            requests,
            EchoResponse as unknown as MessageType<EchoResponse>
        )
    }

    bidiEcho(requests: AsyncIterable<EchoRequest>): AsyncIterable<EchoResponse> {
        return this.bidiStreamCall(
            'BidiEcho',
            requests,
            EchoResponse as unknown as MessageType<EchoResponse>
        )
    }
}

// ── Mock transport ────────────────────────────────────────────

function createMockTransport(responses?: {
    unary?: (service: string, method: string, input: Uint8Array) => Promise<Uint8Array>
    serverStream?: (service: string, method: string, input: Uint8Array) => AsyncIterable<Uint8Array>
    clientStream?: (
        service: string,
        method: string,
        inputs: AsyncIterable<Uint8Array>
    ) => Promise<Uint8Array>
    bidiStream?: (
        service: string,
        method: string,
        inputs: AsyncIterable<Uint8Array>
    ) => AsyncIterable<Uint8Array>
}): Transport {
    return {
        unary: responses?.unary ?? (async (_s, _m, input) => input),
        serverStream: responses?.serverStream,
        clientStream: responses?.clientStream,
        bidiStream: responses?.bidiStream
    }
}

// ── Tests ─────────────────────────────────────────────────────

describe('ServiceClient', () => {
    it('performs a unary call', async () => {
        const transport = createMockTransport({
            async unary(service, method, input) {
                assert.equal(service, 'EchoService')
                assert.equal(method, 'Echo')
                // Decode request, create response with same text
                const req = EchoRequest.decode(input)
                const resp = new EchoResponse({ text: `echo: ${req.text}` })
                return resp.toBinary()
            }
        })

        const client = new EchoClient(transport)
        const response = await client.echo(new EchoRequest({ text: 'hello' }))
        assert.equal(response.text, 'echo: hello')
    })

    it('performs a server-streaming call', async () => {
        const transport = createMockTransport({
            async *serverStream(_service, _method, input) {
                const req = EchoRequest.decode(input)
                for (let i = 0; i < 3; i++) {
                    const resp = new EchoResponse({ text: `${req.text}-${i}` })
                    yield resp.toBinary()
                }
            }
        })

        const client = new EchoClient(transport)
        const results: string[] = []
        for await (const resp of client.serverEcho(new EchoRequest({ text: 'stream' }))) {
            results.push(resp.text)
        }
        assert.deepEqual(results, ['stream-0', 'stream-1', 'stream-2'])
    })

    it('performs a client-streaming call', async () => {
        const transport = createMockTransport({
            async clientStream(_service, _method, inputs) {
                const texts: string[] = []
                for await (const chunk of inputs) {
                    const req = EchoRequest.decode(chunk)
                    texts.push(req.text)
                }
                const resp = new EchoResponse({ text: texts.join('+') })
                return resp.toBinary()
            }
        })

        const client = new EchoClient(transport)
        async function* requests(): AsyncIterable<EchoRequest> {
            yield new EchoRequest({ text: 'a' })
            yield new EchoRequest({ text: 'b' })
            yield new EchoRequest({ text: 'c' })
        }
        const response = await client.clientEcho(requests())
        assert.equal(response.text, 'a+b+c')
    })

    it('performs a bidi-streaming call', async () => {
        const transport = createMockTransport({
            async *bidiStream(_service, _method, inputs) {
                for await (const chunk of inputs) {
                    const req = EchoRequest.decode(chunk)
                    const resp = new EchoResponse({ text: `re:${req.text}` })
                    yield resp.toBinary()
                }
            }
        })

        const client = new EchoClient(transport)
        async function* requests(): AsyncIterable<EchoRequest> {
            yield new EchoRequest({ text: 'x' })
            yield new EchoRequest({ text: 'y' })
        }
        const results: string[] = []
        for await (const resp of client.bidiEcho(requests())) {
            results.push(resp.text)
        }
        assert.deepEqual(results, ['re:x', 're:y'])
    })

    it('throws when server streaming is not supported by transport', async () => {
        const transport = createMockTransport() // no serverStream
        const client = new EchoClient(transport)

        const iter = client.serverEcho(new EchoRequest({ text: 'test' }))
        await assert.rejects(async () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _resp of iter) {
                // should not reach here
            }
        }, /does not support server streaming/)
    })

    it('throws when client streaming is not supported by transport', async () => {
        const transport = createMockTransport() // no clientStream
        const client = new EchoClient(transport)

        async function* empty(): AsyncIterable<EchoRequest> {}
        await assert.rejects(
            async () => client.clientEcho(empty()),
            /does not support client streaming/
        )
    })

    it('throws when bidi streaming is not supported by transport', async () => {
        const transport = createMockTransport() // no bidiStream
        const client = new EchoClient(transport)

        async function* empty(): AsyncIterable<EchoRequest> {}
        await assert.rejects(async () => {
            for await (const resp of client.bidiEcho(empty())) {
                void resp
            }
        }, /does not support bidi streaming/)
    })

    it('passes correct service and method names through transport', async () => {
        const calls: Array<{ service: string; method: string }> = []
        const transport = createMockTransport({
            async unary(service, method, input) {
                calls.push({ service, method })
                return input
            }
        })

        const client = new EchoClient(transport)
        await client.echo(new EchoRequest({ text: '' }))
        assert.equal(calls.length, 1)
        assert.equal(calls[0]!.service, 'EchoService')
        assert.equal(calls[0]!.method, 'Echo')
    })
})
