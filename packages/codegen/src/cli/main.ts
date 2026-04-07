/**
 * CLI entry point: parses args, loads .proto files, generates output.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import type { MessageNode, ProtoFileNode } from '../../../parser/src/ast/nodes.js'
import { generateJavaScript, getJsOutputPaths } from '../generator/js-generator.js'
import { generateTypeScript, getOutputPath } from '../generator/ts-generator.js'
import type { ProtoFile } from '../generator/ts-generator.js'
import { analyzeInlineCandidates, applyInlineOptimizations } from '../optimizer/inline.js'

import { parseArgs, validateArgs, getHelpText } from './args.js'
import {
    classifyType,
    collectDefinedTypes,
    loadGeneratorFilesFromGraph,
    normalizeProtoFile,
    type ParserModuleLike
} from './schema.js'

const VERSION = '0.1.0'
const PARSER_SOURCE_FALLBACKS = ['../../../parser/src/index.ts', '../../../../parser/src/index.ts']

/**
 * Main CLI function. Parses arguments, reads proto files, generates output.
 *
 * @param argv - Command line arguments (excluding node and script path).
 * @returns Exit code (0 for success, 1 for error).
 */
export async function main(argv: string[]): Promise<number> {
    let args
    try {
        args = parseArgs(argv)
    } catch (err) {
        console.error(`Error: ${(err as Error).message}`)
        console.error('Run with --help for usage information.')
        return 1
    }

    if (args.help) {
        console.log(getHelpText())
        return 0
    }

    if (args.version) {
        console.log(`protobuf-x v${VERSION}`)
        return 0
    }

    const validationError = validateArgs(args)
    if (validationError) {
        console.error(`Error: ${validationError}`)
        console.error('Run with --help for usage information.')
        return 1
    }

    try {
        fs.mkdirSync(args.out, { recursive: true })
    } catch (err) {
        console.error(
            `Error: Could not create output directory "${args.out}": ${(err as Error).message}`
        )
        return 1
    }

    const parserModule = await loadParserModule()
    const writtenFiles = new Set<string>()
    let hasErrors = false

    for (const protoPath of args.files) {
        try {
            const loadedFiles = await loadProtoFiles(protoPath, args.importPaths, parserModule)

            for (const loaded of loadedFiles) {
                if (args.target === 'ts' || args.target === 'both') {
                    const outFile = path.join(args.out, getOutputPath(loaded.virtualPath))
                    const generatorOptions = {
                        runtimePackage: resolveRuntimePackage(
                            args.runtimePackage,
                            args.out,
                            outFile
                        ),
                        noJson: args.noJson,
                        int64As: args.int64As
                    }
                    let tsSource = generateTypeScript(loaded.proto, generatorOptions)
                    const candidates = analyzeInlineCandidates(loaded.proto)
                    tsSource = applyInlineOptimizations(tsSource, candidates)

                    if (!writtenFiles.has(outFile)) {
                        fs.mkdirSync(path.dirname(outFile), { recursive: true })
                        fs.writeFileSync(outFile, tsSource, 'utf-8')
                        writtenFiles.add(outFile)
                        console.log(`Generated: ${outFile}`)
                    }
                }

                if (args.target === 'js' || args.target === 'both') {
                    const paths = getJsOutputPaths(loaded.virtualPath)
                    const jsOutFile = path.join(args.out, paths.js)
                    const generatorOptions = {
                        runtimePackage: resolveRuntimePackage(
                            args.runtimePackage,
                            args.out,
                            jsOutFile
                        ),
                        noJson: args.noJson,
                        int64As: args.int64As
                    }
                    const { js, dts } = generateJavaScript(loaded.proto, generatorOptions)
                    const dtsOutFile = path.join(args.out, paths.dts)

                    if (!writtenFiles.has(jsOutFile)) {
                        fs.mkdirSync(path.dirname(jsOutFile), { recursive: true })
                        fs.writeFileSync(jsOutFile, js, 'utf-8')
                        writtenFiles.add(jsOutFile)
                        console.log(`Generated: ${jsOutFile}`)
                    }
                    if (!writtenFiles.has(dtsOutFile)) {
                        fs.mkdirSync(path.dirname(dtsOutFile), { recursive: true })
                        fs.writeFileSync(dtsOutFile, dts, 'utf-8')
                        writtenFiles.add(dtsOutFile)
                        console.log(`Generated: ${dtsOutFile}`)
                    }
                }
            }
        } catch (err) {
            console.error(`Error processing "${protoPath}": ${(err as Error).message}`)
            hasErrors = true
        }
    }

    return hasErrors ? 1 : 0
}

