import { existsSync } from 'node:fs'
import * as path from 'node:path'

import type {
    ExtendNode,
    EnumNode,
    FieldNode,
    MapFieldNode,
    MessageNode,
    MethodNode,
    OneofNode,
    OptionNode,
    ProtoFileNode,
    ReservedRange,
    ServiceNode
} from '../../../parser/src/ast/nodes.js'
import type { ProtoFile as ParsedProtoFile } from '../../../parser/src/proto/file.js'
import type { ProtoEnum } from '../generator/enum-codegen.js'
import type { ProtoExtensionGroup, ProtoRange } from '../generator/extension-codegen.js'
import type { ProtoField } from '../generator/field-codegen.js'
import type { ProtoMessage } from '../generator/message-codegen.js'
import type { ProtoOneof } from '../generator/oneof-codegen.js'
import type { ProtoMethod, ProtoService } from '../generator/service-codegen.js'
import type { ProtoFile } from '../generator/ts-generator.js'

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

const WELL_KNOWN_IMPORT_TYPES: Record<string, readonly string[]> = {
    'google/protobuf/any.proto': ['google.protobuf.Any'],
    'google/protobuf/duration.proto': ['google.protobuf.Duration'],
    'google/protobuf/empty.proto': ['google.protobuf.Empty'],
    'google/protobuf/field_mask.proto': ['google.protobuf.FieldMask'],
    'google/protobuf/struct.proto': [
        'google.protobuf.Struct',
        'google.protobuf.Value',
        'google.protobuf.ListValue',
        'google.protobuf.NullValue'
    ],
    'google/protobuf/timestamp.proto': ['google.protobuf.Timestamp'],
    'google/protobuf/wrappers.proto': [
        'google.protobuf.DoubleValue',
        'google.protobuf.FloatValue',
        'google.protobuf.Int64Value',
        'google.protobuf.UInt64Value',
        'google.protobuf.Int32Value',
        'google.protobuf.UInt32Value',
        'google.protobuf.BoolValue',
        'google.protobuf.StringValue',
        'google.protobuf.BytesValue'
    ]
}

export interface ParserModuleLike {
    ProtoLoader?: new (options?: { importPaths?: string[] }) => {
        loadAll(filePath: string): Map<string, ProtoFileNode>
    }
    parse?: (source: string) => unknown
    parseProto?: (source: string) => unknown
    WELL_KNOWN_TYPES?: ReadonlyMap<string, MessageNode | EnumNode>
}

export interface LoadedGeneratorFile {
    proto: ProtoFile
    virtualPath: string
}

interface SourceImport {
    path: string
    kind: 'default' | 'public' | 'weak'
    targetId?: string
}

interface SourceFileRecord {
    id: string
    virtualPath: string
    ast: ProtoFileNode
    imports: SourceImport[]
}

interface TypeDefinition {
    kind: 'message' | 'enum' | 'service'
    fullName: string
    generatedName: string
    pathParts: string[]
    fileId: string
    virtualPath: string
}

interface DefinitionIndex {
    definitions: ReadonlyMap<string, TypeDefinition>
}

interface ConversionContext {
    index: DefinitionIndex
    filesById: ReadonlyMap<string, SourceFileRecord>
}

export function loadGeneratorFilesFromGraph(
    filePath: string,
    importPaths: string[],
    parserModule: ParserModuleLike
): LoadedGeneratorFile[] {
    const Loader = parserModule.ProtoLoader
    if (!Loader) {
        throw new Error('Parser module does not expose ProtoLoader')
    }

    const rootAbs = path.resolve(filePath)
    const loader = new Loader({ importPaths })
    const loadedAsts = loader.loadAll(rootAbs)
    const files = buildSourceGraph(
        rootAbs,
        inferRootVirtualPath(filePath),
        loadedAsts,
        importPaths,
        parserModule.WELL_KNOWN_TYPES
    )
    const filesById = new Map(files.map((file) => [file.id, file]))
    const context: ConversionContext = {
        index: buildDefinitionIndex(files),
        filesById
    }

    return files.map((file) => ({
        virtualPath: file.virtualPath,
        proto: convertSourceFile(file, context)
    }))
}

