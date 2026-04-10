/**
 * Zero-dependency CLI argument parser for protobuf-x.
 */

export interface ParsedArgs {
    /** Output directory (required). */
    out: string
    /** Target output format. */
    target: 'ts' | 'js' | 'both'
    /** Additional import search paths. */
    importPaths: string[]
    /** Override the runtime package name. */
    runtimePackage: string
    /**
     * Skip generating toJSON/fromJSON + JSON interfaces. Smaller output for
     * apps that only use binary serialization. Auto-enabled when runtime-package
     * targets /minimal.
     */
    noJson: boolean
    /**
     * Skip generating Message.create() static factory method.
     * Reduces output size; use `new Message()` instead.
     */
    noCreate: boolean
    /**
     * Skip generating getTypeUrl helper.
     * Reduces output size; only needed for google.protobuf.Any interop.
     */
    noTypeurl: boolean
    /**
     * Minimal mode: enables --no-json, --no-create, --no-typeurl
     * all at once for smallest possible binary-only output.
     */
    minimal: boolean
    /**
     * JS representation for 64-bit integer fields (int64/uint64/sint64/fixed64/sfixed64).
     *  - 'bigint' (default): native BigInt — full precision, fastest
     *  - 'number':           JS number — easy interop, loses precision above 2^53
     *  - 'string':           decimal string — interop with JSON, full precision
     */
    int64As: 'bigint' | 'number' | 'string'
    /** Positional .proto file paths. */
    files: string[]
    /** Whether --help was passed. */
    help: boolean
    /** Whether --version was passed. */
    version: boolean
}

export class ArgError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ArgError'
    }
}

const HELP_TEXT = `
Usage: protobuf-x [options] <file.proto ...>
       pbx        [options] <file.proto ...>   (alias)

Options:
  -o, --out <dir>              Output directory (required)
  -t, --target <type>          Output target: "ts" | "js" | "both" (default: "ts")
      --import-path <path>     Additional import search path (can be repeated)
      --runtime-package <name> Override runtime package name
                               (default: "@protobuf-x/runtime")
      --no-json                Skip toJSON/fromJSON + JSON interfaces
                               (auto-enabled with --minimal or @protobuf-x/runtime/minimal)
      --no-create              Skip Message.create() factory (use new Message() instead)
                               (auto-enabled with --minimal or @protobuf-x/runtime/minimal)
      --no-typeurl             Skip getTypeUrl helper
                               (auto-enabled with --minimal or @protobuf-x/runtime/minimal)
      --minimal                Enable all --no-* flags above (smallest binary-only output)
                               Note: @protobuf-x/runtime/minimal also auto-enables --no-json,
                               --no-create, --no-typeurl
      --int64-as <repr>        JS representation for 64-bit integer fields:
                               "bigint" (default), "number", or "string"
  -h, --help                   Show this help message
  -v, --version                Show version

Examples:
  protobuf-x -o ./gen ./protos/user.proto
  pbx -o ./gen --target both --int64-as number ./protos/*.proto
  pbx -o ./gen --minimal ./protos/*.proto
`.trim()

export function getHelpText(): string {
    return HELP_TEXT
}

export function parseArgs(argv: string[]): ParsedArgs {
    const result: ParsedArgs = {
        out: '',
        target: 'ts',
        importPaths: [],
        runtimePackage: '@protobuf-x/runtime',
        noJson: false,
        noCreate: false,
        noTypeurl: false,
        minimal: false,
        int64As: 'bigint',
        files: [],
        help: false,
        version: false
    }

    let i = 0
    while (i < argv.length) {
        const arg = argv[i]!

        if (arg === '-h' || arg === '--help') {
            result.help = true
            i++
            continue
        }

        if (arg === '-v' || arg === '--version') {
            result.version = true
            i++
            continue
        }

        if (arg === '-o' || arg === '--out') {
            i++
            const val = argv[i]
            if (val === undefined || val.startsWith('-')) {
                throw new ArgError('Missing value for --out')
            }
            result.out = val
            i++
            continue
        }

        if (arg === '-t' || arg === '--target') {
            i++
            const val = argv[i]
            if (val !== 'ts' && val !== 'js' && val !== 'both') {
                throw new ArgError(`Invalid target "${val ?? ''}". Must be "ts", "js", or "both".`)
            }
            result.target = val
            i++
            continue
        }

        if (arg === '--import-path') {
            i++
            const val = argv[i]
            if (val === undefined || val.startsWith('-')) {
                throw new ArgError('Missing value for --import-path')
            }
            result.importPaths.push(val)
            i++
            continue
        }

        if (arg === '--runtime-package') {
            i++
            const val = argv[i]
            if (val === undefined || val.startsWith('-')) {
                throw new ArgError('Missing value for --runtime-package')
            }
            result.runtimePackage = val
            i++
            continue
        }

        if (arg === '--no-json') {
            result.noJson = true
            i++
            continue
        }

        if (arg === '--no-create') {
            result.noCreate = true
            i++
            continue
        }

        if (arg === '--no-typeurl') {
            result.noTypeurl = true
            i++
            continue
        }

        if (arg === '--minimal') {
            result.minimal = true
            i++
            continue
        }

        if (arg === '--int64-as') {
            i++
            const val = argv[i]
            if (val !== 'bigint' && val !== 'number' && val !== 'string') {
                throw new ArgError(
                    `Invalid --int64-as value "${val ?? ''}". Must be "bigint", "number", or "string".`
                )
            }
            result.int64As = val
            i++
            continue
        }

        if (arg.startsWith('-')) {
            throw new ArgError(`Unknown option: ${arg}`)
        }

        // Positional argument - proto file
        result.files.push(arg)
        i++
    }

    return result
}

/**
 * Validate parsed args for required fields.
 * Returns an error message or null if valid.
 */
export function validateArgs(args: ParsedArgs): string | null {
    if (args.help || args.version) {
        return null
    }
    if (!args.out) {
        return 'Missing required option: --out <dir>'
    }
    if (args.files.length === 0) {
        return 'No .proto files specified'
    }
    return null
}
