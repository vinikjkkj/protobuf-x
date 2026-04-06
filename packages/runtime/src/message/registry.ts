import type { MessageType } from './base.js'
import type { Message } from './base.js'

/**
 * Global type registry for resolving message types at runtime.
 * Used for google.protobuf.Any and dynamic message resolution.
 */
export class TypeRegistry {
    private readonly types = new Map<string, MessageType<Message<never>>>()

    /** Register a message type by its fully qualified name. */
    register(name: string, type: MessageType<Message<never>>): void {
        this.types.set(name, type)
    }

    /** Look up a message type by its fully qualified name. */
    lookup(name: string): MessageType<Message<never>> | undefined {
        return this.types.get(name)
    }

    /** Check if a type is registered. */
    has(name: string): boolean {
        return this.types.has(name)
    }

    /** Get all registered type names. */
    names(): IterableIterator<string> {
        return this.types.keys()
    }
}

/** Global shared type registry. */
export const globalRegistry = new TypeRegistry()
