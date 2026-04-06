/** Generic transport interface for RPC calls. */
export interface Transport {
    /** Perform a unary RPC call. */
    unary(service: string, method: string, input: Uint8Array): Promise<Uint8Array>
    /** Perform a server-streaming RPC call. */
    serverStream?(service: string, method: string, input: Uint8Array): AsyncIterable<Uint8Array>
    /** Perform a client-streaming RPC call. */
    clientStream?(
        service: string,
        method: string,
        inputs: AsyncIterable<Uint8Array>
    ): Promise<Uint8Array>
    /** Perform a bidirectional-streaming RPC call. */
    bidiStream?(
        service: string,
        method: string,
        inputs: AsyncIterable<Uint8Array>
    ): AsyncIterable<Uint8Array>
}
