export { CodeTemplate } from './template.js'
export type { ProtoField } from './field-codegen.js'
export {
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
    generateDecodeField
} from './field-codegen.js'
export type { ProtoMessage } from './message-codegen.js'
export { generateMessage } from './message-codegen.js'
export type { ProtoEnum } from './enum-codegen.js'
export { generateEnum, generateEnumNameMap, generateEnumNumberMap } from './enum-codegen.js'
export type { ProtoOneof } from './oneof-codegen.js'
export {
    generateOneofCaseEnum,
    generateOneofType,
    getOneofFieldDeclaration,
    generateOneofEncodeLines,
    generateOneofDecodeLines
} from './oneof-codegen.js'
export type { ProtoService, ProtoMethod } from './service-codegen.js'
export {
    generateService,
    generateServiceDescriptor,
    generateServiceClient
} from './service-codegen.js'
export type { ProtoFile, ProtoImport, TsGeneratorOptions } from './ts-generator.js'
export { generateTypeScript, getOutputPath } from './ts-generator.js'
export type { JsGeneratorResult } from './js-generator.js'
export { generateJavaScript, getJsOutputPaths } from './js-generator.js'
