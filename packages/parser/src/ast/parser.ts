import { Tokenizer } from '../lexer/tokenizer.js'
import { type Token, TokenType } from '../lexer/tokens.js'

import type {
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
    ExtendNode
} from './nodes.js'
import { FIELD_NUMBER_MAX } from './nodes.js'

export class ParseError extends Error {
    constructor(
        message: string,
        public readonly line: number,
        public readonly column: number
    ) {
        super(`${message} at line ${line}, column ${column}`)
        this.name = 'ParseError'
    }
}

/**
 * Recursive descent parser for .proto files.
 * Converts a token stream into an AST.
 */
export class ProtoParser {
    private tokens: Token[] = []
    private pos = 0

    /** Parse a .proto source string into a ProtoFileNode. */
    parse(source: string): ProtoFileNode {
        const tokenizer = new Tokenizer(source)
        this.tokens = tokenizer.tokenize()
        this.pos = 0
        return this.parseFile()
    }

    /** Parse from a pre-existing token array. */
    parseTokens(tokens: Token[]): ProtoFileNode {
        this.tokens = tokens
        this.pos = 0
        return this.parseFile()
    }

    // ── helpers ────────────────────────────────────────────────

    private current(): Token {
        return this.tokens[this.pos] ?? this.eofToken()
    }

    private eofToken(): Token {
        return { type: TokenType.EOF, value: '', line: 0, column: 0 }
    }

    private peek(): Token {
        return this.current()
    }

    private advance(): Token {
        const tok = this.current()
        this.pos++
        return tok
    }

    private expect(type: TokenType, value?: string): Token {
        const tok = this.advance()
        if (tok.type !== type || (value !== undefined && tok.value !== value)) {
            throw new ParseError(
                `Expected ${value !== undefined ? `'${value}'` : type} but got '${tok.value}' (${tok.type})`,
                tok.line,
                tok.column
            )
        }
        return tok
    }

    private check(type: TokenType, value?: string): boolean {
        const tok = this.peek()
        return tok.type === type && (value === undefined || tok.value === value)
    }

    private match(type: TokenType, value?: string): Token | undefined {
        if (this.check(type, value)) {
            return this.advance()
        }
        return undefined
    }

    // ── file ───────────────────────────────────────────────────

    private parseFile(): ProtoFileNode {
        const tok = this.peek()
        let syntax: 'proto2' | 'proto3' = 'proto2'
        let edition: string | undefined
        let pkg = ''
        const imports: ImportNode[] = []
        const options: OptionNode[] = []
        const messages: MessageNode[] = []
        const enums: EnumNode[] = []
        const services: ServiceNode[] = []
        const extends_: ExtendNode[] = []

        while (!this.check(TokenType.EOF)) {
            const cur = this.peek()
            switch (cur.type) {
                case TokenType.SYNTAX:
                    syntax = this.parseSyntax()
                    break
                case TokenType.EDITION: {
                    edition = this.parseEdition()
                    // Edition 2023 behaves like proto3 with implicit presence
                    syntax = 'proto3'
                    break
                }
                case TokenType.PACKAGE:
                    pkg = this.parsePackage()
                    break
                case TokenType.IMPORT:
                    imports.push(this.parseImport())
                    break
                case TokenType.OPTION:
                    options.push(this.parseOptionStatement())
                    break
                case TokenType.MESSAGE:
                    messages.push(this.parseMessage())
                    break
                case TokenType.ENUM:
                    enums.push(this.parseEnum())
                    break
                case TokenType.SERVICE:
                    services.push(this.parseService())
                    break
                case TokenType.EXTEND:
                    extends_.push(this.parseExtend())
                    break
                case TokenType.SEMICOLON:
                    // empty statement
                    this.advance()
                    break
                default:
                    throw new ParseError(`Unexpected token '${cur.value}'`, cur.line, cur.column)
            }
        }

        const result: ProtoFileNode = {
            kind: 'file',
            syntax,
            ...(edition !== undefined ? { edition } : {}),
            package: pkg,
            imports,
            options,
            messages,
            enums,
            services,
            extends: extends_,
            line: tok.line,
            column: tok.column
        }
        return result
    }

    // ── syntax ─────────────────────────────────────────────────