export function normalizeProtoFile(proto: unknown): ProtoFile {
    if (isGeneratorProtoFile(proto)) {
        return proto
    }
    if (isParsedProtoFile(proto)) {
        return parsedProtoToGeneratorProto(proto)
    }
    throw new Error('Parser returned an unsupported proto representation')
}

function isGeneratorProtoFile(value: unknown): value is ProtoFile {
    if (typeof value !== 'object' || value === null) {
        return false
    }

    const proto = value as Partial<ProtoFile>
    return (
        typeof proto.syntax === 'string' &&
        typeof proto.packageName === 'string' &&
        Array.isArray(proto.imports) &&
        Array.isArray(proto.messages) &&
        Array.isArray(proto.enums) &&
        Array.isArray(proto.services)
    )
}

function isParsedProtoFile(value: unknown): value is ParsedProtoFile {
    if (typeof value !== 'object' || value === null) {
        return false
    }

    const proto = value as { ast?: Partial<ProtoFileNode> }
    return (
        typeof proto.ast === 'object' &&
        proto.ast !== null &&
        Array.isArray(proto.ast.messages) &&
        Array.isArray(proto.ast.enums) &&
        Array.isArray(proto.ast.services)
    )
}

function parsedProtoToGeneratorProto(proto: ParsedProtoFile): ProtoFile {
    const file: SourceFileRecord = {
        id: '@inline',
        virtualPath: 'inline.proto',
        ast: proto.ast,
        imports: proto.ast.imports.map((imp) => ({
            path: imp.path,
            kind: imp.modifier === 'none' ? 'default' : imp.modifier
        }))
    }
    const context: ConversionContext = {
        index: buildDefinitionIndex([file]),
        filesById: new Map([[file.id, file]])
    }
    return convertSourceFile(file, context)
}

function buildSourceGraph(
    rootAbs: string,
    rootVirtualPath: string,
    loadedAsts: ReadonlyMap<string, ProtoFileNode>,
    importPaths: readonly string[],
    wellKnownTypes: ReadonlyMap<string, MessageNode | EnumNode> | undefined
): SourceFileRecord[] {
    const files = new Map<string, SourceFileRecord>()
    const visiting = new Set<string>()

    const visit = (id: string, virtualPath: string): void => {
        if (files.has(id) || visiting.has(id)) {
            return
        }
        visiting.add(id)

        const ast = loadedAsts.get(id) ?? createWellKnownAst(virtualPath, wellKnownTypes)
        if (!ast) {
            visiting.delete(id)
            throw new Error(`Could not load proto graph node "${id}"`)
        }

        const imports: SourceImport[] = []
        const record: SourceFileRecord = {
            id,
            virtualPath,
            ast,
            imports
        }
        files.set(id, record)

        for (const imp of ast.imports) {
            const kind = imp.modifier === 'none' ? 'default' : imp.modifier
            const childVirtualPath = resolveVirtualImportPath(virtualPath, imp.path)
            const resolved = resolveImportPath(imp.path, id, importPaths)
            if (resolved && loadedAsts.has(resolved)) {
                imports.push({ path: imp.path, kind, targetId: resolved })
                visit(resolved, childVirtualPath)
                continue
            }

            const wellKnownId = wellKnownFileId(childVirtualPath)
            if (createWellKnownAst(childVirtualPath, wellKnownTypes)) {
                imports.push({ path: imp.path, kind, targetId: wellKnownId })
                visit(wellKnownId, childVirtualPath)
                continue
            }

            imports.push({ path: imp.path, kind })
        }

        visiting.delete(id)
    }

    visit(rootAbs, rootVirtualPath)
    return [...files.values()]
}

