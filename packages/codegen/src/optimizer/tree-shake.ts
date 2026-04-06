/**
 * Dead code elimination hints.
 * Analyzes generated code to detect unused imports and unreferenced types.
 */

import type { ProtoMessage } from '../generator/message-codegen.js'
import type { ProtoFile } from '../generator/ts-generator.js'

/** Result of tree-shake analysis. */
export interface TreeShakeResult {
    /** Import paths that are not referenced by any field in the file. */
    unusedImports: string[]
    /** Message type names that are defined but never referenced by any field. */
    unreferencedMessages: string[]
    /** Enum type names that are defined but never referenced by any field. */
    unreferencedEnums: string[]
}

/**
 * Analyze a proto file for dead code elimination hints.
 * Returns sets of unused imports and unreferenced types.
 */
export function analyzeTreeShake(proto: ProtoFile): TreeShakeResult {
    // Collect all type references from message fields
    const referencedTypes = new Set<string>()
    collectReferences(proto.messages, referencedTypes)

    // Collect all defined message and enum names
    const definedMessages = new Set<string>()
    const definedEnums = new Set<string>()
    collectDefinedTypes(proto.messages, definedMessages, definedEnums)
    for (const e of proto.enums) {
        definedEnums.add(e.name)
    }

    // Find unreferenced messages
    const unreferencedMessages: string[] = []
    for (const name of definedMessages) {
        if (!referencedTypes.has(name)) {
            unreferencedMessages.push(name)
        }
    }

    // Find unreferenced enums
    const unreferencedEnums: string[] = []
    for (const name of definedEnums) {
        if (!referencedTypes.has(name)) {
            unreferencedEnums.push(name)
        }
    }

    // Find unused imports
    const unusedImports: string[] = []
    for (const imp of proto.imports) {
        // An import is "used" if any field references a type that could come from it
        const importBaseName =
            imp.path
                .replace(/\.proto$/, '')
                .split('/')
                .pop() ?? ''
        let used = false
        for (const ref of referencedTypes) {
            // Heuristic: if a referenced type starts with the import's base name
            if (ref.includes(importBaseName) || ref.includes('.')) {
                used = true
                break
            }
        }
        if (!used) {
            unusedImports.push(imp.path)
        }
    }

    return { unusedImports, unreferencedMessages, unreferencedEnums }
}

/** Recursively collect all type references from message fields. */
function collectReferences(messages: ProtoMessage[], refs: Set<string>): void {
    for (const msg of messages) {
        for (const field of msg.fields) {
            if (field.isMessage || field.isEnum) {
                refs.add(field.type)
            }
            if (field.mapValueType && typeof field.mapValueType === 'string') {
                refs.add(field.mapValueType)
            }
        }
        for (const oneof of msg.oneofs) {
            for (const field of oneof.fields) {
                if (field.isMessage || field.isEnum) {
                    refs.add(field.type)
                }
            }
        }
        collectReferences(msg.nestedMessages, refs)
    }
}

/** Recursively collect all defined message and enum names. */
function collectDefinedTypes(
    messages: ProtoMessage[],
    msgSet: Set<string>,
    enumSet: Set<string>
): void {
    for (const msg of messages) {
        msgSet.add(msg.name)
        for (const nested of msg.nestedEnums) {
            enumSet.add(nested.name)
        }
        collectDefinedTypes(msg.nestedMessages, msgSet, enumSet)
    }
}
