/**
 * Programmatic API for protobuf-x codegen.
 *
 * Use this when you want to invoke the generator from a build script, plugin,
 * or library — without going through the CLI. Returns generated files as an
 * in-memory array; the caller decides whether to write them to disk.
 *
 * @example
 *   import { generate } from '@protobuf-x/codegen'
 *
 *   const result = await generate({
 *     files: ['./schema.proto'],
 *     target: 'ts',
 *     runtimePackage: '@protobuf-x/runtime',
 *   })
 *
 *   for (const file of result.files) {
 *     await fs.writeFile(file.path, file.content, 'utf8')
 *   }
 *
 * @example In-memory: generate from a proto source string
 *   const result = await generate({
 *     sources: [{ name: 'user.proto', content: 'syntax = "proto3"; message User {}' }],
 *     target: 'ts',
 *   })
 *   console.log(result.files[0].content)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import type { ProtoFileNode, MessageNode } from '../../parser/src/ast/nodes.js'

import {
    classifyType,
    collectDefinedTypes,
    loadGeneratorFilesFromGraph,
    normalizeProtoFile,
    type ParserModuleLike
} from './cli/schema.js'
import { generateJavaScript, getJsOutputPaths } from './generator/js-generator.js'
import { generateTypeScript, getOutputPath } from './generator/ts-generator.js'
import type { ProtoFile } from './generator/ts-generator.js'
import { analyzeInlineCandidates, applyInlineOptimizations } from './optimizer/inline.js'

/** Output target format. */
export type GenerateTarget = 'ts' | 'js' | 'both'

/** A proto source provided in-memory rather than read from disk. */
export interface ProtoSource {
    /** Logical name of the file (used for output path generation). */
    name: string
    /** The .proto file contents as a string. */
    content: string
}

/** Options for the {@link generate} function. */
export interface GenerateOptions {
    /**
     * Paths to .proto files to compile. Either `files` or `sources` (or both)
     * must be provided.
     */
    files?: string[]
    /**
     * In-memory proto source strings. Useful for tests, REPL, or when proto
     * definitions are constructed at runtime.
     */
    sources?: ProtoSource[]
    /** Output target. Defaults to `'ts'`. */
    target?: GenerateTarget
    /**
     * Runtime package import specifier. Defaults to `'@protobuf-x/runtime'`.
     * Use `'@protobuf-x/runtime/minimal'` for the minimal runtime
     * (auto-enables `minimal` mode which implies `noJson`, `noCreate`, `noTypeurl`).
     */
    runtimePackage?: string
    /** Skip generating toJSON/fromJSON + JSON interfaces. */
    noJson?: boolean
    /** Skip generating Message.create() static factory method. */
    noCreate?: boolean
    /** Skip generating getTypeUrl helper. */
    noTypeurl?: boolean
    /** Minimal mode: enables all --no-* flags at once. */
    minimal?: boolean
    /**
     * JS representation for 64-bit integer fields. Defaults to `'bigint'`.
     *  - `'bigint'`: native BigInt — full precision, fastest
     *  - `'number'`: JS number — protobufjs-like, loses precision above 2^53
     *  - `'string'`: decimal string — safe for JSON interop
     */
    int64As?: 'bigint' | 'number' | 'string'
    /** Additional directories to search when resolving proto imports. */
    importPaths?: string[]
    /**
     * Optional output directory used for relative path resolution. Does NOT
     * cause files to be written — output is always returned in-memory. If
     * provided, generated file paths in the result are joined with this dir.
     */
    outDir?: string
    /**
     * Override the parser module. Defaults to dynamically loading
     * `@protobuf-x/parser` at runtime. Pass an explicit module to avoid the
     * dynamic import (useful for ESM bundlers that can't handle it).
     */
    parser?: ParserModuleLike
}

/** A single generated file as an in-memory string. */
export interface GeneratedFile {
    /** Output path (relative to {@link GenerateOptions.outDir} if provided). */
    path: string
    /** File content. */
    content: string
}

/** Result of the {@link generate} function. */
export interface GenerateResult {
    /** Generated files. Write each to disk via `fs.writeFileSync(file.path, file.content)`. */
    files: GeneratedFile[]
    /**
     * Per-file errors that occurred during generation. The function does NOT
     * throw on a single bad file; it collects errors and returns successful
     * outputs alongside.
     */
    errors: GenerateError[]
}