function buildDefinitionIndex(files: readonly SourceFileRecord[]): DefinitionIndex {
    const definitions = new Map<string, TypeDefinition>()

    for (const file of files) {
        const usedNames = new Set<string>()
        const pkg = file.ast.package

        const registerEnum = (protoEnum: EnumNode, parents: readonly string[] = []): void => {
            const pathParts = [...parents, protoEnum.name]
            const fullName = qualifyName(pkg, pathParts)
            definitions.set(fullName, {
                kind: 'enum',
                fullName,
                generatedName: uniqueGeneratedName(pathParts.join('_'), usedNames),
                pathParts,
                fileId: file.id,
                virtualPath: file.virtualPath
            })
        }

        const registerMessage = (message: MessageNode, parents: readonly string[] = []): void => {
            const pathParts = [...parents, message.name]
            const fullName = qualifyName(pkg, pathParts)
            definitions.set(fullName, {
                kind: 'message',
                fullName,
                generatedName: uniqueGeneratedName(pathParts.join('_'), usedNames),
                pathParts,
                fileId: file.id,
                virtualPath: file.virtualPath
            })

            for (const nestedEnum of message.nestedEnums) {
                registerEnum(nestedEnum, pathParts)
            }
            for (const nested of message.nestedMessages) {
                registerMessage(nested, pathParts)
            }
        }

        for (const protoEnum of file.ast.enums) {
            registerEnum(protoEnum)
        }
        for (const message of file.ast.messages) {
            registerMessage(message)
        }
        for (const service of file.ast.services) {
            const pathParts = [service.name]
            const fullName = qualifyName(pkg, pathParts)
            definitions.set(fullName, {
                kind: 'service',
                fullName,
                generatedName: uniqueGeneratedName(service.name, usedNames),
                pathParts,
                fileId: file.id,
                virtualPath: file.virtualPath
            })
        }
    }

    return { definitions }
}

function convertSourceFile(file: SourceFileRecord, context: ConversionContext): ProtoFile {
    const usedImports = new Set<string>()

    const proto: ProtoFile = {
        syntax: file.ast.syntax,
        packageName: file.ast.package,
        imports: [],
        options: Object.fromEntries(
            file.ast.options.map((opt) => [opt.name, optionValueToString(opt)])
        ),
        messages: file.ast.messages.map((message) =>
            convertMessageNode(message, [], file, context, usedImports)
        ),
        enums: file.ast.enums.map((protoEnum) => convertEnumNode(protoEnum, [], file, context)),
        services: file.ast.services.map((service) =>
            convertServiceNode(service, file, context, usedImports)
        ),
        extensions: collectExtensionGroups(file, context, usedImports)
    }

    proto.imports = [...usedImports]
        .sort()
        .map((importPath) => ({ path: importPath, kind: 'default' as const }))

    return proto
}

function convertMessageNode(
    message: MessageNode,
    parents: readonly string[],
    file: SourceFileRecord,
    context: ConversionContext,
    usedImports: Set<string>
): ProtoMessage {
    const currentPath = [...parents, message.name]
    const fullName = qualifyName(file.ast.package, currentPath)
    const definition = expectDefinition(context.index, fullName, 'message')
    const regularFields = message.fields.map((field) =>
        convertFieldNode(field, currentPath, file, context, usedImports)
    )
    const oneofs = message.oneofs.map((oneof) =>
        convertOneofNode(oneof, currentPath, file, context, usedImports)
    )
    const oneofFields = oneofs.flatMap((oneof) => oneof.fields)
    const mapFields = message.mapFields.map((field) =>
        convertMapFieldNode(field, currentPath, file, context, usedImports)
    )

    return {
        name: message.name,
        generatedName: definition.generatedName,
        fullName,
        reservedRanges: flattenReservedRanges(message.reserved),
        reservedNames: flattenReservedNames(message.reserved),
        extensionRanges: flattenRanges(message.extensions),
        fields: [...regularFields, ...oneofFields, ...mapFields],
        oneofs,
        nestedMessages: message.nestedMessages.map((nested) =>
            convertMessageNode(nested, currentPath, file, context, usedImports)
        ),
        nestedEnums: message.nestedEnums.map((protoEnum) =>
            convertEnumNode(protoEnum, currentPath, file, context)
        )
    }
}

function convertOneofNode(
    oneof: OneofNode,
    scopeParts: readonly string[],
    file: SourceFileRecord,
    context: ConversionContext,
    usedImports: Set<string>
): ProtoOneof {
    return {
        name: oneof.name,
        fields: oneof.fields.map((field) => ({
            ...convertFieldNode(field, scopeParts, file, context, usedImports),
            oneofName: oneof.name
        }))
    }
}

