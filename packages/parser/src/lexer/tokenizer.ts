import { type Token, TokenType, lookupKeyword } from './tokens.js'

export class LexerError extends Error {
    constructor(
        message: string,
        public readonly line: number,
        public readonly column: number
    ) {
        super(`${message} at line ${line}, column ${column}`)
        this.name = 'LexerError'
    }
}

export interface TokenizerOptions {
    /** Whether to include comment tokens in the output. Default: false */
    includeComments?: boolean
}

/**
 * Tokenizer for proto2/proto3 .proto files.
 * Converts a source string into a stream of tokens.
 */
export class Tokenizer {
    private readonly source: string
    private readonly includeComments: boolean
    private pos = 0
    private line = 1
    private column = 1

    constructor(source: string, options?: TokenizerOptions) {
        this.source = source
        this.includeComments = options?.includeComments ?? false
    }

    /** Tokenize the entire source string and return an array of tokens. */
    tokenize(): Token[] {
        const tokens: Token[] = []
        while (true) {
            const token = this.nextToken()
            tokens.push(token)
            if (token.type === TokenType.EOF) break
        }
        return tokens
    }

    private peek(): string {
        return this.pos < this.source.length ? this.source[this.pos]! : ''
    }

    private peekAt(offset: number): string {
        const idx = this.pos + offset
        return idx < this.source.length ? this.source[idx]! : ''
    }

    private advance(): string {
        const ch = this.source[this.pos]!
        this.pos++
        if (ch === '\n') {
            this.line++
            this.column = 1
        } else {
            this.column++
        }
        return ch
    }

