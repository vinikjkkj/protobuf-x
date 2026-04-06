import type { ProtoFileNode, MessageNode, EnumNode, ServiceNode } from '../ast/nodes.js'

/**
 * Convenience wrapper around a ProtoFileNode AST.
 * Provides lookup methods for messages, enums, and services.
 */
export class ProtoFile {
    readonly ast: ProtoFileNode

    constructor(ast: ProtoFileNode) {
        this.ast = ast
    }

    /** The syntax version (proto2 or proto3). */
    get syntax(): string {
        return this.ast.syntax
    }

    /** The package name (empty string if none). */
    get package(): string {
        return this.ast.package
    }

    /**
     * Look up a message by name.
     * Supports simple names (matches by name field) and dotted names
     * for nested messages (e.g., "Outer.Inner").
     */
    lookupMessage(name: string): MessageNode | undefined {
        const parts = name.split('.')
        return this.findMessageByParts(this.ast.messages, parts)
    }

    /**
     * Look up an enum by name.
     * Supports simple names and dotted names for nested enums
     * (e.g., "MyMessage.Status").
     */
    lookupEnum(name: string): EnumNode | undefined {
        const parts = name.split('.')

        // If there's only one part, search top-level and all nested
        if (parts.length === 1) {
            const topLevel = this.ast.enums.find((e) => e.name === name)
            if (topLevel) return topLevel

            // Search nested enums
            for (const msg of this.ast.messages) {
                const found = this.findNestedEnum(msg, name)
                if (found) return found
            }
            return undefined
        }

        // Multi-part: navigate into messages first, then find enum
        const enumName = parts[parts.length - 1]!
        const msgParts = parts.slice(0, -1)
        const msg = this.findMessageByParts(this.ast.messages, msgParts)
        if (msg) {
            return msg.nestedEnums.find((e) => e.name === enumName)
        }
        return undefined
    }

    /** Look up a service by name. */
    lookupService(name: string): ServiceNode | undefined {
        return this.ast.services.find((s) => s.name === name)
    }

    /** Get all messages, including nested ones, flattened. */
    getMessages(): MessageNode[] {
        const result: MessageNode[] = []
        this.collectMessages(this.ast.messages, result)
        return result
    }

    /** Get all enums, including nested ones, flattened. */
    getEnums(): EnumNode[] {
        const result: EnumNode[] = []
        // Top-level enums
        for (const e of this.ast.enums) {
            result.push(e)
        }
        // Nested enums
        this.collectEnums(this.ast.messages, result)
        return result
    }

    // ── private helpers ────────────────────────────────────────

    private findMessageByParts(
        messages: readonly MessageNode[],
        parts: string[]
    ): MessageNode | undefined {
        if (parts.length === 0) return undefined

        const [first, ...rest] = parts
        const msg = messages.find((m) => m.name === first)
        if (!msg) return undefined

        if (rest.length === 0) return msg
        return this.findMessageByParts(msg.nestedMessages, rest)
    }

    private findNestedEnum(msg: MessageNode, name: string): EnumNode | undefined {
        const found = msg.nestedEnums.find((e) => e.name === name)
        if (found) return found

        for (const nested of msg.nestedMessages) {
            const deepFound = this.findNestedEnum(nested, name)
            if (deepFound) return deepFound
        }
        return undefined
    }

    private collectMessages(messages: readonly MessageNode[], result: MessageNode[]): void {
        for (const msg of messages) {
            result.push(msg)
            this.collectMessages(msg.nestedMessages, result)
        }
    }

    private collectEnums(messages: readonly MessageNode[], result: EnumNode[]): void {
        for (const msg of messages) {
            for (const e of msg.nestedEnums) {
                result.push(e)
            }
            this.collectEnums(msg.nestedMessages, result)
        }
    }
}
