import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { LexerError, Tokenizer } from '../tokenizer.js'
import { TokenType } from '../tokens.js'

function tokenize(source: string) {
    return new Tokenizer(source).tokenize()
}

describe('Tokenizer advanced behavior', () => {
    it('handles extended escape sequences and octal forms', () => {
        assert.equal(tokenize('"hello\\rworld"')[0]?.value, 'hello\rworld')
        assert.equal(tokenize('"\\f"')[0]?.value, '\f')
        assert.equal(tokenize('"\\v"')[0]?.value, '\v')
        assert.equal(tokenize('"\\\\"')[0]?.value, '\\')
        assert.equal(tokenize('"\\b"')[0]?.value, '\b')
        assert.equal(tokenize('"\\0"')[0]?.value, '\0')
        assert.equal(tokenize('"\\a"')[0]?.value, '\x07')
        assert.equal(tokenize('"\\101"')[0]?.value, 'A')
        assert.equal(tokenize('"\\7"')[0]?.value, '\x07')
        assert.equal(tokenize('"\\q"')[0]?.value, 'q')
    })

    it('rejects unterminated escapes and newlines inside strings', () => {
        assert.throws(
            () => tokenize('"\\'),
            (err: unknown) =>
                err instanceof LexerError && /Unterminated string escape/.test(err.message)
        )
        assert.throws(() => tokenize('"hello\\'), /Unterminated string/)
        assert.throws(() => tokenize('"hello\nworld"'), /Unterminated string/)
    })

    it('tokenizes exponent and dot-prefixed float forms', () => {
        const samples = ['1e10', '1E-5', '1.5e+3', '.5']
        for (const sample of samples) {
            const tokens = tokenize(sample)
            assert.equal(tokens[0]?.type, TokenType.FLOAT_LIT)
            assert.equal(tokens[0]?.value, sample)
        }
    })

    it('tokenizes slash and punctuation operators directly', () => {
        assert.equal(tokenize('a / b').find((token) => token.type === TokenType.SLASH)?.value, '/')
        assert.equal(tokenize('/')[0]?.type, TokenType.SLASH)
        assert.equal(tokenize('+')[0]?.type, TokenType.PLUS)
        assert.equal(tokenize(':')[0]?.type, TokenType.COLON)
        assert.equal(tokenize('-')[0]?.type, TokenType.MINUS)
    })
})