    private skipWhitespace(): void {
        while (this.pos < this.source.length) {
            const ch = this.peek()
            if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
                this.advance()
            } else {
                break
            }
        }
    }

    private makeToken(type: TokenType, value: string, line: number, column: number): Token {
        return { type, value, line, column }
    }

    private nextToken(): Token {
        this.skipWhitespace()

        if (this.pos >= this.source.length) {
            return this.makeToken(TokenType.EOF, '', this.line, this.column)
        }

        const line = this.line
        const column = this.column
        const ch = this.peek()

        // Comments
        if (ch === '/' && this.peekAt(1) === '/') {
            return this.readLineComment(line, column)
        }
        if (ch === '/' && this.peekAt(1) === '*') {
            return this.readBlockComment(line, column)
        }

        // String literals
        if (ch === '"' || ch === "'") {
            return this.readString(line, column)
        }

        // Number literals (including negative handled at parser level via MINUS token)
        if (isDigit(ch) || (ch === '.' && isDigit(this.peekAt(1)))) {
            return this.readNumber(line, column)
        }

        // Identifiers and keywords
        if (isIdentStart(ch)) {
            return this.readIdentOrKeyword(line, column)
        }

        // Single-character punctuation
        return this.readPunctuation(line, column)
    }

    private readLineComment(line: number, column: number): Token {
        // consume //
        this.advance()
        this.advance()
        let value = '//'
        while (this.pos < this.source.length && this.peek() !== '\n') {
            value += this.advance()
        }
        if (this.includeComments) {
            return this.makeToken(TokenType.COMMENT, value, line, column)
        }
        return this.nextToken()
    }

    private readBlockComment(line: number, column: number): Token {
        // consume /*
        this.advance()
        this.advance()
        let value = '/*'
        while (this.pos < this.source.length) {
            if (this.peek() === '*' && this.peekAt(1) === '/') {
                this.advance()
                this.advance()
                value += '*/'
                break
            }
            value += this.advance()
        }
        if (!value.endsWith('*/')) {
            throw new LexerError('Unterminated block comment', line, column)
        }
        if (this.includeComments) {
            return this.makeToken(TokenType.COMMENT, value, line, column)
        }
        return this.nextToken()
    }

    private readString(line: number, column: number): Token {
        const quote = this.advance() // consume opening quote
        let value = ''
        while (this.pos < this.source.length) {
            const ch = this.peek()
            if (ch === quote) {
                this.advance() // consume closing quote
                return this.makeToken(TokenType.STRING_LIT, value, line, column)
            }
            if (ch === '\\') {
                this.advance() // consume backslash
                if (this.pos >= this.source.length) {
                    throw new LexerError('Unterminated string escape', line, column)
                }
                const esc = this.advance()
                switch (esc) {
                    case 'n':
                        value += '\n'
                        break
                    case 'r':
                        value += '\r'
                        break
                    case 't':
                        value += '\t'
                        break
                    case '\\':
                        value += '\\'
                        break
                    case "'":
                        value += "'"
                        break
                    case '"':
                        value += '"'
                        break
                    case '0':
                        value += '\0'
                        break
                    case 'a':
                        value += '\x07'
                        break
                    case 'b':
                        value += '\b'
                        break
                    case 'f':
                        value += '\f'
                        break
                    case 'v':
                        value += '\v'
                        break
                    case 'x': {
                        let hex = ''
                        for (
                            let i = 0;
                            i < 2 && this.pos < this.source.length && isHexDigit(this.peek());
                            i++
                        ) {
                            hex += this.advance()
                        }
                        value += String.fromCharCode(parseInt(hex, 16))
                        break
                    }
                    default:
                        if (isOctDigit(esc)) {
                            let oct = esc
                            for (
                                let i = 0;
                                i < 2 && this.pos < this.source.length && isOctDigit(this.peek());
                                i++
                            ) {
                                oct += this.advance()
                            }
                            value += String.fromCharCode(parseInt(oct, 8))
                        } else {
                            value += esc
                        }
                }
            } else if (ch === '\n') {
                throw new LexerError('Unterminated string literal', line, column)
            } else {
                value += this.advance()
            }
        }
        throw new LexerError('Unterminated string literal', line, column)
    }

    private readNumber(startLine: number, startCol: number): Token {
        let value = ''
        let isFloat = false

        // Check for hex or octal prefix
        if (this.peek() === '0' && (this.peekAt(1) === 'x' || this.peekAt(1) === 'X')) {
            value += this.advance() // '0'
            value += this.advance() // 'x'
            while (this.pos < this.source.length && isHexDigit(this.peek())) {
                value += this.advance()
            }
            return this.makeToken(TokenType.INT_LIT, value, startLine, startCol)
        }

        // Read integer part (may be octal if starts with 0)
        while (this.pos < this.source.length && isDigit(this.peek())) {
            value += this.advance()
        }

        // Check for decimal point
        if (this.peek() === '.' && this.peekAt(1) !== '.') {
            isFloat = true
            value += this.advance() // '.'
            while (this.pos < this.source.length && isDigit(this.peek())) {
                value += this.advance()
            }
        }

        // Check for exponent
        if (this.peek() === 'e' || this.peek() === 'E') {
            isFloat = true
            value += this.advance()
            if (this.peek() === '+' || this.peek() === '-') {
                value += this.advance()
            }
            while (this.pos < this.source.length && isDigit(this.peek())) {
                value += this.advance()
            }
        }

        // Handle special float literals inf/nan at parser level (they are identifiers)

        return this.makeToken(
            isFloat ? TokenType.FLOAT_LIT : TokenType.INT_LIT,
            value,
            startLine,
            startCol
        )
    }

    private readIdentOrKeyword(line: number, column: number): Token {
        let value = ''
        while (this.pos < this.source.length && isIdentPart(this.peek())) {
            value += this.advance()
        }

        // Check for special float identifiers
        if (value === 'inf' || value === 'nan') {
            return this.makeToken(TokenType.FLOAT_LIT, value, line, column)
        }

        const keyword = lookupKeyword(value)
        if (keyword !== undefined) {
            return this.makeToken(keyword, value, line, column)
        }

        return this.makeToken(TokenType.IDENT, value, line, column)
    }

    private readPunctuation(line: number, column: number): Token {
        const ch = this.advance()
        switch (ch) {
            case '{':
                return this.makeToken(TokenType.LBRACE, ch, line, column)
            case '}':
                return this.makeToken(TokenType.RBRACE, ch, line, column)
            case '(':
                return this.makeToken(TokenType.LPAREN, ch, line, column)
            case ')':
                return this.makeToken(TokenType.RPAREN, ch, line, column)
            case '[':
                return this.makeToken(TokenType.LBRACKET, ch, line, column)
            case ']':
                return this.makeToken(TokenType.RBRACKET, ch, line, column)
            case ';':
                return this.makeToken(TokenType.SEMICOLON, ch, line, column)
            case '=':
                return this.makeToken(TokenType.EQUALS, ch, line, column)
            case ',':
                return this.makeToken(TokenType.COMMA, ch, line, column)
            case '.':
                return this.makeToken(TokenType.DOT, ch, line, column)
            case '<':
                return this.makeToken(TokenType.LT, ch, line, column)
            case '>':
                return this.makeToken(TokenType.GT, ch, line, column)
            case '/':
                return this.makeToken(TokenType.SLASH, ch, line, column)
            case '-':
                return this.makeToken(TokenType.MINUS, ch, line, column)
            case '+':
                return this.makeToken(TokenType.PLUS, ch, line, column)
            case ':':
                return this.makeToken(TokenType.COLON, ch, line, column)
            default:
                throw new LexerError(`Unexpected character '${ch}'`, line, column)
        }
    }
}

function isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9'
}

function isHexDigit(ch: string): boolean {
    return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')
}

function isOctDigit(ch: string): boolean {
    return ch >= '0' && ch <= '7'
}

function isIdentStart(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'
}

function isIdentPart(ch: string): boolean {
    return isIdentStart(ch) || isDigit(ch)
}