function convertFieldNode(
    field: FieldNode,
    scopeParts: readonly string[],
    file: SourceFileRecord,
    context: ConversionContext,
    usedImports: Set<string>
): ProtoField {
    const resolved = resolveTypeReference(field.type, scopeParts, file, context.index)
    const label = field.rule ?? 'optional'
    const jsonName = getStringOption(field.options, 'json_name') ?? toCamelCase(field.name)
    const typeExpr = resolved ? typeExpressionFor(resolved, file, usedImports) : undefined

    return {
        name: field.name,
        number: field.number,
        type: field.type,
        typeExpr,
        resolvedType: resolved?.fullName,
        label,
        isMessage: resolved?.kind === 'message',
        isGroup: field.isGroup === true,
        isEnum: resolved?.kind === 'enum',
        packed: isPackedField(field, file.ast.syntax),
        hasPresence: hasExplicitPresence(field, file.ast.syntax, resolved?.kind === 'message'),
        isRequired: field.rule === 'required',
        jsonName,
        defaultValueExpr: getDefaultValueExpression(
            field.options,
            field.type,
            typeExpr,
            resolved?.kind
        )
    }
}

function convertMapFieldNode(
    field: MapFieldNode,
    scopeParts: readonly string[],
    file: SourceFileRecord,
    context: ConversionContext,
    usedImports: Set<string>
): ProtoField {
    const resolved = isScalarType(field.valueType)
        ? undefined
        : resolveTypeReference(field.valueType, scopeParts, file, context.index)
    const mapValueTypeExpr = resolved ? typeExpressionFor(resolved, file, usedImports) : undefined

    return {
        name: field.name,
        number: field.number,
        type: 'bytes',
        label: 'optional',
        mapKeyType: field.keyType,
        mapValueType: field.valueType,
        mapValueTypeExpr,
        mapValueResolvedType: resolved?.fullName,
        mapValueIsEnum: resolved?.kind === 'enum',
        mapValueIsMessage: resolved?.kind === 'message',
        jsonName: getStringOption(field.options, 'json_name') ?? toCamelCase(field.name)
    }
}

function convertEnumNode(
    protoEnum: EnumNode,
    parents: readonly string[],
    file: SourceFileRecord,
    context: ConversionContext
): ProtoEnum {
    const pathParts = [...parents, protoEnum.name]
    const fullName = qualifyName(file.ast.package, pathParts)
    const definition = expectDefinition(context.index, fullName, 'enum')
    return {
        name: protoEnum.name,
        generatedName: definition.generatedName,
        fullName,
        reservedRanges: flattenReservedRanges(protoEnum.reserved),
        reservedNames: flattenReservedNames(protoEnum.reserved),
        values: protoEnum.values.map((value) => ({ name: value.name, number: value.number }))
    }
}

function convertServiceNode(
    service: ServiceNode,
    file: SourceFileRecord,
    context: ConversionContext,
    usedImports: Set<string>
): ProtoService {
    const fullName = qualifyName(file.ast.package, [service.name])
    return {
        name: service.name,
        fullName,
        methods: service.methods.map((method) =>
            convertMethodNode(method, file, context, usedImports)
        )
    }
}

function convertMethodNode(
    method: MethodNode,
    file: SourceFileRecord,
    context: ConversionContext,
    usedImports: Set<string>
): ProtoMethod {
    const input = resolveTypeReference(method.inputType, [], file, context.index)
    const output = resolveTypeReference(method.outputType, [], file, context.index)

    return {
        name: method.name,
        inputType: method.inputType,
        outputType: method.outputType,
        inputTypeExpr: input ? typeExpressionFor(input, file, usedImports) : method.inputType,
        outputTypeExpr: output ? typeExpressionFor(output, file, usedImports) : method.outputType,
        inputResolvedType: input?.fullName ?? method.inputType,
        outputResolvedType: output?.fullName ?? method.outputType,
        clientStreaming: method.clientStreaming,
        serverStreaming: method.serverStreaming
    }
}