function resolveRuntimePackage(
    runtimePackage: string,
    outRoot: string,
    outputFile: string
): string {
    if (!runtimePackage.startsWith('.')) {
        return runtimePackage
    }

    const targetPath = path.resolve(outRoot, runtimePackage)
    let specifier = path.relative(path.dirname(outputFile), targetPath).replace(/\\/g, '/')
    if (!specifier.startsWith('.')) {
        specifier = `./${specifier}`
    }
    return specifier
}

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

async function loadProtoFiles(
    filePath: string,
    importPaths: string[],
    parserModule: ParserModuleLike | undefined
): Promise<Array<{ proto: ProtoFile; virtualPath: string }>> {
    if (parserModule?.ProtoLoader) {
        return loadGeneratorFilesFromGraph(filePath, importPaths, parserModule)
    }

    const content = readProtoSource(filePath)

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

    return [
        {
            proto: parseProtoBasic(content),
            virtualPath: path.basename(filePath)
        }
    ]
}

function readProtoSource(filePath: string): string {
    try {
        return fs.readFileSync(filePath, 'utf-8')
    } catch (err) {
        throw new Error(`Could not read file "${filePath}": ${(err as Error).message}`)
    }
}

/**
 * Basic .proto parser for bootstrapping when @protobuf-x/parser is not yet built.
 * Handles common proto3 patterns.
 */
function parseProtoBasic(content: string): ProtoFile {
    const proto: ProtoFile = {
        syntax: 'proto3',
        packageName: '',
        imports: [],
        options: {},
        messages: [],
        enums: [],
        services: [],
        extensions: []
    }

    const syntaxMatch = content.match(/syntax\s*=\s*"([^"]+)"/)
    if (syntaxMatch) {
        proto.syntax = syntaxMatch[1]!
    }

    const packageMatch = content.match(/package\s+([^;]+);/)
    if (packageMatch) {
        proto.packageName = packageMatch[1]!.trim()
    }

    const importRegex = /import\s+(?:(public|weak)\s+)?"([^"]+)";/g
    let importMatch
    while ((importMatch = importRegex.exec(content)) !== null) {
        proto.imports.push({
            path: importMatch[2]!,
            kind: (importMatch[1] as 'public' | 'weak') ?? 'default'
        })
    }

    proto.enums = parseEnums(content)
    proto.messages = parseMessages(content)
    proto.services = parseServices(content)
    annotateBasicFieldKinds(proto)

    return proto
}

function parseEnums(content: string): ProtoFile['enums'] {
    const enums: ProtoFile['enums'] = []
    const enumRegex = /enum\s+(\w+)\s*\{([^}]*)\}/g
    let enumMatch
    while ((enumMatch = enumRegex.exec(content)) !== null) {
        const name = enumMatch[1]!
        const body = enumMatch[2]!
        const values: Array<{ name: string; number: number }> = []
        const valueRegex = /(\w+)\s*=\s*(-?\d+)/g
        let valMatch
        while ((valMatch = valueRegex.exec(body)) !== null) {
            values.push({ name: valMatch[1]!, number: parseInt(valMatch[2]!, 10) })
        }
        enums.push({ name, values })
    }
    return enums
}

function parseMessages(content: string): ProtoFile['messages'] {
    const messages: ProtoFile['messages'] = []
    const msgStarts = findTopLevelBlocks(content, 'message')

    for (const { name, body } of msgStarts) {
        messages.push(parseMessageBody(name, body))
    }

    return messages
}

interface BlockMatch {
    name: string
    body: string
}

function findTopLevelBlocks(content: string, keyword: string): BlockMatch[] {
    const results: BlockMatch[] = []
    const regex = new RegExp(`\\b${keyword}\\s+(\\w+)\\s*\\{`, 'g')
    let match

    while ((match = regex.exec(content)) !== null) {
        const name = match[1]!
        const bodyStart = match.index + match[0].length
        let depth = 1
        let i = bodyStart
        while (i < content.length && depth > 0) {
            if (content[i] === '{') depth++
            else if (content[i] === '}') depth--
            i++
        }
        const body = content.slice(bodyStart, i - 1)
        results.push({ name, body })
        regex.lastIndex = i
    }

    return results
}

