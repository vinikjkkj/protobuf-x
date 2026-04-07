# protobuf-x

> High-performance, zero-dependency TypeScript Protocol Buffers — faster and smaller than `protobufjs`.

- 🚀 **Fastest** — wins **9-10/10** generated benchmarks vs protobufjs
- 📦 **Smallest** — minimal runtime is **3.4 KB brotli** (1.8x smaller than protobufjs minimal)
- 🔒 **Type-safe** — generated `.d.ts` with deep nested types via dot notation (`User.Profile.Settings.Theme`)
- ✅ **No deps** — zero runtime dependencies, pure TypeScript
- 🌐 **Universal** — works in Node.js, Deno, Bun, browsers, edge workers
- 💯 **Complete** — proto2/proto3/editions, all scalar types, oneof, maps, enums, services, well-known types
- 🛠 **Programmatic API** — invoke the codegen from build scripts or bundler plugins, no CLI required

## Why?

Existing TypeScript protobuf libraries trade off performance, bundle size, or type ergonomics. `protobuf-x` aims for all three at once.

|                              | protobuf-x      | protobufjs |
| ---------------------------- | --------------- | ---------- |
| **Encode small**             | **9.0M ops/s**  | 5.3M (58%) |
| **Decode small**             | **10.6M ops/s** | 8.8M (83%) |
| **toJSON small**             | **150M ops/s**  | 41M (27%)  |
| **Bundle (minimal, brotli)** | **3.4 KB**      | 6.2 KB     |
| **Wins (10 benchmarks)**     | **9-10**        | 0-1        |

