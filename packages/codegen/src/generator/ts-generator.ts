/**
 * TypeScript file generator: orchestrates all code generation for a .ts output.
 */

import type { ProtoEnum } from './enum-codegen.js'
import { generateEnum, generateEnumDescriptor } from './enum-codegen.js'
import type { ProtoExtensionGroup } from './extension-codegen.js'
import { generateExtensionGroup, generateExtensionPatch } from './extension-codegen.js'
import type { ProtoMessage } from './message-codegen.js'
import { generateMessage, RUNTIME_MESSAGE_BASE } from './message-codegen.js'
import type { ProtoService } from './service-codegen.js'
import { generateService, generateServiceDescriptor } from './service-codegen.js'
import { CodeTemplate } from './template.js'

/** Represents a fully parsed .proto file for code generation. */
export interface ProtoFile {
    /** The proto syntax version (e.g., "proto3"). */
    syntax: string
    /** The proto package name. */
    packageName: string
    /** Import paths referenced in the file. */
    imports: ProtoImport[]
    /** Top-level options. */
    options: Record<string, string>
    /** Top-level message definitions. */
    messages: ProtoMessage[]
    /** Top-level enum definitions. */
    enums: ProtoEnum[]
    /** Top-level service definitions. */
    services: ProtoService[]
    /** Extension blocks declared in this file. */
    extensions: ProtoExtensionGroup[]
}

/** Represents a proto import statement. */
export interface ProtoImport {
    path: string
    kind: 'default' | 'public' | 'weak'
}

export type Int64Mode = 'bigint' | 'number' | 'string'

export interface TsGeneratorOptions {
    /** Override the runtime package import path. */
    runtimePackage?: string
    /**
     * Skip generating toJSON/fromJSON methods and JSON interfaces.
     * Automatically enabled when runtimePackage targets `/minimal`.
     */
    noJson?: boolean
    /**
     * Skip generating Message.create() static factory method.
     * Reduces output size; use `new Message()` instead.
     */
    noCreate?: boolean
    /**
     * Skip generating getTypeUrl helper.
     * Reduces output size; only needed for google.protobuf.Any interop.
     */
    noTypeurl?: boolean
    /**
     * Minimal mode: enables all --no-* flags at once for smallest
     * possible binary-only output.
     */
    minimal?: boolean
    /**
     * JS representation for 64-bit integer fields. Defaults to `'bigint'`
     * (full precision, fastest). Use `'number'` for protobufjs interop
     * (loses precision above 2^53) or `'string'` for safe JSON interop.
     */
    int64As?: Int64Mode
}

function hasAnyEnums(messages: readonly ProtoMessage[]): boolean {
    for (const message of messages) {
        if (message.nestedEnums.length > 0 || hasAnyEnums(message.nestedMessages)) {
            return true
        }
    }
    return false
}

const SCALAR_PROTO_TYPES = new Set([
    'double',
    'float',
    'int32',
    'int64',
    'uint32',
    'uint64',
    'sint32',
    'sint64',
    'fixed32',
    'fixed64',
    'sfixed32',
    'sfixed64',
    'bool',
    'string',
    'bytes'
])

/**
 * Walk every message recursively and return a list of `Message.field (type)`
 * strings for proto3 implicit-presence scalar fields. Used to generate the
 * migration warning header. Skips:
 *   - fields marked `optional` (explicit presence — already T | undefined)
 *   - repeated and map fields (always have presence via empty array/map)
 *   - message fields (already T | undefined)
 *   - enum fields (already T | undefined when not set in proto3 explicit form)
 */
function collectImplicitPresenceFields(messages: readonly ProtoMessage[]): string[] {
    const result: string[] = []
    const visit = (msgs: readonly ProtoMessage[]): void => {
        for (const msg of msgs) {
            for (const field of msg.fields) {
                if (field.label === 'repeated' || field.mapKeyType) continue
                if (field.hasPresence || field.isRequired) continue
                if (!SCALAR_PROTO_TYPES.has(field.type)) continue
                const msgName = msg.generatedName ?? msg.name
                result.push(`${msgName}.${field.name} (${field.type})`)
            }
            visit(msg.nestedMessages)
        }
    }
    visit(messages)
    return result
}

/**
 * Generate a complete TypeScript file from a parsed proto file definition.
 *
 * @param proto - The parsed proto file.
 * @param options - Generator options.
 * @returns The complete TypeScript source code string.
 */
