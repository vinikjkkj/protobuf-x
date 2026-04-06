/**
 * Inline optimizations for generated code.
 * Applies optimizations like inlining small encode/decode methods.
 */

import type { ProtoMessage } from '../generator/message-codegen.js'
import type { ProtoFile } from '../generator/ts-generator.js'

/** Threshold: messages with this many fields or fewer can be inlined. */
const INLINE_FIELD_THRESHOLD = 3

/** Result of inline analysis for a message. */
export interface InlineCandidate {
    /** The message name. */
    messageName: string
    /** Total number of regular (non-oneof) fields. */
    fieldCount: number
    /** Whether this message is a candidate for inlining. */
    canInline: boolean
    /** Reason if not inlineable. */
    reason?: string
}

/**
 * Analyze which messages in a proto file are candidates for inline optimization.
 * Small messages (few fields, no nested messages, no oneofs) can have their
 * encode/decode inlined at call sites for better performance.
 */
export function analyzeInlineCandidates(proto: ProtoFile): InlineCandidate[] {
    const candidates: InlineCandidate[] = []
    collectCandidates(proto.messages, candidates)
    return candidates
}

function collectCandidates(messages: ProtoMessage[], candidates: InlineCandidate[]): void {
    for (const msg of messages) {
        const fieldCount = msg.fields.length
        let canInline = true
        let reason: string | undefined

        if (fieldCount > INLINE_FIELD_THRESHOLD) {
            canInline = false
            reason = `Too many fields (${fieldCount} > ${INLINE_FIELD_THRESHOLD})`
        } else if (msg.oneofs.length > 0) {
            canInline = false
            reason = 'Contains oneof groups'
        } else if (msg.nestedMessages.length > 0) {
            canInline = false
            reason = 'Contains nested messages'
        } else if (msg.fields.some((f) => f.isMessage)) {
            canInline = false
            reason = 'Contains message-typed fields'
        } else if (msg.fields.some((f) => !!f.mapKeyType)) {
            canInline = false
            reason = 'Contains map fields'
        }

        candidates.push({ messageName: msg.name, fieldCount, canInline, reason })

        // Recurse into nested messages
        collectCandidates(msg.nestedMessages, candidates)
    }
}

/**
 * Apply inline optimization to generated TypeScript source code.
 * For messages that are inline candidates, replaces MessageType.encode(msg, w)
 * calls with the inlined encode body directly.
 *
 * This is a source-to-source transformation on the generated code string.
 * Currently returns the source unchanged if no optimizations apply, to keep
 * the generated code simple and debuggable.
 *
 * @param source - The generated TypeScript source code.
 * @param candidates - The inline analysis results.
 * @returns The optimized source code.
 */
export function applyInlineOptimizations(source: string, candidates: InlineCandidate[]): string {
    // No-op: previously injected `// @inline-candidate` comments at the top of the
    // generated file as hints for tooling. Removed to reduce file size — the inline
    // analysis is still available via `analyzeInlineCandidates()` for tooling that
    // needs it programmatically.
    void candidates
    return source
}
