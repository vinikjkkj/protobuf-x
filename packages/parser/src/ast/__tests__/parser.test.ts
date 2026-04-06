import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { ProtoParser } from '../parser.js'

describe('ProtoParser', () => {
    const parser = new ProtoParser()

    it('parses a simple message with various field types', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      message Person {
        string name = 1;
        int32 id = 2;
        repeated string emails = 3;
        bool active = 4;
        double score = 5;
      }
    `)

        assert.equal(ast.syntax, 'proto3')
        assert.equal(ast.messages.length, 1)

        const msg = ast.messages[0]!
        assert.equal(msg.name, 'Person')
        assert.equal(msg.fields.length, 5)

        assert.equal(msg.fields[0]!.name, 'name')
        assert.equal(msg.fields[0]!.type, 'string')
        assert.equal(msg.fields[0]!.number, 1)
        assert.equal(msg.fields[0]!.rule, undefined)

        assert.equal(msg.fields[2]!.name, 'emails')
        assert.equal(msg.fields[2]!.rule, 'repeated')
    })

    it('parses nested messages', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      message Outer {
        string name = 1;
        message Inner {
          int32 value = 1;
          message DeepNested {
            bool flag = 1;
          }
        }
        Inner inner = 2;
      }
    `)

        const outer = ast.messages[0]!
        assert.equal(outer.name, 'Outer')
        assert.equal(outer.nestedMessages.length, 1)

        const inner = outer.nestedMessages[0]!
        assert.equal(inner.name, 'Inner')
        assert.equal(inner.fields.length, 1)
        assert.equal(inner.nestedMessages.length, 1)

        const deep = inner.nestedMessages[0]!
        assert.equal(deep.name, 'DeepNested')
        assert.equal(deep.fields[0]!.name, 'flag')
    })

    it('parses enums', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      enum Status {
        UNKNOWN = 0;
        ACTIVE = 1;
        INACTIVE = 2;
      }
    `)

        assert.equal(ast.enums.length, 1)
        const e = ast.enums[0]!
        assert.equal(e.name, 'Status')
        assert.equal(e.values.length, 3)
        assert.equal(e.values[0]!.name, 'UNKNOWN')
        assert.equal(e.values[0]!.number, 0)
        assert.equal(e.values[2]!.name, 'INACTIVE')
        assert.equal(e.values[2]!.number, 2)
    })

    it('parses enums with negative values', () => {
        const ast = parser.parse(`
      syntax = "proto2";
      enum SignedEnum {
        NEG = -1;
        ZERO = 0;
      }
    `)

        const e = ast.enums[0]!
        assert.equal(e.values[0]!.number, -1)
        assert.equal(e.values[1]!.number, 0)
    })

    it('parses nested enums in messages', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      message Msg {
        enum Color {
          RED = 0;
          GREEN = 1;
        }
        Color color = 1;
      }
    `)

        const msg = ast.messages[0]!
        assert.equal(msg.nestedEnums.length, 1)
        assert.equal(msg.nestedEnums[0]!.name, 'Color')
        assert.equal(msg.nestedEnums[0]!.values.length, 2)
    })

    it('parses services with streaming RPCs', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      service Greeter {
        rpc SayHello (HelloRequest) returns (HelloReply);
        rpc ServerStream (Request) returns (stream Response);
        rpc ClientStream (stream Request) returns (Response);
        rpc BidiStream (stream Request) returns (stream Response);
      }
    `)

        assert.equal(ast.services.length, 1)
        const svc = ast.services[0]!
        assert.equal(svc.name, 'Greeter')
        assert.equal(svc.methods.length, 4)

        const m0 = svc.methods[0]!
        assert.equal(m0.name, 'SayHello')
        assert.equal(m0.inputType, 'HelloRequest')
        assert.equal(m0.outputType, 'HelloReply')
        assert.equal(m0.clientStreaming, false)
        assert.equal(m0.serverStreaming, false)

        const m1 = svc.methods[1]!
        assert.equal(m1.serverStreaming, true)
        assert.equal(m1.clientStreaming, false)

        const m2 = svc.methods[2]!
        assert.equal(m2.clientStreaming, true)
        assert.equal(m2.serverStreaming, false)

        const m3 = svc.methods[3]!
        assert.equal(m3.clientStreaming, true)
        assert.equal(m3.serverStreaming, true)
    })

    it('parses rpc methods with option bodies', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      service Svc {
        rpc Foo (Req) returns (Res) {
          option (google.api.http) = "something";
        }
      }
    `)

        const method = ast.services[0]!.methods[0]!
        assert.equal(method.options.length, 1)
        assert.equal(method.options[0]!.name, '(google.api.http)')
    })

    it('parses imports and packages', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      package my.package;
      import "google/protobuf/timestamp.proto";
      import public "other.proto";
      import weak "deprecated.proto";
    `)

        assert.equal(ast.package, 'my.package')
        assert.equal(ast.imports.length, 3)

        assert.equal(ast.imports[0]!.path, 'google/protobuf/timestamp.proto')
        assert.equal(ast.imports[0]!.modifier, 'none')

        assert.equal(ast.imports[1]!.path, 'other.proto')
        assert.equal(ast.imports[1]!.modifier, 'public')

        assert.equal(ast.imports[2]!.path, 'deprecated.proto')
        assert.equal(ast.imports[2]!.modifier, 'weak')
    })

    it('parses oneof fields', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      message Sample {
        oneof test_oneof {
          string name = 1;
          int32 id = 2;
        }
      }
    `)

        const msg = ast.messages[0]!
        assert.equal(msg.oneofs.length, 1)
        assert.equal(msg.oneofs[0]!.name, 'test_oneof')
        assert.equal(msg.oneofs[0]!.fields.length, 2)
        assert.equal(msg.oneofs[0]!.fields[0]!.name, 'name')
        assert.equal(msg.oneofs[0]!.fields[1]!.name, 'id')
    })

    it('parses map fields', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      message MapMsg {
        map<string, int32> simple_map = 1;
        map<int64, OtherMessage> complex_map = 2;
      }
    `)

        const msg = ast.messages[0]!
        assert.equal(msg.mapFields.length, 2)

        assert.equal(msg.mapFields[0]!.name, 'simple_map')
        assert.equal(msg.mapFields[0]!.keyType, 'string')
        assert.equal(msg.mapFields[0]!.valueType, 'int32')
        assert.equal(msg.mapFields[0]!.number, 1)

        assert.equal(msg.mapFields[1]!.name, 'complex_map')
        assert.equal(msg.mapFields[1]!.keyType, 'int64')
        assert.equal(msg.mapFields[1]!.valueType, 'OtherMessage')
        assert.equal(msg.mapFields[1]!.number, 2)
    })

    it('parses reserved ranges and names', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      message Reserved {
        reserved 2, 15, 9 to 11;
        reserved "foo", "bar";
      }
    `)

        const msg = ast.messages[0]!
        assert.equal(msg.reserved.length, 2)

        const rangeReserved = msg.reserved[0]!
        assert.equal(rangeReserved.ranges.length, 3)
        assert.deepEqual(rangeReserved.ranges[0], { from: 2, to: 2 })
        assert.deepEqual(rangeReserved.ranges[1], { from: 15, to: 15 })
        assert.deepEqual(rangeReserved.ranges[2], { from: 9, to: 11 })
        assert.equal(rangeReserved.names.length, 0)

        const nameReserved = msg.reserved[1]!
        assert.equal(nameReserved.names.length, 2)
        assert.deepEqual(nameReserved.names, ['foo', 'bar'])
        assert.equal(nameReserved.ranges.length, 0)
    })

    it('parses reserved with max', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      message Msg {
        reserved 100 to max;
      }
    `)

        const res = ast.messages[0]!.reserved[0]!
        assert.equal(res.ranges[0]!.from, 100)
        assert.equal(res.ranges[0]!.to, 536870911)
    })

    it('parses extensions ranges', () => {
        const ast = parser.parse(`
      syntax = "proto2";
      message Extensible {
        extensions 100 to 199;
      }
    `)

        const msg = ast.messages[0]!
        assert.equal(msg.extensions.length, 1)
        assert.deepEqual(msg.extensions[0]!.ranges[0], { from: 100, to: 199 })
    })

    it('parses extend blocks', () => {
        const ast = parser.parse(`
      syntax = "proto2";
      extend Extensible {
        optional string extra_field = 100;
      }
    `)

        assert.equal(ast.extends.length, 1)
        assert.equal(ast.extends[0]!.typeName, 'Extensible')
        assert.equal(ast.extends[0]!.fields.length, 1)
        assert.equal(ast.extends[0]!.fields[0]!.name, 'extra_field')
    })

    it('parses field options', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      message Msg {
        string name = 1 [json_name = "Name", deprecated = true];
      }
    `)

        const field = ast.messages[0]!.fields[0]!
        assert.equal(field.options.length, 2)
        assert.equal(field.options[0]!.name, 'json_name')
        assert.equal(field.options[0]!.value, 'Name')
        assert.equal(field.options[1]!.name, 'deprecated')
        assert.equal(field.options[1]!.value, true)
    })

    it('parses fully qualified type names', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      message Msg {
        google.protobuf.Timestamp created_at = 1;
        .my.package.OtherMsg ref = 2;
      }
    `)

        const f0 = ast.messages[0]!.fields[0]!
        assert.equal(f0.type, 'google.protobuf.Timestamp')

        const f1 = ast.messages[0]!.fields[1]!
        assert.equal(f1.type, '.my.package.OtherMsg')
    })

    it('parses top-level options', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      option java_package = "com.example";
      option optimize_for = SPEED;
    `)

        assert.equal(ast.options.length, 2)
        assert.equal(ast.options[0]!.name, 'java_package')
        assert.equal(ast.options[0]!.value, 'com.example')
        assert.equal(ast.options[1]!.name, 'optimize_for')
        assert.equal(ast.options[1]!.value, 'SPEED')
    })

    it('parses custom options with parenthesized names', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      option (my.custom.option) = "value";
    `)

        assert.equal(ast.options[0]!.name, '(my.custom.option)')
        assert.equal(ast.options[0]!.value, 'value')
    })

    it('parses enum options', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      enum E {
        option allow_alias = true;
        A = 0;
        B = 1;
      }
    `)

        const e = ast.enums[0]!
        assert.equal(e.options.length, 1)
        assert.equal(e.options[0]!.name, 'allow_alias')
        assert.equal(e.options[0]!.value, true)
    })

    it('parses enum value options', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      enum E {
        UNSPECIFIED = 0 [deprecated = true];
      }
    `)

        const val = ast.enums[0]!.values[0]!
        assert.equal(val.options.length, 1)
        assert.equal(val.options[0]!.name, 'deprecated')
    })

    it('parses proto2 with required fields', () => {
        const ast = parser.parse(`
      syntax = "proto2";
      message Msg {
        required string name = 1;
        optional int32 age = 2;
      }
    `)

        assert.equal(ast.syntax, 'proto2')
        assert.equal(ast.messages[0]!.fields[0]!.rule, 'required')
        assert.equal(ast.messages[0]!.fields[1]!.rule, 'optional')
    })

    it('parses deprecated group fields as nested message definitions', () => {
        const ast = parser.parse(`
      syntax = "proto2";
      message Person {
        optional group Contact = 1 [deprecated = true] {
          optional string email = 2;
        }
      }
    `)

        const msg = ast.messages[0]!
        const groupField = msg.fields[0]!
        const groupMessage = msg.nestedMessages[0]!

        assert.equal(groupField.name, 'contact')
        assert.equal(groupField.type, 'Contact')
        assert.equal(groupField.rule, 'optional')
        assert.equal(groupField.isGroup, true)
        assert.equal(groupField.options[0]!.name, 'deprecated')
        assert.equal(groupMessage.name, 'Contact')
        assert.equal(groupMessage.fields[0]!.name, 'email')
    })

    it('errors on malformed input - missing semicolon', () => {
        assert.throws(() => {
            parser.parse(`
        syntax = "proto3"
        message Foo {}
      `)
        }, /Expected/)
    })

    it('errors on malformed input - unexpected token', () => {
        assert.throws(() => {
            parser.parse(`
        syntax = "proto3";
        123 invalid;
      `)
        }, /Unexpected token/)
    })

    it('errors on unsupported syntax', () => {
        assert.throws(() => {
            parser.parse('syntax = "proto4";')
        }, /Unsupported syntax/)
    })

    it('defaults to proto2 when no syntax is declared', () => {
        const ast = parser.parse('message Foo { optional string name = 1; }')
        assert.equal(ast.syntax, 'proto2')
    })

    it('parses edition = "2023" declaration', () => {
        const ast = parser.parse(`
      edition = "2023";
      package test.editions;
      message Msg {
        int32 x = 1;
        string y = 2;
      }
    `)

        assert.equal(ast.edition, '2023')
        assert.equal(ast.syntax, 'proto3')
        assert.equal(ast.package, 'test.editions')
        assert.equal(ast.messages.length, 1)

        const msg = ast.messages[0]!
        assert.equal(msg.name, 'Msg')
        assert.equal(msg.fields.length, 2)
        assert.equal(msg.fields[0]!.name, 'x')
        assert.equal(msg.fields[0]!.type, 'int32')
        assert.equal(msg.fields[0]!.number, 1)
        assert.equal(msg.fields[1]!.name, 'y')
        assert.equal(msg.fields[1]!.type, 'string')
        assert.equal(msg.fields[1]!.number, 2)
    })

    it('parses an empty file', () => {
        const ast = parser.parse('')
        assert.equal(ast.syntax, 'proto2')
        assert.equal(ast.messages.length, 0)
        assert.equal(ast.enums.length, 0)
        assert.equal(ast.services.length, 0)
    })

    it('handles empty statements (lone semicolons)', () => {
        const ast = parser.parse(`
      syntax = "proto3";
      ;
      message Foo {
        ;
      }
    `)
        assert.equal(ast.messages.length, 1)
    })
})
