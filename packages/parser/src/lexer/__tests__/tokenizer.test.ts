import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { Tokenizer } from '../tokenizer.js'
import { TokenType } from '../tokens.js'

describe('Tokenizer', () => {
    it('tokenizes a simple message definition', () => {
        const source = `message Person {
  string name = 1;
  int32 age = 2;
}`
        const tokenizer = new Tokenizer(source)
        const tokens = tokenizer.tokenize()

        const types = tokens.map((t) => t.type)
        assert.deepEqual(types, [
            TokenType.MESSAGE,
            TokenType.IDENT, // Person
            TokenType.LBRACE,
            TokenType.IDENT, // string
            TokenType.IDENT, // name
            TokenType.EQUALS,
            TokenType.INT_LIT, // 1
            TokenType.SEMICOLON,
            TokenType.IDENT, // int32
            TokenType.IDENT, // age
            TokenType.EQUALS,
            TokenType.INT_LIT, // 2
            TokenType.SEMICOLON,
            TokenType.RBRACE,
            TokenType.EOF
        ])

        assert.equal(tokens[1]!.value, 'Person')
        assert.equal(tokens[3]!.value, 'string')
        assert.equal(tokens[4]!.value, 'name')
        assert.equal(tokens[6]!.value, '1')
    })

    it('handles double-quoted string escapes', () => {
        const source = '"hello\\nworld\\t\\"quoted\\""'
        const tokenizer = new Tokenizer(source)
        const tokens = tokenizer.tokenize()

        assert.equal(tokens[0]!.type, TokenType.STRING_LIT)
        assert.equal(tokens[0]!.value, 'hello\nworld\t"quoted"')
    })

    it('handles single-quoted strings', () => {
        const source = "'single\\''"
        const tokenizer = new Tokenizer(source)
        const tokens = tokenizer.tokenize()

        assert.equal(tokens[0]!.type, TokenType.STRING_LIT)
        assert.equal(tokens[0]!.value, "single'")
    })

    it('handles hex escape in strings', () => {
        const source = '"\\x41\\x42"'
        const tokenizer = new Tokenizer(source)
        const tokens = tokenizer.tokenize()

        assert.equal(tokens[0]!.type, TokenType.STRING_LIT)
        assert.equal(tokens[0]!.value, 'AB')
    })

    it('tokenizes decimal integer literals', () => {
        const source = '0 1 123 999999'
        const tokens = new Tokenizer(source).tokenize()

        assert.equal(tokens[0]!.type, TokenType.INT_LIT)
        assert.equal(tokens[0]!.value, '0')
        assert.equal(tokens[1]!.type, TokenType.INT_LIT)
        assert.equal(tokens[1]!.value, '1')
        assert.equal(tokens[2]!.type, TokenType.INT_LIT)
        assert.equal(tokens[2]!.value, '123')
        assert.equal(tokens[3]!.type, TokenType.INT_LIT)
        assert.equal(tokens[3]!.value, '999999')
    })

    it('tokenizes hex integer literals', () => {
        const source = '0x1F 0XAB'
        const tokens = new Tokenizer(source).tokenize()

        assert.equal(tokens[0]!.type, TokenType.INT_LIT)
        assert.equal(tokens[0]!.value, '0x1F')
        assert.equal(tokens[1]!.type, TokenType.INT_LIT)
        assert.equal(tokens[1]!.value, '0XAB')
    })

    it('tokenizes octal integer literals', () => {
        const source = '0777 010'
        const tokens = new Tokenizer(source).tokenize()

        assert.equal(tokens[0]!.type, TokenType.INT_LIT)
        assert.equal(tokens[0]!.value, '0777')
        assert.equal(tokens[1]!.type, TokenType.INT_LIT)
        assert.equal(tokens[1]!.value, '010')
    })

    it('tokenizes float literals', () => {
        const source = '1.0 0.5 3.14e10 2.5E-3 .5'
        const tokens = new Tokenizer(source).tokenize()

        assert.equal(tokens[0]!.type, TokenType.FLOAT_LIT)
        assert.equal(tokens[0]!.value, '1.0')
        assert.equal(tokens[1]!.type, TokenType.FLOAT_LIT)
        assert.equal(tokens[1]!.value, '0.5')
        assert.equal(tokens[2]!.type, TokenType.FLOAT_LIT)
        assert.equal(tokens[2]!.value, '3.14e10')
        assert.equal(tokens[3]!.type, TokenType.FLOAT_LIT)
        assert.equal(tokens[3]!.value, '2.5E-3')
        assert.equal(tokens[4]!.type, TokenType.FLOAT_LIT)
        assert.equal(tokens[4]!.value, '.5')
    })

    it('tokenizes inf and nan as float literals', () => {
        const tokens = new Tokenizer('inf nan').tokenize()
        assert.equal(tokens[0]!.type, TokenType.FLOAT_LIT)
        assert.equal(tokens[0]!.value, 'inf')
        assert.equal(tokens[1]!.type, TokenType.FLOAT_LIT)
        assert.equal(tokens[1]!.value, 'nan')
    })

    it('skips single-line comments by default', () => {
        const source = `message Foo { // this is a comment
  string bar = 1;
}`
        const tokens = new Tokenizer(source).tokenize()
        const types = tokens.map((t) => t.type)
        assert.ok(!types.includes(TokenType.COMMENT))
    })

    it('includes single-line comments when requested', () => {
        const source = `// file comment
message Foo {}`
        const tokens = new Tokenizer(source, { includeComments: true }).tokenize()
        assert.equal(tokens[0]!.type, TokenType.COMMENT)
        assert.equal(tokens[0]!.value, '// file comment')
    })

    it('skips block comments by default', () => {
        const source = `/* block
comment */ message Foo {}`
        const tokens = new Tokenizer(source).tokenize()
        assert.equal(tokens[0]!.type, TokenType.MESSAGE)
    })

    it('includes block comments when requested', () => {
        const source = '/* block comment */ message Foo {}'
        const tokens = new Tokenizer(source, { includeComments: true }).tokenize()
        assert.equal(tokens[0]!.type, TokenType.COMMENT)
        assert.equal(tokens[0]!.value, '/* block comment */')
    })

    it('tracks line and column numbers correctly', () => {
        const source = `syntax = "proto3";

message Foo {
}`
        const tokens = new Tokenizer(source).tokenize()

        // 'syntax' starts at line 1, col 1
        assert.equal(tokens[0]!.line, 1)
        assert.equal(tokens[0]!.column, 1)

        // 'message' starts at line 3, col 1
        const messageTok = tokens.find((t) => t.type === TokenType.MESSAGE)
        assert.ok(messageTok)
        assert.equal(messageTok.line, 3)
        assert.equal(messageTok.column, 1)
    })

    it('recognizes all keywords', () => {
        const keywords = [
            'syntax',
            'message',
            'enum',
            'service',
            'rpc',
            'returns',
            'import',
            'package',
            'option',
            'oneof',
            'map',
            'repeated',
            'optional',
            'required',
            'reserved',
            'extensions',
            'extend',
            'stream',
            'public',
            'weak',
            'to',
            'max'
        ]
        const source = keywords.join(' ')
        const tokens = new Tokenizer(source).tokenize()

        for (let i = 0; i < keywords.length; i++) {
            assert.equal(tokens[i]!.value, keywords[i])
            assert.notEqual(tokens[i]!.type, TokenType.IDENT)
        }
    })

    it('recognizes boolean literals', () => {
        const tokens = new Tokenizer('true false').tokenize()
        assert.equal(tokens[0]!.type, TokenType.BOOL_LIT)
        assert.equal(tokens[0]!.value, 'true')
        assert.equal(tokens[1]!.type, TokenType.BOOL_LIT)
        assert.equal(tokens[1]!.value, 'false')
    })

    it('tokenizes all punctuation symbols', () => {
        const source = '{ } ( ) [ ] ; = , . < >'
        const tokens = new Tokenizer(source).tokenize()
        const types = tokens.slice(0, -1).map((t) => t.type)
        assert.deepEqual(types, [
            TokenType.LBRACE,
            TokenType.RBRACE,
            TokenType.LPAREN,
            TokenType.RPAREN,
            TokenType.LBRACKET,
            TokenType.RBRACKET,
            TokenType.SEMICOLON,
            TokenType.EQUALS,
            TokenType.COMMA,
            TokenType.DOT,
            TokenType.LT,
            TokenType.GT
        ])
    })

    it('throws on unexpected characters', () => {
        assert.throws(() => {
            new Tokenizer('@').tokenize()
        }, /Unexpected character/)
    })

    it('throws on unterminated string', () => {
        assert.throws(() => {
            new Tokenizer('"unterminated').tokenize()
        }, /Unterminated string/)
    })

    it('throws on unterminated block comment', () => {
        assert.throws(() => {
            new Tokenizer('/* unterminated').tokenize()
        }, /Unterminated block comment/)
    })
})
