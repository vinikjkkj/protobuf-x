// Lexer
export { TokenType, lookupKeyword, Tokenizer, LexerError } from './lexer/index.js'
export type { Token, TokenizerOptions } from './lexer/index.js'

// AST
export { FIELD_NUMBER_MAX, ProtoParser, ParseError, TypeResolver } from './ast/index.js'
export type {
    BaseNode,
    ProtoFileNode,
    MessageNode,
    FieldNode,
    FieldRule,
    EnumNode,
    EnumValueNode,
    ServiceNode,
    MethodNode,
    OneofNode,
    MapFieldNode,
    ImportNode,
    OptionNode,
    OptionValue,
    OptionAggregate,
    ReservedNode,
    ReservedRange,
    ExtensionsNode,
    ExtendNode,
    AstNode,
    UnresolvedReference,
    ResolveResult
} from './ast/index.js'

// Proto utilities
export {
    ProtoFile,
    ProtoLoader,
    parseProto,
    WELL_KNOWN_TYPES,
    isWellKnownType,
    getWellKnownType
} from './proto/index.js'
export type { LoaderOptions } from './proto/index.js'