/** An error that occurred while processing a single proto file. */
export interface GenerateError {
    /** The proto file path or source name that failed. */
    file: string
    /** Error message. */
    message: string
}

/**
 * Generate code from one or more .proto files (or in-memory sources).
 *
 * Returns generated files in-memory. The caller decides whether to write
 * them to disk via `fs.writeFile()` or use them in some other pipeline
 * (bundler plugin, virtual filesystem, etc.).
 *
 * Auto-detects the runtime mode: if `runtimePackage` ends in `/minimal`,
 * `noJson` is enabled automatically.
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
    const target: GenerateTarget = options.target ?? 'ts'
    const runtimePackage = options.runtimePackage ?? '@protobuf-x/runtime'
    // Auto-detect minimal runtime: paths containing `/minimal` enable minimal mode.
    const autoMinimal = /\/minimal(\.[jt]s)?$/.test(runtimePackage)
    const minimal = options.minimal === true || autoMinimal
    const noJson = options.noJson === true || minimal
    const noCreate = options.noCreate === true || minimal
    const noTypeurl = options.noTypeurl === true || minimal
    const int64As = options.int64As ?? 'bigint'
    const outDir = options.outDir ?? ''
    const parserModule = options.parser ?? (await loadParserModule())

    if (
        (!options.files || options.files.length === 0) &&
        (!options.sources || options.sources.length === 0)
    ) {
        throw new Error('generate(): must provide at least one of `files` or `sources`')
    }

    const files: GeneratedFile[] = []
    const errors: GenerateError[] = []
    const seenPaths = new Set<string>()

    const allInputs: Array<{
        source: string
        loaded: Array<{ proto: ProtoFile; virtualPath: string }>
    }> = []

    // Load file inputs
    for (const filePath of options.files ?? []) {
        try {
            const loaded = await loadProtoFromFile(
                filePath,
                options.importPaths ?? [],
                parserModule
            )
            allInputs.push({ source: filePath, loaded })
        } catch (err) {
            errors.push({ file: filePath, message: (err as Error).message })
        }
    }

    // Load in-memory inputs
    for (const src of options.sources ?? []) {
        try {
            const loaded = loadProtoFromString(src, parserModule)
            allInputs.push({ source: src.name, loaded })
        } catch (err) {
            errors.push({ file: src.name, message: (err as Error).message })
        }
    }

    // Generate output
    for (const input of allInputs) {
        for (const loaded of input.loaded) {
            try {
                if (target === 'ts' || target === 'both') {
                    const tsRelPath = getOutputPath(loaded.virtualPath)
                    const tsAbsPath = outDir ? path.join(outDir, tsRelPath) : tsRelPath
                    if (!seenPaths.has(tsAbsPath)) {
                        const opts = {
                            runtimePackage,
                            noJson,
                            noCreate,
                            noTypeurl,
                            int64As
                        }
                        let tsSource = generateTypeScript(loaded.proto, opts)
                        const candidates = analyzeInlineCandidates(loaded.proto)
                        tsSource = applyInlineOptimizations(tsSource, candidates)
                        files.push({ path: tsAbsPath, content: tsSource })
                        seenPaths.add(tsAbsPath)
                    }
                }
                if (target === 'js' || target === 'both') {
                    const paths = getJsOutputPaths(loaded.virtualPath)
                    const jsAbsPath = outDir ? path.join(outDir, paths.js) : paths.js
                    const dtsAbsPath = outDir ? path.join(outDir, paths.dts) : paths.dts
                    if (!seenPaths.has(jsAbsPath)) {
                        const opts = {
                            runtimePackage,
                            noJson,
                            noCreate,
                            noTypeurl,
                            int64As
                        }
                        const { js, dts } = generateJavaScript(loaded.proto, opts)
                        files.push({ path: jsAbsPath, content: js })
                        files.push({ path: dtsAbsPath, content: dts })
                        seenPaths.add(jsAbsPath)
                        seenPaths.add(dtsAbsPath)
                    }
                }
            } catch (err) {
                errors.push({ file: input.source, message: (err as Error).message })
            }
        }
    }

    return { files, errors }
}

/**
 * Convenience: generate code and write all output files to disk.
 *
 * Equivalent to calling {@link generate} and then writing each file via
 * `fs.writeFileSync`. Creates intermediate directories as needed.
 *
 * @returns The same {@link GenerateResult} as {@link generate}.
 */
