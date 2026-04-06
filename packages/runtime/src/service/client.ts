import type { Message, MessageType } from '../message/base.js'

import type { Transport } from './transport.js'

/**
 * Base class for generated service clients.
 * Each generated client extends this and implements typed RPC methods
 * that delegate to the transport layer.
 */
export class ServiceClient {
    constructor(
        protected readonly transport: Transport,
        protected readonly serviceName: string
    ) {}

    /**
     * Perform a unary RPC call: one request, one response.
     * Encodes the input message, sends via transport, and decodes the response.
     */
    protected async unaryCall<I extends Message<I>, O extends Message<O>>(
        method: string,
        input: I,
        outputType: MessageType<O>
    ): Promise<O> {
        const inputBytes = input.toBinary()
        const outputBytes = await this.transport.unary(this.serviceName, method, inputBytes)
        return outputType.decode(outputBytes)
    }

    /**
     * Perform a server-streaming RPC call: one request, stream of responses.
     * Encodes the input message, sends via transport, and decodes each response chunk.
     */
    protected async *serverStreamCall<I extends Message<I>, O extends Message<O>>(
        method: string,
        input: I,
        outputType: MessageType<O>
    ): AsyncIterable<O> {
        if (!this.transport.serverStream) {
            throw new Error(
                `Transport does not support server streaming for ${this.serviceName}/${method}`
            )
        }
        const inputBytes = input.toBinary()
        const stream = this.transport.serverStream(this.serviceName, method, inputBytes)
        for await (const chunk of stream) {
            yield outputType.decode(chunk)
        }
    }

    /**
     * Perform a client-streaming RPC call: stream of requests, one response.
     * Encodes each input message, sends all via transport, and decodes the response.
     */
    protected async clientStreamCall<I extends Message<I>, O extends Message<O>>(
        method: string,
        inputs: AsyncIterable<I>,
        outputType: MessageType<O>
    ): Promise<O> {
        if (!this.transport.clientStream) {
            throw new Error(
                `Transport does not support client streaming for ${this.serviceName}/${method}`
            )
        }
        async function* encodeInputs(): AsyncIterable<Uint8Array> {
            for await (const input of inputs) {
                yield input.toBinary()
            }
        }
        const outputBytes = await this.transport.clientStream(
            this.serviceName,
            method,
            encodeInputs()
        )
        return outputType.decode(outputBytes)
    }

    /**
     * Perform a bidirectional-streaming RPC call: stream of requests, stream of responses.
     * Encodes each input message, sends all via transport, and decodes each response chunk.
     */
    protected async *bidiStreamCall<I extends Message<I>, O extends Message<O>>(
        method: string,
        inputs: AsyncIterable<I>,
        outputType: MessageType<O>
    ): AsyncIterable<O> {
        if (!this.transport.bidiStream) {
            throw new Error(
                `Transport does not support bidi streaming for ${this.serviceName}/${method}`
            )
        }
        async function* encodeInputs(): AsyncIterable<Uint8Array> {
            for await (const input of inputs) {
                yield input.toBinary()
            }
        }
        const stream = this.transport.bidiStream(this.serviceName, method, encodeInputs())
        for await (const chunk of stream) {
            yield outputType.decode(chunk)
        }
    }
}
