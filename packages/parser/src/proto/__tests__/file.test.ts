import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { ProtoParser } from '../../ast/parser.js'
import { ProtoFile } from '../file.js'

function makeFile(source: string): ProtoFile {
    const parser = new ProtoParser()
    return new ProtoFile(parser.parse(source))
}

describe('ProtoFile', () => {
    const source = `
    syntax = "proto3";
    package test.pkg;

    enum TopEnum {
      ZERO = 0;
      ONE = 1;
    }

    message Outer {
      string name = 1;

      enum InnerEnum {
        A = 0;
        B = 1;
      }

      message Inner {
        int32 value = 1;

        message DeepNested {
          bool flag = 1;
        }
      }

      Inner inner = 2;
    }

    message Another {
      double x = 1;
    }

    service MyService {
      rpc DoStuff (Outer) returns (Another);
    }
  `

    const file = makeFile(source)

    describe('lookupMessage', () => {
        it('finds a top-level message by name', () => {
            const msg = file.lookupMessage('Outer')
            assert.ok(msg)
            assert.equal(msg.name, 'Outer')
        })

        it('finds another top-level message', () => {
            const msg = file.lookupMessage('Another')
            assert.ok(msg)
            assert.equal(msg.name, 'Another')
        })

        it('finds a nested message by dotted name', () => {
            const msg = file.lookupMessage('Outer.Inner')
            assert.ok(msg)
            assert.equal(msg.name, 'Inner')
        })

        it('finds a deeply nested message by dotted name', () => {
            const msg = file.lookupMessage('Outer.Inner.DeepNested')
            assert.ok(msg)
            assert.equal(msg.name, 'DeepNested')
        })

        it('returns undefined for non-existent message', () => {
            const msg = file.lookupMessage('NonExistent')
            assert.equal(msg, undefined)
        })

        it('returns undefined for wrong nesting path', () => {
            const msg = file.lookupMessage('Another.Inner')
            assert.equal(msg, undefined)
        })
    })

    describe('lookupEnum', () => {
        it('finds a top-level enum by name', () => {
            const e = file.lookupEnum('TopEnum')
            assert.ok(e)
            assert.equal(e.name, 'TopEnum')
            assert.equal(e.values.length, 2)
        })

        it('finds a nested enum by simple name', () => {
            const e = file.lookupEnum('InnerEnum')
            assert.ok(e)
            assert.equal(e.name, 'InnerEnum')
        })

        it('finds a nested enum by dotted name', () => {
            const e = file.lookupEnum('Outer.InnerEnum')
            assert.ok(e)
            assert.equal(e.name, 'InnerEnum')
        })

        it('returns undefined for non-existent enum', () => {
            assert.equal(file.lookupEnum('NoSuchEnum'), undefined)
        })
    })

    describe('lookupService', () => {
        it('finds a service by name', () => {
            const svc = file.lookupService('MyService')
            assert.ok(svc)
            assert.equal(svc.name, 'MyService')
            assert.equal(svc.methods.length, 1)
        })

        it('returns undefined for non-existent service', () => {
            assert.equal(file.lookupService('NoSuchService'), undefined)
        })
    })

    describe('getMessages', () => {
        it('returns all messages including nested', () => {
            const all = file.getMessages()
            const names = all.map((m) => m.name)

            assert.ok(names.includes('Outer'))
            assert.ok(names.includes('Inner'))
            assert.ok(names.includes('DeepNested'))
            assert.ok(names.includes('Another'))
            assert.equal(all.length, 4)
        })
    })

    describe('getEnums', () => {
        it('returns all enums including nested', () => {
            const all = file.getEnums()
            const names = all.map((e) => e.name)

            assert.ok(names.includes('TopEnum'))
            assert.ok(names.includes('InnerEnum'))
            assert.equal(all.length, 2)
        })
    })

    describe('syntax and package accessors', () => {
        it('exposes syntax', () => {
            assert.equal(file.syntax, 'proto3')
        })

        it('exposes package', () => {
            assert.equal(file.package, 'test.pkg')
        })
    })
})
