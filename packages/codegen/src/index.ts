// High-level programmatic API (recommended for non-CLI usage)
export { generate, generateToDisk } from './api.js'
export type {
    GenerateOptions,
    GenerateResult,
    GeneratedFile,
    GenerateError,
    GenerateTarget,
    ProtoSource
} from './api.js'

export {
    // CLI
    parseArgs,
    validateArgs,
    getHelpText,
    ArgError,
    main
} from './cli/index.js'
export type { ParsedArgs } from './cli/index.js'

export {
    // Generator - template
    CodeTemplate,
    // Generator - field codegen
    computeTagBytes,
    getWireType,
    getTypeScriptType,
    getDefaultValue,
    getWriterMethod,
    getReaderMethod,
    isScalarType,
    scalarToTsType,
    is64BitLoHi,
    generateFieldDescriptor,
    generateEncodeField,
    generateDecodeField,
    // Generator - message
    generateMessage,
    // Generator - enum
    generateEnum,
    generateEnumNameMap,
    generateEnumNumberMap,
    // Generator - oneof
    generateOneofCaseEnum,
    generateOneofType,
    getOneofFieldDeclaration,
    generateOneofEncodeLines,
    generateOneofDecodeLines,
    // Generator - service
    generateService,
    generateServiceDescriptor,
    generateServiceClient,
    // Generator - ts
    generateTypeScript,
    getOutputPath,
    // Generator - js
    generateJavaScript,
    getJsOutputPaths
} from './generator/index.js'
export type {
    ProtoField,
    ProtoMessage,
    ProtoEnum,
    ProtoOneof,
    ProtoService,
    ProtoMethod,
    ProtoFile,
    ProtoImport,
    TsGeneratorOptions,
    JsGeneratorResult
} from './generator/index.js'

export {
    // Optimizer
    analyzeTreeShake,
    analyzeInlineCandidates,
    applyInlineOptimizations
} from './optimizer/index.js'
export type { TreeShakeResult, InlineCandidate } from './optimizer/index.js'