See [Benchmarks](#benchmarks) below for the full breakdown.

---

## Installation

```bash
npm install @protobuf-x/runtime
npm install -D @protobuf-x/codegen
```

## Quick start

### 1. Define a schema

```proto
// schema.proto
syntax = "proto3";
package chat;

message User {
  string id = 1;
  string name = 2;
  Role role = 3;

  enum Role {
    GUEST = 0;
    USER = 1;
    ADMIN = 2;
  }

  message Profile {
    string bio = 1;
    string avatar_url = 2;
  }
}

message Message {
  User from = 1;
  string text = 2;
  repeated User mentions = 3;
}
```

### 2. Generate code

```bash
npx protobuf-x --out gen schema.proto
```

### 3. Use it

```ts
import { User, Message } from './gen/schema_pb.js'

// Type-safe construction with nested types via dot notation
const alice = new User({
    id: 'u1',
    name: 'Alice',
    role: User.Role.ADMIN // ← enum dot access
})

const msg = new Message({
    from: alice,
    text: 'hey @bob',
    mentions: [new User({ id: 'u2', name: 'Bob', role: User.Role.USER })]
})

// Encode to binary (Uint8Array)
const bytes = msg.toBinary()

// Decode from binary
const decoded = Message.decode(bytes)
console.log(decoded.from?.name) // 'Alice'
console.log(decoded.mentions[0].role) // 1 (User.Role.USER)
console.log(decoded.from instanceof User) // true

// JSON (proto3 canonical mapping)
const json = Message.toJSON(decoded)
const fromJson = Message.fromJSON(json)
```

---

## Benchmarks

Run on `bench.proto` with 4 messages (Small/Address/Medium/Large) on Node.js 25.

### Performance — operations/sec (higher is better)

| Operation     |  **protobuf-x** | protobufjs |  Ratio |
| ------------- | --------------: | ---------: | -----: |
| Encode small  |   **9,031,955** |  5,266,595 |  1.71x |
| Encode medium |   **1,746,438** |  1,222,655 |  1.43x |
| Encode large  |     **161,786** |    147,620 |  1.10x |
| Decode small  |  **10,616,252** |  8,800,059 |  1.21x |
| Decode medium |   **1,681,801** |  1,620,816 |  1.04x |
| Decode large  |     **347,685** |    333,880 |  1.04x |
| Create small  |  **26,843,043** | 12,453,238 |  2.16x |
| toJSON small  | **150,150,150** | 40,811,662 |  3.68x |
| Clone small   |   **4,278,620** |  2,643,950 |  1.62x |
| Clone medium  |     **832,948** |   ~500,000 | ~1.65x |

**Score: protobuf-x 9-10 / protobufjs 0-1** (varies ±1 with measurement noise on the closest contests).

Reproduce: `node --import tsx benchmarks/generated-compare.bench.ts`

### Bundle size — runtime library (brotli-compressed, minified)

| Library                |      Brotli |
| ---------------------- | ----------: |
| **protobuf-x minimal** | **3,438 B** |
| protobufjs minimal     |     6,249 B |
| **protobuf-x full**    | **7,415 B** |
| protobufjs full        |    21,557 B |

### Total shipped (runtime + generated for 4 messages, brotli)

| Library                |       Total |
| ---------------------- | ----------: |
| **protobuf-x minimal** | **6,015 B** |
| protobufjs minimal     |     8,408 B |
| **protobuf-x full**    | **9,992 B** |
| protobufjs full        |    23,716 B |

---

## Features

### Type system

- All 15 proto scalar types (with native `bigint` for 64-bit, no `Long` dependency)
- Messages, nested messages, enums, nested enums, oneof, maps, packed repeated
- Proto2 / proto3 / editions 2023
- Well-known types (`Timestamp`, `Duration`, `Any`, `Struct`, `FieldMask`, wrappers)
- Extensions, groups (proto2 legacy)
- Services with pluggable `Transport` interface
- Reserved field numbers/names

### Type ergonomics

- **Dot-notation nested access**: `User.Profile.Settings.Theme.DARK` (both type and value)
- **`instanceof` works** — generated classes are real JS classes, not POJOs
- **Typed JSON interfaces** — `User.toJSON(msg)` returns `UserJSON`, fully typed; erased at compile time so zero bundle cost
- **Constructor with `Partial<T>`** — `new User({ name: 'Alice' })` is type-checked
- **Field defaults emitted** — `name: string = ''` so missing fields are predictable
- **Optional chaining-friendly** — message fields are `T | undefined`

### Performance optimizations

- **Two-pass encode** — `sizeOf()` + `encodeTo()` allows exact-size allocation, zero grow checks, sequential write
- **Inlined varint** decode/encode (no function calls per byte)
- **Zero-copy** bytes fields and string slices
- **Native `Buffer.utf8Slice`/`utf8Write`** on Node.js (deferred to first string call)
- **Lazy nested-size cache** — nested message sizes computed once per encode
- **Manual byte copy** for ≤64-byte fields (avoids V8 `FastBuffer` wrapper)
- **Inline message base** — no virtual dispatch on encode/decode paths

### Codegen optimizations

- **Compact field descriptors** — defaults (`packed: false`, `rule: SINGULAR`, redundant `jsonName`) omitted
- **`--no-json` flag** — strips `toJSON`/`fromJSON` + JSON interfaces (auto-enabled with minimal runtime)
- **Single-field fast path** — only emitted for sparse messages with >30 fields
- **Class+namespace merge** — `User.Profile` works as both type and value via TS declaration merging
- **Tree-shakeable** — minimal runtime entry point includes only encode/decode (3.4 KB brotli)

---

## Runtime variants

### Full (`@protobuf-x/runtime`) — 7.4 KB brotli

Includes everything: encode/decode, JSON, clone, equals, merge, toJSON/fromJSON,
streaming, services, extensions, well-known types, validation, freeze, patch, diff.

### Minimal (`@protobuf-x/runtime/minimal`) — 3.4 KB brotli

Encode/decode only. For apps that just need binary serialization (RPC, message queues, storage).

```ts
// Full (default)
import { Message, BinaryReader, BinaryWriter } from '@protobuf-x/runtime'

// Minimal
import { Message, BinaryReader, BinaryWriter } from '@protobuf-x/runtime/minimal'
```

When the codegen sees `--runtime-package @protobuf-x/runtime/minimal`, it auto-enables
`--no-json` and skips generating `toJSON`/`fromJSON` methods + interfaces.

---

## CLI

```bash
protobuf-x [options] <file.proto ...>
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

# Both .ts and .js + .d.ts
protobuf-x --target both --out gen schema.proto

# Use minimal runtime (auto-enables --no-json)
protobuf-x --runtime-package @protobuf-x/runtime/minimal --out gen schema.proto

# Compile multiple files with import paths
protobuf-x --import-path ./schemas --import-path ./vendor --out gen schemas/main.proto
```

---

## Programmatic API

For build scripts, bundler plugins, or anywhere you'd rather not shell out to a CLI.

```ts
import { generate, generateToDisk } from '@protobuf-x/codegen'

// Generate in-memory (returns { files, errors })
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

// Generate from in-memory source string (no disk needed)
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

---

## Generated code patterns

### Nested messages with dot notation

```proto
message User {
  message Profile {
    string bio = 1;
    Avatar avatar = 2;
  }
  message Avatar {
    string url = 1;
  }
}
```

```ts
import { User } from './gen/user_pb.js'

// Both work — pick whichever you prefer
const profile1: User.Profile = new User.Profile({ bio: 'hi' }) // dot notation
const profile2: User_Profile = new User_Profile({ bio: 'hi' }) // flat name

// Deep nesting works arbitrarily
const avatar = new User.Avatar({ url: 'https://...' })
profile1.avatar = avatar

console.log(profile1 instanceof User.Profile) // true
console.log(User.Profile === User_Profile) // true (same class)
```

### Enums

```proto
message Order {
  enum Status {
    PENDING = 0;
    SHIPPED = 1;
    DELIVERED = 2;
  }
  Status status = 1;
}
```

```ts
import { Order } from './gen/order_pb.js'

const order = new Order({ status: Order.Status.PENDING })
order.status = Order.Status.SHIPPED

const s: Order.Status = Order.Status.DELIVERED // typed
```

### Oneof

```proto
message Result {
  oneof outcome {
    string success = 1;
    string error = 2;
  }
}
```

```ts
import { Result } from './gen/result_pb.js'

const ok = new Result({ outcome: { case: 'success', value: 'done!' } })
const err = new Result({ outcome: { case: 'error', value: 'oops' } })

if (ok.outcome?.case === 'success') {
    console.log(ok.outcome.value) // narrowed to string
}
```

### Maps

```proto
message Headers {
  map<string, string> entries = 1;
}
```

```ts
import { Headers } from './gen/headers_pb.js'

const h = new Headers({
    entries: new Map([
        ['content-type', 'application/json'],
        ['x-request-id', 'abc123']
    ])
})
```

### Streaming

```ts
import { encodeDelimited, decodeStream } from '@protobuf-x/runtime'

// Encode many messages with length-delimited framing
async function* messages() {
    yield encodeDelimited(User, alice)
    yield encodeDelimited(User, bob)
    yield encodeDelimited(User, carol)
}

// Decode from a stream
for await (const user of decodeStream(User, source)) {
    console.log(user.name)
}
```

---

## Architecture

### Two-pass encode

Most protobuf libraries use a single-pass writer with a growable buffer that pays grow checks per write. `protobuf-x` uses two-pass with several refinements:

1. **`sizeOf(msg)`** computes exact wire size, caching nested message sizes locally
2. **`allocBuf(size)`** allocates exact-size buffer (Buffer.allocUnsafe on Node, Uint8Array elsewhere)
3. **`encodeTo(msg, buf, p)`** writes sequentially into the pre-allocated buffer with **zero grow checks** and **zero conditional branches** beyond the field-presence checks

The generated `toBinary()` inlines all three phases into a single function per message, with cached `_ms_*` and `_bl_*` locals so nested sizeOf and string byte-length are computed exactly once.

### Decode

- Inlined varint decode (no function calls, no tuple allocations)
- Native `Buffer.utf8Slice` for strings on Node.js (lazily wraps on first string call)
- Zero-copy `subarray()` for `bytes` fields
- Switch on field number, not field name
- Nested message decode reuses the parent reader (no sub-reader allocations)

### Generated class shape

- Real JS classes with field initializers
- `static encode/decode/sizeOf/encodeTo/toBinary/toJSON/fromJSON` methods
- Instance methods inherited from `Message<T>` base
- `Object.create(prototype)` decode bypass for messages without field defaults (skips constructor)
- Class+namespace merge for nested type access (`User.Profile`)

---

## Packages

| Package                                     | Description                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| [`@protobuf-x/runtime`](./packages/runtime) | The runtime library: `BinaryReader`, `BinaryWriter`, `Message` base, helpers |
| [`@protobuf-x/parser`](./packages/parser)   | Pure-JS `.proto` parser (used at codegen time, not shipped to runtime)       |
| [`@protobuf-x/codegen`](./packages/codegen) | CLI + programmatic API for generating TS/JS from `.proto` files              |

---

## Project status

Pre-1.0. API stable for the documented features. Pinning to a minor version is recommended.

### Tested

- 416 unit tests across runtime + parser + codegen
- 28 end-to-end tests (full proto → generate → encode/decode → roundtrip)
- 8 programmatic API tests
- Wire-compatible with `protoc` and `protobufjs` (cross-decode verified)

### Not yet supported

- Reflection-based dynamic message construction (use generated code instead)
- gRPC server transport (only client `Transport` interface; bring your own implementation)
- JSON streaming (binary streaming works)

---

## Development

```bash
# Install
npm install

# Build all packages
npm run build

# Run all tests (416 + 28 e2e + 8 API = 452 tests)
npm test

# Run benchmarks
node --import tsx benchmarks/generated-compare.bench.ts
node --import tsx benchmarks/compare-protobufjs.bench.ts

# Lint + format
npm run lint
npm run format
```

---

## License

MIT