function parseMessageBody(name: string, body: string): ProtoFile['messages'][number] {
    const fields: ProtoFile['messages'][number]['fields'] = []
    const oneofs: ProtoFile['messages'][number]['oneofs'] = []
    const nestedMessages: ProtoFile['messages'][number]['nestedMessages'] = []
    const nestedEnums: ProtoFile['messages'][number]['nestedEnums'] = []

    const nestedEnumBlocks = findTopLevelBlocks(body, 'enum')
    for (const { name: enumName, body: enumBody } of nestedEnumBlocks) {
        const values: Array<{ name: string; number: number }> = []
        const valueRegex = /(\w+)\s*=\s*(-?\d+)/g
        let valMatch
        while ((valMatch = valueRegex.exec(enumBody)) !== null) {
            values.push({ name: valMatch[1]!, number: parseInt(valMatch[2]!, 10) })
        }
        nestedEnums.push({ name: enumName, values })
    }

    const nestedMsgBlocks = findTopLevelBlocks(body, 'message')
    for (const { name: nestedName, body: nestedBody } of nestedMsgBlocks) {
        nestedMessages.push(parseMessageBody(nestedName, nestedBody))
    }

    const oneofBlocks = findTopLevelBlocks(body, 'oneof')
    for (const { name: oneofName, body: oneofBody } of oneofBlocks) {
        const oneofFields: ProtoFile['messages'][number]['fields'] = []
        const fieldRegex = /(\w+)\s+(\w+)\s*=\s*(\d+)/g
        let fieldMatch
        while ((fieldMatch = fieldRegex.exec(oneofBody)) !== null) {
            const field = makeField(
                fieldMatch[2]!,
                parseInt(fieldMatch[3]!, 10),
                fieldMatch[1]!,
                'optional',
                oneofName
            )
            oneofFields.push(field)
            fields.push(field)
        }
        oneofs.push({ name: oneofName, fields: oneofFields })
    }

    let strippedBody = body
    for (const keyword of ['message', 'enum', 'oneof']) {
        const blocks = findTopLevelBlocks(strippedBody, keyword)
        for (const block of blocks) {
            const fullBlock = new RegExp(`\\b${keyword}\\s+${block.name}\\s*\\{[\\s\\S]*?\\}`)
            strippedBody = strippedBody.replace(fullBlock, '')
        }
    }

    const fieldRegex =
        /(repeated\s+|optional\s+|required\s+)?(?:map\s*<\s*(\w+)\s*,\s*(\w+)\s*>|(\w+))\s+(\w+)\s*=\s*(\d+)/g
    let fieldMatch
    while ((fieldMatch = fieldRegex.exec(strippedBody)) !== null) {
        const labelStr = (fieldMatch[1] ?? '').trim()
        const mapKey = fieldMatch[2]
        const mapValue = fieldMatch[3]
        const fieldType = fieldMatch[4] ?? 'bytes'
        const fieldName = fieldMatch[5]!
        const fieldNumber = parseInt(fieldMatch[6]!, 10)

        if (fields.some((field) => field.number === fieldNumber)) continue

        const label =
            labelStr === 'repeated'
                ? ('repeated' as const)
                : labelStr === 'required'
                  ? ('required' as const)
                  : ('optional' as const)

        if (mapKey && mapValue) {
            fields.push({
                name: fieldName,
                number: fieldNumber,
                type: 'bytes',
                label: 'optional',
                mapKeyType: mapKey,
                mapValueType: mapValue,
                isMessage: false,
                isEnum: false
            })
        } else {
            fields.push(makeField(fieldName, fieldNumber, fieldType, label))
        }
    }

    return { name, fields, oneofs, nestedMessages, nestedEnums }
}