function collectExtensionGroups(
    file: SourceFileRecord,
    context: ConversionContext,
    usedImports: Set<string>
): ProtoExtensionGroup[] {
    const groups = new Map<string, ProtoExtensionGroup>()

    const addExtendBlock = (extendNode: ExtendNode, scopeParts: readonly string[]): void => {
        const target = resolveTypeReference(extendNode.typeName, scopeParts, file, context.index)
        if (!target || target.kind !== 'message') {
            throw new Error(`Could not resolve extendee "${extendNode.typeName}" as a message`)
        }

        const groupName = `${target.generatedName}Extensions`
        const existing = groups.get(target.fullName)
        const group = existing ?? {
            name: groupName,
            extendee: target.fullName,
            extendeeExpr: typeExpressionFor(target, file, usedImports),
            fields: []
        }

        for (const field of extendNode.fields) {
            group.fields.push(convertFieldNode(field, scopeParts, file, context, usedImports))
        }

        groups.set(target.fullName, group)
    }

    const walkMessage = (message: MessageNode, scopeParts: readonly string[]): void => {
        const currentPath = [...scopeParts, message.name]
        for (const extendNode of message.extends) {
            addExtendBlock(extendNode, currentPath)
        }
        for (const nested of message.nestedMessages) {
            walkMessage(nested, currentPath)
        }
    }

    for (const extendNode of file.ast.extends) {
        addExtendBlock(extendNode, [])
    }
    for (const message of file.ast.messages) {
        walkMessage(message, [])
    }

    return [...groups.values()]
}

function resolveTypeReference(
    typeName: string,
    scopeParts: readonly string[],
    file: SourceFileRecord,
    index: DefinitionIndex
): TypeDefinition | undefined {
    if (isScalarType(typeName)) {
        return undefined
    }

    const normalized = typeName.startsWith('.') ? typeName.slice(1) : typeName
    if (typeName.startsWith('.')) {
        return index.definitions.get(normalized)
    }

    if (index.definitions.has(normalized)) {
        return index.definitions.get(normalized)
    }

    const pkgParts = file.ast.package === '' ? [] : file.ast.package.split('.')
    for (let i = scopeParts.length; i >= 0; i--) {
        const candidateParts = [...pkgParts, ...scopeParts.slice(0, i)]
        const candidate = qualifyNameParts(candidateParts, normalized)
        const resolved = index.definitions.get(candidate)
        if (resolved) {
            return resolved
        }
    }

    throw new Error(
        `Could not resolve type "${typeName}" referenced from "${qualifyName(file.ast.package, scopeParts)}"`
    )
}

function typeExpressionFor(
    definition: TypeDefinition,
    currentFile: SourceFileRecord,
    usedImports: Set<string>
): string {
    if (definition.fileId === currentFile.id) {
        return definition.generatedName
    }

    const relativeImport = relativeProtoImportPath(currentFile.virtualPath, definition.virtualPath)
    usedImports.add(relativeImport)
    return `${importAlias(relativeImport)}.${definition.generatedName}`
}

function expectDefinition(
    index: DefinitionIndex,
    fullName: string,
    expectedKind: TypeDefinition['kind']
): TypeDefinition {
    const definition = index.definitions.get(fullName)
    if (!definition || definition.kind !== expectedKind) {
        throw new Error(`Missing ${expectedKind} definition for "${fullName}"`)
    }
    return definition
}

function hasExplicitPresence(
    field: FieldNode,
    syntax: ProtoFile['syntax'],
    isMessage: boolean
): boolean {
    if (field.rule === 'required') {
        return true
    }
    if (field.rule === 'repeated') {
        return false
    }
    if (isMessage) {
        return true
    }
    if (syntax === 'proto2') {
        return true
    }
    return field.rule === 'optional'
}

function getDefaultValueExpression(
    options: readonly OptionNode[],
    protoType: string,
    typeExpr: string | undefined,
    kind: 'message' | 'enum' | 'service' | undefined
): string | undefined {
    const option = getOption(options, 'default')
    if (!option) {
        return undefined
    }

    const value = option.value
    if (kind === 'enum') {
        if (typeof value === 'string') {
            return typeExpr ? `${typeExpr}.${value}` : JSON.stringify(value)
        }
        if (typeof value === 'number') {
            return `${value}`
        }
        return undefined
    }

    if (kind === 'message') {
        return undefined
    }

    switch (protoType) {
        case 'bool':
            return value === true ? 'true' : value === false ? 'false' : undefined
        case 'string':
            return typeof value === 'string' ? JSON.stringify(value) : undefined
        case 'bytes':
            if (typeof value !== 'string') {
                return undefined
            }
            return `new Uint8Array([${[...Buffer.from(value)].join(', ')}])`
        case 'int64':
        case 'uint64':
        case 'sint64':
        case 'fixed64':
        case 'sfixed64':
            if (typeof value === 'number') {
                return `${Math.trunc(value)}n`
            }
            return typeof value === 'string' && /^[-+]?\d+$/.test(value) ? `${value}n` : undefined
        case 'double':
        case 'float':
        case 'int32':
        case 'uint32':
        case 'sint32':
        case 'fixed32':
        case 'sfixed32':
            return typeof value === 'number' ? `${value}` : undefined
        default:
            return undefined
    }
}

