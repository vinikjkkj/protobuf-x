import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { ProtoParser } from '../parser.js'
import { TypeResolver } from '../resolver.js'

describe('TypeResolver', () => {
    it('resolves nested, qualified and service references from real proto source', () => {
        const parser = new ProtoParser()
        const ast = parser.parse(`
            syntax = "proto2";
            package demo.v1;

            message Outer {
              message Inner {
                optional string city = 1;
              }

              enum Status {
                STATUS_UNSPECIFIED = 0;
                STATUS_READY = 1;
              }

              optional Inner child = 1;
              optional Status status = 2;
              map<string, Inner> by_name = 3;

              oneof payload {
                Inner nested = 4;
              }
            }

            message Request {
              optional .demo.v1.Outer.Inner item = 1;
            }

            message Reply {
              optional Outer.Inner payload = 1;
            }

            service DemoService {
              rpc Get (Request) returns (Outer.Inner);
            }

            extend Outer {
              optional Outer.Inner extension_value = 100;
            }
        `)

        const result = new TypeResolver().resolve(ast)

        assert.equal(result.unresolved.length, 0)
        assert.equal(result.resolved.get('Inner'), 'demo.v1.Outer.Inner')
        assert.equal(result.resolved.get('Status'), 'demo.v1.Outer.Status')
        assert.equal(result.resolved.get('.demo.v1.Outer.Inner'), 'demo.v1.Outer.Inner')
        assert.equal(result.resolved.get('Outer.Inner'), 'demo.v1.Outer.Inner')
        assert.equal(result.resolved.get('Request'), 'demo.v1.Request')
    })

    it('reports unresolved references with useful context', () => {
        const parser = new ProtoParser()
        const ast = parser.parse(`
            syntax = "proto3";
            package demo.v1;

            message Broken {
              MissingType missing = 1;
            }

            service BrokenService {
              rpc Call (Broken) returns (MissingReply);
            }
        `)

        const result = new TypeResolver().resolve(ast)

        assert.equal(result.resolved.get('Broken'), 'demo.v1.Broken')
        assert.equal(result.unresolved.length, 2)
        assert.deepEqual(
            result.unresolved.map((entry) => ({
                typeName: entry.typeName,
                context: entry.context
            })),
            [
                { typeName: 'MissingType', context: "field 'missing' in 'demo.v1.Broken'" },
                { typeName: 'MissingReply', context: "method 'Call'" }
            ]
        )
        assert.ok(result.unresolved.every((entry) => entry.line > 0))
        assert.ok(result.unresolved.every((entry) => entry.column > 0))
    })
})
