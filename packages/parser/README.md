# @protobuf-x/parser

> Zero-dependency `.proto` file parser for TypeScript & JavaScript.

A complete, hand-written parser for Protocol Buffers schema files (`.proto`),
producing a typed AST. Used by [`@protobuf-x/codegen`](https://www.npmjs.com/package/@protobuf-x/codegen) at codegen time.

- ✅ **Zero dependencies** — pure TypeScript, no native bindings
- 🔍 **Full proto2 / proto3 / editions 2023** support
- 🌳 **Typed AST** — every node has a precise TypeScript type
- 🧩 **Type resolution** — resolves cross-file message and enum references
- 📦 **Tiny** — single-purpose, tree-shakeable

## Installation

```bash
npm install @protobuf-x/parser
```

You typically don't import this directly — install [`@protobuf-x/codegen`](https://www.npmjs.com/package/@protobuf-x/codegen) instead, which uses this parser internally.

Use this package directly only when you need to:

- Build custom tooling on top of `.proto` files (linters, formatters, IDE plugins)
- Generate something other than TS/JS (Go, Rust, etc.)
- Inspect proto schemas programmatically

## Quick start

```ts
import { Tokenizer, ProtoParser } from '@protobuf-x/parser'

const source = `
  syntax = "proto3";
  package myapp;

  message User {
    string name = 1;
    int32 age = 2;
    Role role = 3;

    enum Role {
      GUEST = 0;
      ADMIN = 1;
    }
  }
`

const tokens = new Tokenizer(source).tokenize()
const parser = new ProtoParser(tokens)
const ast = parser.parse()

console.log(ast.package) // 'myapp'
console.log(ast.messages[0].name) // 'User'
console.log(ast.messages[0].fields) // [...field nodes]
```

## Cross-file resolution

```ts
import { ProtoLoader, TypeResolver } from '@protobuf-x/parser'

const loader = new ProtoLoader({
    importPaths: ['./schemas', './vendor']
})

// Loads and parses all transitive imports
const graph = await loader.loadFile('schemas/main.proto')

// Resolves type references across files (e.g. `imports.OtherMessage`)
const resolver = new TypeResolver(graph)
resolver.resolve()
```

## What's in the AST?

Top-level nodes:

- `ProtoFileNode` — the parsed file (syntax, package, imports, messages, enums, services, options)
- `MessageNode` — message definition (fields, oneofs, nested messages, nested enums, reserved ranges, options)
- `FieldNode` / `MapFieldNode` — field definition (number, name, type, label, options, default value)
- `EnumNode` — enum definition (values, reserved, options)
- `ServiceNode` / `MethodNode` — service + RPC methods (with streaming flags)
- `OneofNode` — oneof group
- `ExtendNode` / `ExtensionsNode` — proto2 extensions
- `OptionNode` — file/message/field/enum/service/method options
- `ReservedNode` — reserved field numbers and names
- `ImportNode` — import statements (with `public` / `weak` flags)

All nodes carry source position info (`line`, `col`) for error reporting.

## Features

- **All proto2 + proto3 syntax**: messages, oneofs, maps, packed/unpacked repeated, groups, extensions, services
- **Editions 2023**: parses `edition = "2023";` and feature options
- **Imports**: `import "..."`, `import public "..."`, `import weak "..."`
- **Custom options**: `(my.custom.option) = value` (preserved as `OptionAggregate`)
- **Reserved**: `reserved 1, 2, 5 to 10;` and `reserved "foo", "bar";`
- **Comments**: line `//` and block `/* */` (preserved on `BaseNode.leadingComment`)
- **String escapes**: `\n`, `\t`, `\xHH`, `\uHHHH`, `\NNN` (octal)
- **Numeric literals**: int, float, hex (`0x...`), octal (`0...`), `inf`, `nan`
- **Error recovery**: tries to continue parsing after a syntax error to report multiple issues at once

## Errors

```ts
import { LexerError, ParseError } from '@protobuf-x/parser'

try {
    // ...
} catch (err) {
    if (err instanceof ParseError) {
        console.error(`Parse error at ${err.line}:${err.col}: ${err.message}`)
    }
}
```

## Compatibility

- **Node.js**: 18+
- **Universal**: works in browsers, Deno, Bun, edge runtimes (no Node-specific APIs)

## License

MIT