function flattenRanges(nodes: ReadonlyArray<{ ranges: readonly ReservedRange[] }>): ProtoRange[] {
    return nodes.flatMap((node) => node.ranges.map((range) => ({ from: range.from, to: range.to })))
}

function flattenReservedRanges(
    nodes: ReadonlyArray<{ ranges: readonly ReservedRange[] }>
): ProtoRange[] {
    return flattenRanges(nodes)
}

function flattenReservedNames(nodes: ReadonlyArray<{ names: readonly string[] }>): string[] {
    return nodes.flatMap((node) => [...node.names])
}

function getOption(options: readonly OptionNode[], name: string): OptionNode | undefined {
    return options.find((option) => option.name === name)
}

function getBooleanOption(options: readonly OptionNode[], name: string): boolean | undefined {
    const option = getOption(options, name)
    return typeof option?.value === 'boolean' ? option.value : undefined
}

function getStringOption(options: readonly OptionNode[], name: string): string | undefined {
    const option = getOption(options, name)
    return typeof option?.value === 'string' ? option.value : undefined
}

function isPackedField(field: FieldNode, syntax: ProtoFile['syntax']): boolean {
    if (
        field.rule !== 'repeated' ||
        !SCALAR_TYPES.has(field.type) ||
        field.type === 'string' ||
        field.type === 'bytes'
    ) {
        return false
    }

    const packed = getBooleanOption(field.options, 'packed')
    if (packed !== undefined) {
        return packed
    }

    return syntax === 'proto3'
}

function resolveImportPath(
    importPath: string,
    fromFileId: string,
    importPaths: readonly string[]
): string | undefined {
    if (fromFileId.startsWith('@wkt:')) {
        return undefined
    }

    const fileDir = path.dirname(fromFileId)
    const relativeCandidate = path.resolve(fileDir, importPath)
    if (pathExists(relativeCandidate)) {
        return relativeCandidate
    }

    for (const importDir of importPaths) {
        const candidate = path.resolve(importDir, importPath)
        if (pathExists(candidate)) {
            return candidate
        }
    }

    return undefined
}

function pathExists(candidate: string): boolean {
    return existsSync(candidate)
}

function createWellKnownAst(
    virtualPath: string,
    wellKnownTypes: ReadonlyMap<string, MessageNode | EnumNode> | undefined
): ProtoFileNode | undefined {
    const typeNames = WELL_KNOWN_IMPORT_TYPES[virtualPath]
    if (!typeNames || !wellKnownTypes) {
        return undefined
    }

    const messages: MessageNode[] = []
    const enums: EnumNode[] = []
    for (const typeName of typeNames) {
        const node = wellKnownTypes.get(typeName)
        if (!node) {
            continue
        }
        if (node.kind === 'message') {
            messages.push(node)
        } else {
            enums.push(node)
        }
    }

    return {
        kind: 'file',
        syntax: 'proto3',
        package: 'google.protobuf',
        imports: [],
        options: [],
        messages,
        enums,
        services: [],
        extends: [],
        line: 0,
        column: 0
    }
}

function wellKnownFileId(virtualPath: string): string {
    return `@wkt:${virtualPath}`
}

function inferRootVirtualPath(requestedPath: string): string {
    const absolutePath = path.resolve(requestedPath)
    const fromCwd = path.relative(process.cwd(), absolutePath)
    if (fromCwd !== '' && !fromCwd.startsWith('..') && !path.isAbsolute(fromCwd)) {
        return normalizeVirtualPath(fromCwd)
    }
    if (!path.isAbsolute(requestedPath)) {
        return normalizeVirtualPath(requestedPath)
    }
    return normalizeVirtualPath(path.basename(absolutePath))
}