export async function generateToDisk(options: GenerateOptions): Promise<GenerateResult> {
    const result = await generate(options)
    for (const file of result.files) {
        fs.mkdirSync(path.dirname(file.path), { recursive: true })
        fs.writeFileSync(file.path, file.content, 'utf8')
    }
    return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers (subset of cli/main.ts logic, decoupled from CLI args)
// ─────────────────────────────────────────────────────────────────────────────

const PARSER_SOURCE_FALLBACKS = ['../../parser/src/index.ts', '../../../parser/src/index.ts']

async function loadParserModule(): Promise<ParserModuleLike | undefined> {
    for (const specifier of ['@protobuf-x/parser', ...PARSER_SOURCE_FALLBACKS]) {
        try {
            return (await import(/* webpackIgnore: true */ specifier)) as ParserModuleLike
        } catch {
            // Try the next parser source.
        }
    }
    return undefined
}

async function loadProtoFromFile(
    filePath: string,
    importPaths: string[],
    parserModule: ParserModuleLike | undefined
): Promise<Array<{ proto: ProtoFile; virtualPath: string }>> {
    if (parserModule?.ProtoLoader) {
        return loadGeneratorFilesFromGraph(filePath, importPaths, parserModule)
    }
    const content = readFileSync(filePath)
    if (parserModule) {
        for (const parseFn of [parserModule.parse, parserModule.parseProto]) {
            if (typeof parseFn === 'function') {
                return [
                    {
                        proto: normalizeProtoFile(parseFn(content)),
                        virtualPath: path.basename(filePath)
                    }
                ]
            }
        }
    }
    return [{ proto: parseProtoBasic(content), virtualPath: path.basename(filePath) }]
}

function loadProtoFromString(
    src: ProtoSource,
    parserModule: ParserModuleLike | undefined
): Array<{ proto: ProtoFile; virtualPath: string }> {
    if (parserModule) {
        for (const parseFn of [parserModule.parse, parserModule.parseProto]) {
            if (typeof parseFn === 'function') {
                return [{ proto: normalizeProtoFile(parseFn(src.content)), virtualPath: src.name }]
            }
        }
    }
    return [{ proto: parseProtoBasic(src.content), virtualPath: src.name }]
}

function readFileSync(filePath: string): string {
    try {
        return fs.readFileSync(filePath, 'utf-8')
    } catch (err) {
        throw new Error(`Could not read file "${filePath}": ${(err as Error).message}`)
    }
}

/**
 * Minimal fallback parser used when @protobuf-x/parser is not available.
 * Mirrors the bootstrap parser in cli/main.ts. For real-world schemas,
 * always have @protobuf-x/parser available — this fallback only handles
 * trivial proto3 syntax.
 */
function parseProtoBasic(content: string): ProtoFile {
    const pkgMatch = content.match(/^\s*package\s+([\w.]+);/m)
    const syntaxMatch = content.match(/^\s*syntax\s*=\s*"([^"]+)";/m)
    const proto: ProtoFile = {
        syntax: syntaxMatch?.[1] ?? 'proto3',
        packageName: pkgMatch?.[1] ?? '',
        options: {},
        imports: [],
        messages: [],
        enums: [],
        services: [],
        extensions: []
    }

    // Strip comments
    const stripped = content.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

    const messageRegex = /message\s+(\w+)\s*\{([^{}]*)\}/g
    let match: RegExpExecArray | null
    while ((match = messageRegex.exec(stripped)) !== null) {
        const name = match[1]!
        proto.messages.push({
            name,
            generatedName: name,
            fullName: proto.packageName ? `${proto.packageName}.${name}` : name,
            fields: [],
            oneofs: [],
            nestedMessages: [],
            nestedEnums: []
        })
    }

    // Suppress unused warnings for AST imports referenced via type-only paths
    void classifyType
    void collectDefinedTypes
    void (null as unknown as ProtoFileNode)
    void (null as unknown as MessageNode)

    return proto
}
