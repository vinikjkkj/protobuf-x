# @protobuf-x/codegen

> Code generator CLI + programmatic API for [protobuf-x](https://github.com/vinikjkkj/protobuf-x). Generates fast, type-safe TypeScript/JavaScript from `.proto` files.

- 🚀 **Generates the fastest protobuf code in JS** — wins 9-10/10 benchmarks vs `protobufjs`
- 📦 **Smaller output** — defaults are tuned for size; `--minimal` strips JSON, create, and typeurl for smallest binary-only output
- 🔒 **Type-safe** — full TypeScript types with deep nested dot notation (`User.Profile.Theme.DARK`)
- 🛠 **Programmatic API** — use from build scripts or bundler plugins, no CLI required
- ✅ **Zero runtime deps** — depends only on `@protobuf-x/parser`

## Installation

```bash
npm install -D @protobuf-x/codegen
npm install @protobuf-x/runtime
```

## CLI

```bash
npx protobuf-x [options] <file.proto ...>
# or use the short alias:
npx pbx [options] <file.proto ...>
```

| Option                     | Description                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| `-o, --out <dir>`          | Output directory (required)                                       |
| `-t, --target <type>`      | `ts` (default), `js`, or `both`                                   |
| `--import-path <path>`     | Add a directory to the proto import search path (repeatable)      |
| `--runtime-package <name>` | Override runtime package (default `@protobuf-x/runtime`)          |
| `--no-json`                | Skip `toJSON`/`fromJSON` + JSON interfaces                        |
| `--no-create`              | Skip `Message.create()` factory (use `new Message()` instead)     |
| `--no-typeurl`             | Skip `getTypeUrl` helper                                          |
| `--minimal`                | Enable all `--no-*` flags (smallest binary-only output)           |
| `--int64-as <repr>`        | 64-bit int representation: `bigint` (default), `number`, `string` |
| `-h, --help`               | Show help                                                         |
| `-v, --version`            | Show version                                                      |

### Target reference

| Target         | Files generated                                                              |
| -------------- | ---------------------------------------------------------------------------- |
| `ts` (default) | `schema_pb.ts` — TypeScript source (classes + types + methods)               |
| `js`           | `schema_pb.js` + `schema_pb.d.ts` — runnable JS + separate type declarations |
| `both`         | All three: `.ts`, `.js`, `.d.ts`                                             |

Use `ts` if your project compiles TypeScript (Vite, tsx, esbuild, swc, ts-node).
Use `js` to ship as a regular npm library.

### Examples

```bash
# Generate TypeScript (default)
protobuf-x --out gen schema.proto

# Generate JavaScript + .d.ts files
protobuf-x --target js --out gen schema.proto

# Minimal mode: skip create(), getTypeUrl(), and JSON methods
protobuf-x --minimal --out gen schema.proto

# Use the minimal runtime (auto-enables --minimal)
protobuf-x --runtime-package @protobuf-x/runtime/minimal --out gen schema.proto

# Compile a tree of files with import paths
protobuf-x --import-path ./schemas --import-path ./vendor --out gen schemas/main.proto

# Use plain `number` for int64 fields (protobufjs-style, loses precision above 2^53)
protobuf-x --int64-as number --out gen schema.proto
```

## Programmatic API

For build scripts, bundler plugins, or anywhere you'd rather not shell out to a CLI.

```ts
import { generate, generateToDisk } from '@protobuf-x/codegen'

// Generate in-memory — returns { files, errors }
const result = await generate({
    files: ['./schema.proto'],
    target: 'ts',
    runtimePackage: '@protobuf-x/runtime',
    noJson: false
})

for (const file of result.files) {
    console.log(file.path, file.content.length)
}

// Or write directly to disk
await generateToDisk({
    files: ['./schema.proto'],
    target: 'both',
    outDir: './gen'
})

// Generate from an in-memory source string (no disk needed)
const inMem = await generate({
    sources: [
        {
            name: 'user.proto',
            content: 'syntax = "proto3"; message User { string name = 1; }'
        }
    ],
    target: 'ts'
})
console.log(inMem.files[0].content)
```

### `GenerateOptions`

```ts
interface GenerateOptions {
    files?: string[] // .proto file paths
    sources?: ProtoSource[] // in-memory { name, content } pairs
    target?: 'ts' | 'js' | 'both' // default 'ts'
    runtimePackage?: string // default '@protobuf-x/runtime'
    noJson?: boolean // default false; auto-true for /minimal runtime
    noCreate?: boolean // default false; skip Message.create() factory
    noTypeurl?: boolean // default false; skip getTypeUrl helper
    minimal?: boolean // default false; enables all --no-* flags
    int64As?: 'bigint' | 'number' | 'string' // default 'bigint'
    importPaths?: string[] // additional proto import search paths
    outDir?: string // joined with relative output paths
    parser?: ParserModuleLike // override the parser module
}
```

### `GenerateResult`

```ts
interface GenerateResult {
    files: GeneratedFile[] // { path: string, content: string }[]
    errors: GenerateError[] // { file: string, message: string }[] — collected, never thrown
}
```

The function does **not** throw on a single bad file — it collects per-file
errors and still returns whatever generated successfully. It only throws if
you pass no `files` or `sources` at all.

### Bundler plugin example (Vite)

```ts
import { generate } from '@protobuf-x/codegen'

export function protobufXPlugin() {
    return {
        name: 'protobuf-x',
        async load(id: string) {
            if (!id.endsWith('.proto')) return null
            const result = await generate({ files: [id], target: 'ts' })
            return result.files[0]?.content ?? null
        }
    }
}
```

### Custom build script example

```ts
import { generateToDisk } from '@protobuf-x/codegen'
import { glob } from 'glob'

const protoFiles = await glob('./schemas/**/*.proto')

const result = await generateToDisk({
    files: protoFiles,
    target: 'ts',
    outDir: './src/gen',
    importPaths: ['./schemas']
})

if (result.errors.length > 0) {
    for (const err of result.errors) {
        console.error(`${err.file}: ${err.message}`)
    }
    process.exit(1)
}
console.log(`Generated ${result.files.length} files`)
```

## Generated code highlights

### Type-safe dot notation for nested types

```proto
message User {
  enum Role { GUEST = 0; ADMIN = 1; }
  message Profile { string bio = 1; }
}
```

```ts
import { User } from './gen/user_pb.js'

// Both work — class+namespace merge means User.Role is also a value
const role: User.Role = User.Role.ADMIN
const profile = new User.Profile({ bio: 'hi' })
console.log(profile instanceof User.Profile) // true
```

### Real classes with `instanceof` + Partial constructors

```ts
const user = new User({ name: 'Alice', age: 30 }) // type-checked Partial<User>
console.log(user instanceof User) // true
const bytes = user.toBinary() // Uint8Array
const decoded = User.decode(bytes) // typed
```

### 64-bit integer representation (`--int64-as`)

By default, `int64`/`uint64`/`sint64`/`fixed64`/`sfixed64` fields use native
JavaScript `bigint` — full precision, no `Long` wrapper, fastest path on the
wire.

```ts
// proto: int64 timestamp = 1;
const evt = new Event({ timestamp: 1735689600000n }) // bigint
```

Three modes are supported:

| Flag                | Class field type | Tradeoff                                                            |
| ------------------- | ---------------- | ------------------------------------------------------------------- |
| `--int64-as bigint` | `bigint`         | **Default.** Full precision, fastest, no conversion overhead        |
| `--int64-as number` | `number`         | Drop-in for `protobufjs` numeric users; loses precision above 2^53  |
| `--int64-as string` | `string`         | Safe for JSON interop, no precision loss, slowest (BigInt wrapping) |

Both `number` and `string` modes wrap with `BigInt(...)` internally on
encode and unwrap with `Number(...)` / `String(...)` on decode, so the
storage type matches what your code expects without any `Long` shim.

```bash
protobuf-x --int64-as number --out gen schema.proto
```

```ts
// With --int64-as number:
const evt = new Event({ timestamp: 1735689600000 }) // plain number
```

### POJO input interface (`IFoo`)

For every generated class `Foo`, a POJO-shaped interface `IFoo` is also
emitted (zero runtime cost — interfaces are erased at compile time). This
mirrors the `protobufjs` static-module shape, where every field is optional
and nullable, and nested message references use the `I`-prefixed peer.

```ts
// Generated:
export interface IUser {
    id?: string | null
    name?: string | null
    profile?: IUser_Profile | null // ← I-prefixed nested type
}
export class User extends Message<User> implements IUser {
    /* ... */
}

// Use IUser anywhere you want POJO input typing without forcing a class
// instance — useful for API request bodies, form state, etc.
function saveUser(input: IUser) {
    return User.encode(new User(input)).finish()
}
```

The class `Foo` always satisfies `IFoo`, so plain objects matching the
interface can be passed straight to the constructor.

### proto3 implicit-presence warning

Generated `.ts` files include a header listing every proto3 scalar field
that uses **implicit presence** (i.e. `int32 count = 1;` rather than
`optional int32 count = 1;`). These decode to their zero value (`0`, `""`,
`false`, empty bytes) when missing on the wire — **not** `undefined`.

This is a common footgun when migrating from `protobufjs`, where code like
`if (msg.count) { ... }` silently misbehaves when `count` is legitimately
zero. To distinguish "absent" from "default", mark the field `optional`
in your `.proto` file. The warning is capped to 30 entries with an
overflow line for larger schemas.

## Performance of generated code

| Operation     |      protobuf-x | protobufjs | Ratio |
| ------------- | --------------: | ---------: | ----: |
| Encode small  |  **9.0M ops/s** |       5.3M | 1.71x |
| Encode medium |  **1.7M ops/s** |       1.2M | 1.43x |
| Decode small  | **10.6M ops/s** |       8.8M | 1.21x |
| Create small  |   **27M ops/s** |        12M | 2.16x |
| toJSON small  |  **150M ops/s** |        41M | 3.68x |
| Clone medium  |  **833K ops/s** |      ~500K | 1.65x |

## Bundle size of generated code

For `bench.proto` (4 messages: Small/Address/Medium/Large):

| Library                 | Generated (min, brotli) |
| ----------------------- | ----------------------: |
| **@protobuf-x/codegen** |                  2.6 KB |
| protobufjs              |                  2.2 KB |

When combined with the runtime, **total shipped** (brotli) is significantly smaller:

|                        | runtime + gen |
| ---------------------- | ------------: |
| **protobuf-x minimal** |    **6.0 KB** |
| protobufjs minimal     |        8.4 KB |
| **protobuf-x full**    |   **10.0 KB** |
| protobufjs full        |       23.7 KB |

## Compatibility

- **Wire format**: 100% compatible with `protoc`, `protobufjs`, `@bufbuild/protobuf`,
  Google's reference implementations, and any other compliant protobuf library
- **Node.js**: 18+
- **Cross-decode verified** against `protobufjs`

## License

MIT
