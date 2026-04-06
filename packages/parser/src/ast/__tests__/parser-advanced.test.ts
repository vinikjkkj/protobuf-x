import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { Tokenizer } from '../../lexer/tokenizer.js'
import { ProtoParser } from '../parser.js'

const parser = new ProtoParser()

describe('ProtoParser advanced behavior', () => {
    it('parses from pre-tokenized input', () => {
        const tokens = new Tokenizer('syntax = "proto3"; message Foo {}').tokenize()
        const ast = parser.parseTokens(tokens)
        assert.equal(ast.syntax, 'proto3')
        assert.equal(ast.messages[0]?.name, 'Foo')
    })

    it('parses signed, positive and aggregate option values', () => {
        assert.equal(parser.parse('syntax = "proto3"; option x = -3.14;').options[0]?.value, -3.14)
        assert.equal(parser.parse('syntax = "proto3"; option x = +42;').options[0]?.value, 42)
        const positiveFloat = parser.parse('syntax = "proto3"; option x = +3.14;').options[0]?.value
        assert.ok(Math.abs((positiveFloat as number) - 3.14) < 0.001)

        const aggregate = parser.parse(
            'syntax = "proto3"; option (custom) = { key: "value" another: 42 };'
        )
        const value = aggregate.options[0]?.value as Record<string, unknown>
        assert.equal(value.key, 'value')
        assert.equal(value.another, 42)

        const duplicates = parser.parse('syntax = "proto3"; option x = { a: 1, a: 2, a: 3 };')
        assert.deepEqual((duplicates.options[0]?.value as Record<string, unknown>).a, [1, 2, 3])
    })

    it('rejects malformed option values after unary operators', () => {
        assert.throws(
            () => parser.parse('syntax = "proto3"; option x = - "str";'),
            /Expected number/
        )
        assert.throws(
            () => parser.parse('syntax = "proto3"; option x = + "str";'),
            /Expected number/
        )
        assert.throws(
            () => parser.parse('syntax = "proto3"; option x = [;'),
            /Unexpected option value/
        )
    })

    it('rejects unexpected tokens in service and method bodies', () => {
        assert.throws(
            () => parser.parse('syntax = "proto3"; service S { invalid; }'),
            /Unexpected token.*service body/
        )
        assert.throws(
            () =>
                parser.parse(
                    'syntax = "proto3"; service S { rpc M(Req) returns (Res) { invalid; } }'
                ),
            /Unexpected token.*method body/
        )
    })

    it('parses oneof options, extensions and extend variants', () => {
        const ast = parser.parse(`
            syntax = "proto2";
            message Outer {
                oneof choice {
                    option java_package = "test";
                    string a = 1;
                    int32 b = 2;
                }
                extensions 100 to 199, 500 to max;
                extend Inner {
                    optional int32 y = 100;
                }
            }
            message Inner {}
            extend Outer { ; optional int32 z = 101; }
        `)

        const outer = ast.messages[0]!
        assert.equal(outer.oneofs[0]?.options[0]?.name, 'java_package')
        assert.equal(outer.oneofs[0]?.fields.length, 2)
        assert.equal(outer.extensions[0]?.ranges[1]?.to, 536870911)
        assert.equal(outer.extends.length, 1)
        assert.equal(ast.extends[0]?.fields.length, 1)
    })

    it('accepts keyword-based type names and dotted keyword suffixes', () => {
        const ast = parser.parse(`
            syntax = "proto3";
            message M {
                syntax a = 1;
                service b = 2;
                rpc c = 3;
                returns d = 4;
                import e = 5;
                package f = 6;
                stream g = 7;
                public h = 8;
                weak i = 9;
                to j = 10;
                max k = 11;
                foo.syntax bar = 12;
            }
        `)

        assert.equal(ast.messages[0]?.fields.length, 12)
        assert.equal(ast.messages[0]?.fields[0]?.type, 'syntax')
        assert.equal(ast.messages[0]?.fields[10]?.type, 'max')
        assert.equal(ast.messages[0]?.fields[11]?.type, 'foo.syntax')
    })

    it('parses semicolon RPC methods, ident option constants and alternate numeric bases', () => {
        const ast = parser.parse(`
            syntax = "proto3";
            option optimize_for = SPEED;
            service S { rpc Method(Req) returns (Res); }
            message M { int32 hex = 0x0A; int32 oct = 012; }
        `)

        assert.equal(ast.options[0]?.value, 'SPEED')
        assert.equal(ast.services[0]?.methods.length, 1)
        assert.equal(ast.messages[0]?.fields[0]?.number, 10)
        assert.equal(ast.messages[0]?.fields[1]?.number, 10)
    })

    it('reports identifier and type-name errors clearly', () => {
        assert.throws(() => parser.parse('syntax = "proto3"; message { }'), /Expected identifier/)
        assert.throws(
            () => parser.parse('syntax = "proto3"; message M { int32 123 = 1; }'),
            /Expected identifier/
        )
        assert.throws(
            () => parser.parse('syntax = "proto3"; message M { Foo.; name = 1; }'),
            /Expected type name/
        )
        assert.throws(
            () => parser.parse('syntax = "proto3"; message M { ; = 1; }'),
            /Unexpected token/
        )
    })
})