    private parseSyntax(): 'proto2' | 'proto3' {
        this.expect(TokenType.SYNTAX)
        this.expect(TokenType.EQUALS)
        const tok = this.expect(TokenType.STRING_LIT)
        this.expect(TokenType.SEMICOLON)
        if (tok.value !== 'proto2' && tok.value !== 'proto3') {
            throw new ParseError(`Unsupported syntax '${tok.value}'`, tok.line, tok.column)
        }
        return tok.value
    }

    // ── edition ────────────────────────────────────────────────

    private parseEdition(): string {
        this.expect(TokenType.EDITION)
        this.expect(TokenType.EQUALS)
        const tok = this.expect(TokenType.STRING_LIT)
        this.expect(TokenType.SEMICOLON)
        return tok.value
    }

    // ── package ────────────────────────────────────────────────

    private parsePackage(): string {
        this.expect(TokenType.PACKAGE)
        const name = this.parseFullIdent()
        this.expect(TokenType.SEMICOLON)
        return name
    }

    // ── import ─────────────────────────────────────────────────

    private parseImport(): ImportNode {
        const tok = this.expect(TokenType.IMPORT)
        let modifier: 'public' | 'weak' | 'none' = 'none'
        if (this.match(TokenType.PUBLIC)) {
            modifier = 'public'
        } else if (this.match(TokenType.WEAK)) {
            modifier = 'weak'
        }
        const path = this.expect(TokenType.STRING_LIT)
        this.expect(TokenType.SEMICOLON)
        return { kind: 'import', path: path.value, modifier, line: tok.line, column: tok.column }
    }

    // ── option ─────────────────────────────────────────────────

    private parseOptionStatement(): OptionNode {
        const tok = this.expect(TokenType.OPTION)
        const { name, value } = this.parseOptionNameValue()
        this.expect(TokenType.SEMICOLON)
        return { kind: 'option', name, value, line: tok.line, column: tok.column }
    }

    private parseOptionNameValue(): { name: string; value: OptionValue } {
        const name = this.parseOptionName()
        this.expect(TokenType.EQUALS)
        const value = this.parseOptionValue()
        return { name, value }
    }

    private parseOptionName(): string {
        let name = ''
        if (this.match(TokenType.LPAREN)) {
            name = '(' + this.parseFullIdent() + ')'
            this.expect(TokenType.RPAREN)
        } else {
            name = this.expectIdent()
        }
        while (this.match(TokenType.DOT)) {
            name += '.' + this.expectIdent()
        }
        return name
    }

    private parseOptionValue(): OptionValue {
        const tok = this.peek()

        if (tok.type === TokenType.STRING_LIT) {
            this.advance()
            return tok.value
        }
        if (tok.type === TokenType.BOOL_LIT) {
            this.advance()
            return tok.value === 'true'
        }
        if (tok.type === TokenType.INT_LIT) {
            this.advance()
            return this.parseIntValue(tok.value)
        }
        if (tok.type === TokenType.FLOAT_LIT) {
            this.advance()
            return parseFloat(tok.value)
        }
        if (tok.type === TokenType.MINUS) {
            this.advance()
            const next = this.advance()
            if (next.type === TokenType.INT_LIT) {
                return -this.parseIntValue(next.value)
            }
            if (next.type === TokenType.FLOAT_LIT) {
                return -parseFloat(next.value)
            }
            throw new ParseError("Expected number after '-'", next.line, next.column)
        }
        if (tok.type === TokenType.PLUS) {
            this.advance()
            const next = this.advance()
            if (next.type === TokenType.INT_LIT) {
                return this.parseIntValue(next.value)
            }
            if (next.type === TokenType.FLOAT_LIT) {
                return parseFloat(next.value)
            }
            throw new ParseError("Expected number after '+'", next.line, next.column)
        }
        if (tok.type === TokenType.LBRACE) {
            return this.parseAggregateValue()
        }
        // Identifier used as enum value constant
        if (tok.type === TokenType.IDENT) {
            this.advance()
            return tok.value
        }

        throw new ParseError(`Unexpected option value '${tok.value}'`, tok.line, tok.column)
    }