export function generateTypeScript(proto: ProtoFile, options?: TsGeneratorOptions): string {
    const runtimePkg = options?.runtimePackage ?? '@protobuf-x/runtime'
    // Auto-detect minimal runtime: paths containing `/minimal` enable minimal mode.
    const autoMinimal = /\/minimal(\.[jt]s)?$/.test(runtimePkg)
    // --minimal flag enables all --no-* options at once
    const minimal = options?.minimal === true || autoMinimal
    const noJson = options?.noJson === true || minimal
    const noCreate = options?.noCreate === true || minimal
    const noTypeurl = options?.noTypeurl === true || minimal
    const t = new CodeTemplate()

    // Header comment
    t.raw('// Generated by protobuf-x. DO NOT EDIT.')

    // Migration warning: list proto3 implicit-presence scalar fields. These
    // decode to their zero value (0, '', false, empty bytes/array) when
    // missing from the wire — NOT undefined. Code migrated from protobufjs
    // that uses `if (msg.field)` to mean "field set" will misbehave when
    // the value is legitimately zero. To distinguish absence from default,
    // mark the field `optional` in the .proto.
    const implicitPresenceFields = collectImplicitPresenceFields(proto.messages)
    if (implicitPresenceFields.length > 0) {
        t.raw('//')
        t.raw('// ⚠ proto3 implicit-presence fields below decode to their zero value')
        t.raw('//   (0, "", false, empty bytes/array) when missing on the wire, NOT')
        t.raw('//   undefined. To distinguish "absent" from "default", mark them')
        t.raw('//   `optional` in your .proto file.')
        // Cap at 30 entries so the header stays readable on huge schemas
        const PREVIEW = 30
        for (const f of implicitPresenceFields.slice(0, PREVIEW)) {
            t.raw(`//   - ${f}`)
        }
        if (implicitPresenceFields.length > PREVIEW) {
            t.raw(`//   - ...and ${implicitPresenceFields.length - PREVIEW} more`)
        }
    }

    // Collect needed runtime imports
    const runtimeImports = new Set<string>()
    const runtimeTypeImports = new Set<string>()

    if (proto.messages.length > 0) {
        runtimeImports.add(`Message as ${RUNTIME_MESSAGE_BASE}`)
        runtimeImports.add('BinaryReader')
        runtimeImports.add('BinaryWriter')
        runtimeTypeImports.add('MessageDescriptor')
        // Two-pass encode helpers
        runtimeImports.add('varint32Size')
        runtimeImports.add('varint64Size')
        runtimeImports.add('int32Size')
        runtimeImports.add('strByteLen')
        runtimeImports.add('strWrite')
        runtimeImports.add('writeVarint')
        runtimeImports.add('writeVarint64')
        runtimeImports.add('writeInt32')
        runtimeImports.add('writeSint32')
        runtimeImports.add('allocBuf')
        runtimeImports.add('finalizeBuf')
        runtimeImports.add('writeDouble')
        runtimeImports.add('writeFloat')
        runtimeImports.add('writeFixed32')
        runtimeImports.add('writeFixed64')
        runtimeImports.add('writeBool')
        runtimeImports.add('writeBytes')
    }

    if (proto.messages.length > 0 || proto.extensions.length > 0) {
        runtimeImports.add('FieldRule')
        runtimeImports.add('ScalarType')
    }

    if (proto.enums.length > 0 || hasAnyEnums(proto.messages)) {
        runtimeTypeImports.add('EnumDescriptor')
    }

    if (proto.services.length > 0) {
        runtimeTypeImports.add('ServiceDescriptor')
    }

    if (proto.extensions.length > 0) {
        runtimeTypeImports.add('ExtensionDescriptor')
    }

    // Emit runtime imports
    if (runtimeImports.size > 0) {
        t.raw(`import { ${[...runtimeImports].join(', ')} } from '${runtimePkg}';`)
    }
    if (runtimeTypeImports.size > 0) {
        t.raw(`import type { ${[...runtimeTypeImports].join(', ')} } from '${runtimePkg}';`)
    }

    // Emit proto file imports (as relative TS imports)
    for (const imp of proto.imports) {
        const tsPath = protoImportToTsPath(imp.path)
        t.raw(`import * as ${importAlias(imp.path)} from '${tsPath}';`)
    }

    if (runtimeImports.size > 0 || runtimeTypeImports.size > 0 || proto.imports.length > 0) {
        t.blank()
    }

    // Generate enums
    for (const protoEnum of proto.enums) {
        t.raw(generateEnum(protoEnum))
        t.blank()
        t.raw(generateEnumDescriptor(protoEnum))
        t.blank()
    }

    // Generate messages
    const int64As: Int64Mode = options?.int64As ?? 'bigint'
    const msgOptions = { noJson, noCreate, noTypeurl, int64As }
    for (const msg of proto.messages) {
        t.raw(generateMessage(msg, proto.packageName, [], msgOptions))
        t.blank()
    }

    // Generate services
    for (const svc of proto.services) {
        t.raw(generateService(svc))
        t.blank()
        t.raw(generateServiceDescriptor(svc))
        t.blank()
    }

    for (const extension of proto.extensions) {
        t.raw(generateExtensionGroup(extension))
        t.blank()
    }

    for (const extension of proto.extensions) {
        t.raw(generateExtensionPatch(extension))
        t.blank()
    }

    return t.toString().trimEnd() + '\n'
}

/**
 * Convert a .proto import path to a relative TypeScript import path.
 * E.g., "google/protobuf/timestamp.proto" -> "./google/protobuf/timestamp_pb.js"
 */
function protoImportToTsPath(protoPath: string): string {
    const normalized = protoPath.replace(/\\/g, '/').replace(/\.proto$/, '')
    if (normalized.startsWith('.')) {
        return `${normalized}_pb.js`
    }
    return `./${normalized}_pb.js`
}

/**
 * Generate a safe alias name from a proto import path.
 * E.g., "google/protobuf/timestamp.proto" -> "google_protobuf_timestamp_pb"
 */
function importAlias(protoPath: string): string {
    return protoPath.replace(/\.proto$/, '').replace(/[^a-zA-Z0-9]/g, '_') + '_pb'
}

/**
 * Generate the output file path for a given .proto file.
 * E.g., "user.proto" -> "user_pb.ts"
 */
export function getOutputPath(protoPath: string): string {
    return protoPath.replace(/\.proto$/, '_pb.ts')
}
