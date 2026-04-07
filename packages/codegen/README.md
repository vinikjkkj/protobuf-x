# @protobuf-x/codegen

> Code generator CLI + programmatic API for [protobuf-x](https://github.com/vinikjkkj/protobuf-x). Generates fast, type-safe TypeScript/JavaScript from `.proto` files.

- 🚀 **Generates the fastest protobuf code in JS** — wins 9-10/10 benchmarks vs `protobufjs`
- 📦 **Smaller output** — defaults are tuned for size; `--no-json` shaves another ~10%
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
```

| Option                     | Description                                                  |
| -------------------------- | ------------------------------------------------------------ |
| `-o, --out <dir>`          | Output directory (required)                                  |
| `-t, --target <type>`      | `ts` (default), `js`, or `both`                              |
| `--import-path <path>`     | Add a directory to the proto import search path (repeatable) |
| `--runtime-package <name>` | Override runtime package (default `@protobuf-x/runtime`)     |
| `--no-json`                | Skip `toJSON`/`fromJSON` + JSON interfaces                   |
| `-h, --help`               | Show help                                                    |
| `-v, --version`            | Show version                                                 |

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

# Use the minimal runtime (auto-enables --no-json)
protobuf-x --runtime-package @protobuf-x/runtime/minimal --out gen schema.proto

# Compile a tree of files with import paths
protobuf-x --import-path ./schemas --import-path ./vendor --out gen schemas/main.proto
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

### Native bigint for 64-bit fields

```ts
// proto: int64 timestamp = 1;
const evt = new Event({ timestamp: 1735689600000n }) // bigint, no Long wrapper
```

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