    private parseAggregateValue(): OptionAggregate {
        this.expect(TokenType.LBRACE)
        const result: Record<string, OptionValue | OptionValue[]> = {}
        while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
            const key = this.expectIdent()
            // Aggregate fields can use : or nothing before the value
            this.match(TokenType.COLON)
            const val = this.parseOptionValue()
            const existing = result[key]
            if (existing !== undefined) {
                if (Array.isArray(existing)) {
                    existing.push(val)
                } else {
                    result[key] = [existing, val]
                }
            } else {
                result[key] = val
            }
            // optional separator
            this.match(TokenType.COMMA) || this.match(TokenType.SEMICOLON)
        }
        this.expect(TokenType.RBRACE)
        return result
    }

    private parseIntValue(raw: string): number {
        if (raw.startsWith('0x') || raw.startsWith('0X')) {
            return parseInt(raw, 16)
        }
        if (raw.length > 1 && raw.startsWith('0')) {
            return parseInt(raw, 8)
        }
        return parseInt(raw, 10)
    }

    // ── message ────────────────────────────────────────────────

    private parseMessage(): MessageNode {
        const tok = this.expect(TokenType.MESSAGE)
        const name = this.expectIdent()
        this.expect(TokenType.LBRACE)

        const members = this.parseMessageMembers()
        this.expect(TokenType.RBRACE)

        return {
            kind: 'message',
            name,
            ...members,
            line: tok.line,
            column: tok.column
        }
    }

    private parseMessageMembers(): Omit<MessageNode, 'kind' | 'name' | 'line' | 'column'> {
        const fields: FieldNode[] = []
        const nestedMessages: MessageNode[] = []
        const nestedEnums: EnumNode[] = []
        const oneofs: OneofNode[] = []
        const mapFields: MapFieldNode[] = []
        const reserved: ReservedNode[] = []
        const options: OptionNode[] = []
        const extensions: ExtensionsNode[] = []
        const extends_: ExtendNode[] = []

        while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
            const cur = this.peek()
            switch (cur.type) {
                case TokenType.MESSAGE:
                    nestedMessages.push(this.parseMessage())
                    break
                case TokenType.GROUP: {
                    const group = this.parseGroupField()
                    fields.push(group.field)
                    nestedMessages.push(group.message)
                    break
                }
                case TokenType.ENUM:
                    nestedEnums.push(this.parseEnum())
                    break
                case TokenType.ONEOF:
                    oneofs.push(this.parseOneof())
                    break
                case TokenType.MAP:
                    mapFields.push(this.parseMapField())
                    break
                case TokenType.RESERVED:
                    reserved.push(this.parseReserved())
                    break
                case TokenType.EXTENSIONS:
                    extensions.push(this.parseExtensions())
                    break
                case TokenType.EXTEND:
                    extends_.push(this.parseExtend())
                    break
                case TokenType.OPTION:
                    options.push(this.parseOptionStatement())
                    break
                case TokenType.REPEATED:
                case TokenType.OPTIONAL:
                case TokenType.REQUIRED: {
                    const member = this.parseFieldMember()
                    fields.push(member.field)
                    if (member.message) {
                        nestedMessages.push(member.message)
                    }
                    break
                }
                case TokenType.SEMICOLON:
                    this.advance()
                    break
                default:
                    // Could be a field without rule (proto3) or a type name
                    if (this.isTypeStart(cur)) {
                        const member = this.parseFieldMember()
                        fields.push(member.field)
                        if (member.message) {
                            nestedMessages.push(member.message)
                        }
                    } else {
                        throw new ParseError(
                            `Unexpected token '${cur.value}' in message body`,
                            cur.line,
                            cur.column
                        )
                    }
            }
        }

        return {
            fields,
            nestedMessages,
            nestedEnums,
            oneofs,
            mapFields,
            reserved,
            options,
            extensions,
            extends: extends_
        }
    }

    // ── field ──────────────────────────────────────────────────

    private parseField(): FieldNode {
        return this.parseFieldMember().field
    }

    private parseFieldMember(): { field: FieldNode; message?: MessageNode } {
        const startTok = this.peek()
        let rule: FieldRule | undefined

        if (this.check(TokenType.REPEATED)) {
            rule = 'repeated'
            this.advance()
        } else if (this.check(TokenType.OPTIONAL)) {
            rule = 'optional'
            this.advance()
        } else if (this.check(TokenType.REQUIRED)) {
            rule = 'required'
            this.advance()
        }

        if (this.check(TokenType.GROUP)) {
            return this.parseGroupField(rule, startTok)
        }

        const type = this.parseTypeName()
        const name = this.expectIdent()
        this.expect(TokenType.EQUALS)
        const numTok = this.expect(TokenType.INT_LIT)
        const number = this.parseIntValue(numTok.value)
        const options = this.parseFieldOptions()
        this.expect(TokenType.SEMICOLON)

        return {
            field: {
                kind: 'field',
                name,
                type,
                number,
                rule,
                options,
                line: startTok.line,
                column: startTok.column
            }
        }
    }

    private parseGroupField(
        rule?: FieldRule,
        startTok: Token = this.peek()
    ): { field: FieldNode; message: MessageNode } {
        const groupTok = this.expect(TokenType.GROUP)
        const groupName = this.expectIdent()
        const fieldName = this.lowerGroupFieldName(groupName)
        this.expect(TokenType.EQUALS)
        const numTok = this.expect(TokenType.INT_LIT)
        const number = this.parseIntValue(numTok.value)
        const options = this.parseFieldOptions()
        this.expect(TokenType.LBRACE)
        const members = this.parseMessageMembers()
        this.expect(TokenType.RBRACE)

        return {
            field: {
                kind: 'field',
                name: fieldName,
                type: groupName,
                number,
                rule,
                options,
                isGroup: true,
                line: startTok.line,
                column: startTok.column
            },
            message: {
                kind: 'message',
                name: groupName,
                ...members,
                line: groupTok.line,
                column: groupTok.column
            }
        }
    }

    private parseFieldOptions(): OptionNode[] {
        const options: OptionNode[] = []
        if (!this.match(TokenType.LBRACKET)) return options

        do {
            const tok = this.peek()
            const { name, value } = this.parseOptionNameValue()
            options.push({ kind: 'option', name, value, line: tok.line, column: tok.column })
        } while (this.match(TokenType.COMMA))

        this.expect(TokenType.RBRACKET)
        return options
    }

    // ── enum ───────────────────────────────────────────────────

    private parseEnum(): EnumNode {
        const tok = this.expect(TokenType.ENUM)
        const name = this.expectIdent()
        this.expect(TokenType.LBRACE)

        const values: EnumValueNode[] = []
        const options: OptionNode[] = []
        const reserved: ReservedNode[] = []

        while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
            if (this.check(TokenType.OPTION)) {
                options.push(this.parseOptionStatement())
            } else if (this.check(TokenType.RESERVED)) {
                reserved.push(this.parseReserved())
            } else if (this.check(TokenType.SEMICOLON)) {
                this.advance()
            } else {
                values.push(this.parseEnumValue())
            }
        }

        this.expect(TokenType.RBRACE)

        return { kind: 'enum', name, values, options, reserved, line: tok.line, column: tok.column }
    }

    private parseEnumValue(): EnumValueNode {
        const tok = this.peek()
        const name = this.expectIdent()
        this.expect(TokenType.EQUALS)

        let negative = false
        if (this.match(TokenType.MINUS)) {
            negative = true
        }
        const numTok = this.expect(TokenType.INT_LIT)
        let number = this.parseIntValue(numTok.value)
        if (negative) number = -number

        const options = this.parseFieldOptions()
        this.expect(TokenType.SEMICOLON)

        return { kind: 'enum_value', name, number, options, line: tok.line, column: tok.column }
    }

    // ── service ────────────────────────────────────────────────

    private parseService(): ServiceNode {
        const tok = this.expect(TokenType.SERVICE)
        const name = this.expectIdent()
        this.expect(TokenType.LBRACE)

        const methods: MethodNode[] = []
        const options: OptionNode[] = []

        while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
            if (this.check(TokenType.RPC)) {
                methods.push(this.parseMethod())
            } else if (this.check(TokenType.OPTION)) {
                options.push(this.parseOptionStatement())
            } else if (this.check(TokenType.SEMICOLON)) {
                this.advance()
            } else {
                const cur = this.peek()
                throw new ParseError(
                    `Unexpected token '${cur.value}' in service body`,
                    cur.line,
                    cur.column
                )
            }
        }

        this.expect(TokenType.RBRACE)

        return { kind: 'service', name, methods, options, line: tok.line, column: tok.column }
    }

    private parseMethod(): MethodNode {
        const tok = this.expect(TokenType.RPC)
        const name = this.expectIdent()
        this.expect(TokenType.LPAREN)

        let clientStreaming = false
        if (this.match(TokenType.STREAM)) {
            clientStreaming = true
        }
        const inputType = this.parseTypeName()
        this.expect(TokenType.RPAREN)
        this.expect(TokenType.RETURNS)
        this.expect(TokenType.LPAREN)

        let serverStreaming = false
        if (this.match(TokenType.STREAM)) {
            serverStreaming = true
        }
        const outputType = this.parseTypeName()
        this.expect(TokenType.RPAREN)

        const options: OptionNode[] = []

        if (this.match(TokenType.LBRACE)) {
            while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
                if (this.check(TokenType.OPTION)) {
                    options.push(this.parseOptionStatement())
                } else if (this.check(TokenType.SEMICOLON)) {
                    this.advance()
                } else {
                    const cur = this.peek()
                    throw new ParseError(
                        `Unexpected token '${cur.value}' in method body`,
                        cur.line,
                        cur.column
                    )
                }
            }
            this.expect(TokenType.RBRACE)
        } else {
            this.expect(TokenType.SEMICOLON)
        }

        return {
            kind: 'method',
            name,
            inputType,
            outputType,
            clientStreaming,
            serverStreaming,
            options,
            line: tok.line,
            column: tok.column
        }
    }

    // ── oneof ──────────────────────────────────────────────────

    private parseOneof(): OneofNode {
        const tok = this.expect(TokenType.ONEOF)
        const name = this.expectIdent()
        this.expect(TokenType.LBRACE)

        const fields: FieldNode[] = []
        const options: OptionNode[] = []

        while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
            if (this.check(TokenType.OPTION)) {
                options.push(this.parseOptionStatement())
            } else if (this.check(TokenType.SEMICOLON)) {
                this.advance()
            } else {
                // oneof fields have no rule
                fields.push(this.parseOneofField())
            }
        }

        this.expect(TokenType.RBRACE)

        return { kind: 'oneof', name, fields, options, line: tok.line, column: tok.column }
    }

    private parseOneofField(): FieldNode {
        const startTok = this.peek()
        const type = this.parseTypeName()
        const name = this.expectIdent()
        this.expect(TokenType.EQUALS)
        const numTok = this.expect(TokenType.INT_LIT)
        const number = this.parseIntValue(numTok.value)
        const options = this.parseFieldOptions()
        this.expect(TokenType.SEMICOLON)

        return {
            kind: 'field',
            name,
            type,
            number,
            rule: undefined,
            options,
            line: startTok.line,
            column: startTok.column
        }
    }

    // ── map ────────────────────────────────────────────────────

    private parseMapField(): MapFieldNode {
        const tok = this.expect(TokenType.MAP)
        this.expect(TokenType.LT)
        const keyType = this.expectIdent()
        this.expect(TokenType.COMMA)
        const valueType = this.parseTypeName()
        this.expect(TokenType.GT)
        const name = this.expectIdent()
        this.expect(TokenType.EQUALS)
        const numTok = this.expect(TokenType.INT_LIT)
        const number = this.parseIntValue(numTok.value)
        const options = this.parseFieldOptions()
        this.expect(TokenType.SEMICOLON)

        return {
            kind: 'map_field',
            name,
            keyType,
            valueType,
            number,
            options,
            line: tok.line,
            column: tok.column
        }
    }

    // ── reserved ───────────────────────────────────────────────

    private parseReserved(): ReservedNode {
        const tok = this.expect(TokenType.RESERVED)
        const ranges: ReservedRange[] = []
        const names: string[] = []

        // Determine if it's field names or ranges
        if (this.check(TokenType.STRING_LIT)) {
            // reserved field names
            do {
                const s = this.expect(TokenType.STRING_LIT)
                names.push(s.value)
            } while (this.match(TokenType.COMMA))
        } else {
            // reserved ranges
            do {
                const from = this.parseIntValue(this.expect(TokenType.INT_LIT).value)
                let to = from
                if (this.match(TokenType.TO)) {
                    if (this.check(TokenType.MAX)) {
                        this.advance()
                        to = FIELD_NUMBER_MAX
                    } else {
                        to = this.parseIntValue(this.expect(TokenType.INT_LIT).value)
                    }
                }
                ranges.push({ from, to })
            } while (this.match(TokenType.COMMA))
        }

        this.expect(TokenType.SEMICOLON)
        return { kind: 'reserved', ranges, names, line: tok.line, column: tok.column }
    }

    // ── extensions ─────────────────────────────────────────────

    private parseExtensions(): ExtensionsNode {
        const tok = this.expect(TokenType.EXTENSIONS)
        const ranges: ReservedRange[] = []

        do {
            const from = this.parseIntValue(this.expect(TokenType.INT_LIT).value)
            let to = from
            if (this.match(TokenType.TO)) {
                if (this.check(TokenType.MAX)) {
                    this.advance()
                    to = FIELD_NUMBER_MAX
                } else {
                    to = this.parseIntValue(this.expect(TokenType.INT_LIT).value)
                }
            }
            ranges.push({ from, to })
        } while (this.match(TokenType.COMMA))

        this.expect(TokenType.SEMICOLON)
        return { kind: 'extensions', ranges, line: tok.line, column: tok.column }
    }

    // ── extend ─────────────────────────────────────────────────

    private parseExtend(): ExtendNode {
        const tok = this.expect(TokenType.EXTEND)
        const typeName = this.parseTypeName()
        this.expect(TokenType.LBRACE)

        const fields: FieldNode[] = []
        while (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
            if (this.check(TokenType.SEMICOLON)) {
                this.advance()
            } else {
                fields.push(this.parseField())
            }
        }

        this.expect(TokenType.RBRACE)
        return { kind: 'extend', typeName, fields, line: tok.line, column: tok.column }
    }

    // ── shared helpers ─────────────────────────────────────────

    /** Parse a full identifier, potentially dot-separated. May start with a dot. */
    private parseFullIdent(): string {
        let name = ''
        if (this.match(TokenType.DOT)) {
            name = '.'
        }
        name += this.expectIdent()
        while (this.check(TokenType.DOT) && this.pos + 1 < this.tokens.length) {
            this.advance() // consume dot
            name += '.' + this.expectIdent()
        }
        return name
    }

    /** Parse a type name (may be fully qualified with dots). */
    private parseTypeName(): string {
        let name = ''
        if (this.match(TokenType.DOT)) {
            name = '.'
        }
        name += this.expectIdentOrKeywordAsType()
        while (this.check(TokenType.DOT)) {
            this.advance()
            name += '.' + this.expectIdentOrKeywordAsType()
        }
        return name
    }

    /** Expect an identifier token and return its value. */
    private expectIdent(): string {
        const tok = this.advance()
        if (tok.type !== TokenType.IDENT && !this.isKeywordIdent(tok)) {
            throw new ParseError(
                `Expected identifier but got '${tok.value}' (${tok.type})`,
                tok.line,
                tok.column
            )
        }
        return tok.value
    }

    /**
     * In type positions, some keywords can be used as type names
     * (e.g., 'message' types can use keyword names in rare proto files).
     * This is more permissive for type resolution.
     */
    private expectIdentOrKeywordAsType(): string {
        const tok = this.advance()
        // Accept IDENT or any keyword token as a type name component
        if (
            tok.type === TokenType.IDENT ||
            tok.type === TokenType.BOOL_LIT ||
            this.isKeywordType(tok.type)
        ) {
            return tok.value
        }
        throw new ParseError(
            `Expected type name but got '${tok.value}' (${tok.type})`,
            tok.line,
            tok.column
        )
    }

    /** Check if a token is a keyword that could serve as an identifier in certain contexts. */
    private isKeywordIdent(tok: Token): boolean {
        return this.isKeywordType(tok.type)
    }

    private isKeywordType(type: TokenType): boolean {
        switch (type) {
            case TokenType.EDITION:
            case TokenType.SYNTAX:
            case TokenType.MESSAGE:
            case TokenType.ENUM:
            case TokenType.SERVICE:
            case TokenType.RPC:
            case TokenType.RETURNS:
            case TokenType.IMPORT:
            case TokenType.PACKAGE:
            case TokenType.OPTION:
            case TokenType.ONEOF:
            case TokenType.MAP:
            case TokenType.REPEATED:
            case TokenType.OPTIONAL:
            case TokenType.REQUIRED:
            case TokenType.RESERVED:
            case TokenType.EXTENSIONS:
            case TokenType.EXTEND:
            case TokenType.GROUP:
            case TokenType.STREAM:
            case TokenType.PUBLIC:
            case TokenType.WEAK:
            case TokenType.TO:
            case TokenType.MAX:
                return true
            default:
                return false
        }
    }

    /** Check if the current token could start a type reference. */
    private isTypeStart(tok: Token): boolean {
        return (
            tok.type === TokenType.IDENT ||
            tok.type === TokenType.DOT ||
            this.isKeywordType(tok.type)
        )
    }

    private lowerGroupFieldName(name: string): string {
        if (name.length === 0) {
            return name
        }
        return name.charAt(0).toLowerCase() + name.slice(1)
    }
}
