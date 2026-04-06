/** Token types for .proto file lexing. */
export const enum TokenType {
    // Keywords
    SYNTAX = 'syntax',
    EDITION = 'edition',
    MESSAGE = 'message',
    ENUM = 'enum',
    SERVICE = 'service',
    RPC = 'rpc',
    RETURNS = 'returns',
    IMPORT = 'import',
    PACKAGE = 'package',
    OPTION = 'option',
    ONEOF = 'oneof',
    MAP = 'map',
    REPEATED = 'repeated',
    OPTIONAL = 'optional',
    REQUIRED = 'required',
    RESERVED = 'reserved',
    EXTENSIONS = 'extensions',
    EXTEND = 'extend',
    GROUP = 'group',
    STREAM = 'stream',
    PUBLIC = 'public',
    WEAK = 'weak',
    TO = 'to',
    MAX = 'max',

    // Punctuation
    LBRACE = '{',
    RBRACE = '}',
    LPAREN = '(',
    RPAREN = ')',
    LBRACKET = '[',
    RBRACKET = ']',
    SEMICOLON = ';',
    EQUALS = '=',
    COMMA = ',',
    DOT = '.',
    LT = '<',
    GT = '>',
    SLASH = '/',
    MINUS = '-',
    PLUS = '+',
    COLON = ':',

    // Literals
    IDENT = 'IDENT',
    INT_LIT = 'INT_LIT',
    FLOAT_LIT = 'FLOAT_LIT',
    STRING_LIT = 'STRING_LIT',
    BOOL_LIT = 'BOOL_LIT',

    // Special
    EOF = 'EOF',
    COMMENT = 'COMMENT'
}

export interface Token {
    readonly type: TokenType
    readonly value: string
    readonly line: number
    readonly column: number
}

const KEYWORDS = new Map<string, TokenType>([
    ['syntax', TokenType.SYNTAX],
    ['edition', TokenType.EDITION],
    ['message', TokenType.MESSAGE],
    ['enum', TokenType.ENUM],
    ['service', TokenType.SERVICE],
    ['rpc', TokenType.RPC],
    ['returns', TokenType.RETURNS],
    ['import', TokenType.IMPORT],
    ['package', TokenType.PACKAGE],
    ['option', TokenType.OPTION],
    ['oneof', TokenType.ONEOF],
    ['map', TokenType.MAP],
    ['repeated', TokenType.REPEATED],
    ['optional', TokenType.OPTIONAL],
    ['required', TokenType.REQUIRED],
    ['reserved', TokenType.RESERVED],
    ['extensions', TokenType.EXTENSIONS],
    ['extend', TokenType.EXTEND],
    ['group', TokenType.GROUP],
    ['stream', TokenType.STREAM],
    ['public', TokenType.PUBLIC],
    ['weak', TokenType.WEAK],
    ['to', TokenType.TO],
    ['max', TokenType.MAX],
    ['true', TokenType.BOOL_LIT],
    ['false', TokenType.BOOL_LIT]
])

/** Look up a keyword token type from an identifier string. Returns undefined if not a keyword. */
export function lookupKeyword(ident: string): TokenType | undefined {
    return KEYWORDS.get(ident)
}