function annotateBasicFieldKinds(proto: ProtoFile): void {
    const syntheticAst: ProtoFileNode = {
        kind: 'file' as const,
        syntax: proto.syntax as 'proto2' | 'proto3',
        package: proto.packageName,
        imports: [],
        options: [],
        messages: proto.messages.map((message) => generatorMessageToAst(message)),
        enums: proto.enums.map((protoEnum) => ({
            kind: 'enum' as const,
            name: protoEnum.name,
            values: protoEnum.values.map((value) => ({
                kind: 'enum_value' as const,
                name: value.name,
                number: value.number,
                options: [],
                line: 0,
                column: 0
            })),
            options: [],
            reserved: [],
            line: 0,
            column: 0
        })),
        services: [],
        extends: [],
        line: 0,
        column: 0
    }
    const types = collectDefinedTypes(syntheticAst)

    const annotateMessage = (message: ProtoFile['messages'][number]): void => {
        for (const field of message.fields) {
            if (field.mapValueType) {
                const mapKind = classifyType(field.mapValueType, types)
                field.mapValueIsMessage = mapKind === 'message'
                field.mapValueIsEnum = mapKind === 'enum'
            }
            if (SCALAR_TYPES.has(field.type)) {
                field.isMessage = false
                field.isEnum = false
            } else {
                const kind = classifyType(field.type, types)
                field.isMessage = kind === 'message'
                field.isEnum = kind === 'enum'
            }
        }
        for (const nested of message.nestedMessages) {
            annotateMessage(nested)
        }
    }

    for (const message of proto.messages) {
        annotateMessage(message)
    }
}

function generatorMessageToAst(message: ProtoFile['messages'][number]): MessageNode {
    return {
        kind: 'message' as const,
        name: message.name,
        fields: message.fields
            .filter((field) => !field.mapKeyType && field.oneofName === undefined)
            .map((field) => ({
                kind: 'field' as const,
                name: field.name,
                type: field.type,
                number: field.number,
                rule: field.label,
                options: [],
                line: 0,
                column: 0
            })),
        nestedMessages: message.nestedMessages.map((nested) => generatorMessageToAst(nested)),
        nestedEnums: message.nestedEnums.map((protoEnum) => ({
            kind: 'enum' as const,
            name: protoEnum.name,
            values: protoEnum.values.map((value) => ({
                kind: 'enum_value' as const,
                name: value.name,
                number: value.number,
                options: [],
                line: 0,
                column: 0
            })),
            options: [],
            reserved: [],
            line: 0,
            column: 0
        })),
        oneofs: message.oneofs.map((oneof) => ({
            kind: 'oneof' as const,
            name: oneof.name,
            fields: oneof.fields.map((field) => ({
                kind: 'field' as const,
                name: field.name,
                type: field.type,
                number: field.number,
                rule: field.label,
                options: [],
                line: 0,
                column: 0
            })),
            options: [],
            line: 0,
            column: 0
        })),
        mapFields: message.fields
            .filter((field) => field.mapKeyType && field.mapValueType)
            .map((field) => ({
                kind: 'map_field' as const,
                name: field.name,
                keyType: field.mapKeyType!,
                valueType: field.mapValueType!,
                number: field.number,
                options: [],
                line: 0,
                column: 0
            })),
        reserved: [],
        options: [],
        extensions: [],
        extends: [],
        line: 0,
        column: 0
    } as MessageNode
}

const SCALAR_TYPES = new Set([
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

function makeField(
    name: string,
    number: number,
    type: string,
    label: 'optional' | 'required' | 'repeated',
    oneofName?: string
): ProtoFile['messages'][number]['fields'][number] {
    const isScalar = SCALAR_TYPES.has(type)
    const isMessage = !isScalar && /^[A-Z]/.test(type)
    const isEnum = !isScalar && !isMessage

    return {
        name,
        number,
        type,
        label,
        oneofName,
        isMessage,
        isEnum,
        packed: label === 'repeated' && isScalar && type !== 'string' && type !== 'bytes'
    }
}

function parseServices(content: string): ProtoFile['services'] {
    const services: ProtoFile['services'] = []
    const svcBlocks = findTopLevelBlocks(content, 'service')

    for (const { name, body } of svcBlocks) {
        const methods: ProtoFile['services'][number]['methods'] = []
        const rpcRegex =
            /rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w+)\s*\)\s*returns\s*\(\s*(stream\s+)?(\w+)\s*\)/g
        let rpcMatch
        while ((rpcMatch = rpcRegex.exec(body)) !== null) {
            methods.push({
                name: rpcMatch[1]!,
                inputType: rpcMatch[3]!,
                outputType: rpcMatch[5]!,
                clientStreaming: !!rpcMatch[2],
                serverStreaming: !!rpcMatch[4]
            })
        }
        services.push({ name, methods })
    }

    return services
}