function resolveVirtualImportPath(currentVirtualPath: string, importPath: string): string {
    const normalizedImport = normalizeVirtualPath(importPath)
    if (normalizedImport.startsWith('.')) {
        const currentDir = path.posix.dirname(currentVirtualPath)
        return path.posix.normalize(path.posix.join(currentDir, normalizedImport))
    }
    return normalizedImport
}

function relativeProtoImportPath(fromVirtualPath: string, toVirtualPath: string): string {
    const fromDir = path.posix.dirname(fromVirtualPath)
    let relativePath = path.posix.relative(fromDir, toVirtualPath)
    if (!relativePath.startsWith('.')) {
        relativePath = `./${relativePath}`
    }
    return relativePath
}

function importAlias(protoPath: string): string {
    return protoPath.replace(/\.proto$/, '').replace(/[^a-zA-Z0-9]/g, '_') + '_pb'
}

function normalizeVirtualPath(value: string): string {
    return value.replace(/\\/g, '/')
}

function qualifyName(pkg: string, parts: readonly string[]): string {
    return pkg === '' ? parts.join('.') : `${pkg}.${parts.join('.')}`
}

function qualifyNameParts(prefixParts: readonly string[], suffix: string): string {
    return prefixParts.length === 0 ? suffix : `${prefixParts.join('.')}.${suffix}`
}

function uniqueGeneratedName(baseName: string, usedNames: Set<string>): string {
    let candidate = baseName
    let suffix = 2
    while (usedNames.has(candidate)) {
        candidate = `${baseName}_${suffix}`
        suffix++
    }
    usedNames.add(candidate)
    return candidate
}

function isScalarType(typeName: string): boolean {
    return SCALAR_TYPES.has(typeName)
}

function optionValueToString(option: OptionNode): string {
    return typeof option.value === 'string' ? option.value : JSON.stringify(option.value)
}

function toCamelCase(name: string): string {
    return name.replace(/_([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
}

export interface BasicDefinedTypes {
    messages: Set<string>
    enums: Set<string>
}

export function collectDefinedTypes(ast: ProtoFileNode): BasicDefinedTypes {
    const types: BasicDefinedTypes = {
        messages: new Set<string>(),
        enums: new Set<string>()
    }

    const registerMessage = (message: MessageNode, parents: string[] = []) => {
        const scoped = [...parents, message.name]
        registerTypeNames(types.messages, scoped, ast.package)
        for (const nestedEnum of message.nestedEnums) {
            registerEnum(nestedEnum, scoped)
        }
        for (const nested of message.nestedMessages) {
            registerMessage(nested, scoped)
        }
    }

    const registerEnum = (protoEnum: EnumNode, parents: string[] = []) => {
        registerTypeNames(types.enums, [...parents, protoEnum.name], ast.package)
    }

    for (const message of ast.messages) {
        registerMessage(message)
    }
    for (const protoEnum of ast.enums) {
        registerEnum(protoEnum)
    }

    return types
}

export function classifyType(
    typeName: string,
    types: BasicDefinedTypes
): 'message' | 'enum' | 'unknown' {
    if (SCALAR_TYPES.has(typeName)) {
        return 'unknown'
    }

    const normalized = typeName.startsWith('.') ? typeName.slice(1) : typeName
    if (types.messages.has(normalized)) {
        return 'message'
    }
    if (types.enums.has(normalized)) {
        return 'enum'
    }

    const lastSegment = normalized.split('.').pop() ?? normalized
    if (types.messages.has(lastSegment)) {
        return 'message'
    }
    if (types.enums.has(lastSegment)) {
        return 'enum'
    }

    return /^[A-Z]/.test(lastSegment) ? 'message' : 'unknown'
}

function registerTypeNames(target: Set<string>, parts: string[], pkg: string): void {
    const scoped = parts.join('.')
    target.add(parts[parts.length - 1]!)
    target.add(scoped)
    if (pkg !== '') {
        target.add(`${pkg}.${scoped}`)
    }
}
