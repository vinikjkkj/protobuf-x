import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseArgs, validateArgs, getHelpText, ArgError } from '../args.js'

describe('parseArgs', () => {
    it('should parse --out flag', () => {
        const result = parseArgs(['-o', './gen', 'user.proto'])
        assert.equal(result.out, './gen')
        assert.deepEqual(result.files, ['user.proto'])
    })

    it('should parse --out long form', () => {
        const result = parseArgs(['--out', './gen', 'user.proto'])
        assert.equal(result.out, './gen')
    })

    it('should parse --target flag', () => {
        const result = parseArgs(['-o', './gen', '-t', 'js', 'user.proto'])
        assert.equal(result.target, 'js')
    })

    it('should parse --target both', () => {
        const result = parseArgs(['--out', './gen', '--target', 'both', 'user.proto'])
        assert.equal(result.target, 'both')
    })

    it('should default target to ts', () => {
        const result = parseArgs(['-o', './gen', 'user.proto'])
        assert.equal(result.target, 'ts')
    })

    it('should parse --import-path (repeated)', () => {
        const result = parseArgs([
            '-o',
            './gen',
            '--import-path',
            '/usr/include',
            '--import-path',
            '/opt/protos',
            'user.proto'
        ])
        assert.deepEqual(result.importPaths, ['/usr/include', '/opt/protos'])
    })

    it('should parse --runtime-package', () => {
        const result = parseArgs(['-o', './gen', '--runtime-package', 'my-runtime', 'user.proto'])
        assert.equal(result.runtimePackage, 'my-runtime')
    })

    it('should default runtime-package to @protobuf-x/runtime', () => {
        const result = parseArgs(['-o', './gen', 'user.proto'])
        assert.equal(result.runtimePackage, '@protobuf-x/runtime')
    })

    it('should parse --help flag', () => {
        const result = parseArgs(['--help'])
        assert.equal(result.help, true)
    })

    it('should parse -h flag', () => {
        const result = parseArgs(['-h'])
        assert.equal(result.help, true)
    })

    it('should parse --version flag', () => {
        const result = parseArgs(['--version'])
        assert.equal(result.version, true)
    })

    it('should parse -v flag', () => {
        const result = parseArgs(['-v'])
        assert.equal(result.version, true)
    })

    it('should collect multiple positional files', () => {
        const result = parseArgs(['-o', './gen', 'a.proto', 'b.proto', 'c.proto'])
        assert.deepEqual(result.files, ['a.proto', 'b.proto', 'c.proto'])
    })

    it('should throw on unknown option', () => {
        assert.throws(
            () => parseArgs(['--unknown']),
            (err: unknown) => err instanceof ArgError && /Unknown option/.test(err.message)
        )
    })

    it('should throw on invalid target', () => {
        assert.throws(
            () => parseArgs(['-o', './gen', '-t', 'invalid']),
            (err: unknown) => err instanceof ArgError && /Invalid target/.test(err.message)
        )
    })

    it('should throw when -t is provided without a value', () => {
        assert.throws(
            () => parseArgs(['-o', './gen', '-t']),
            (err: unknown) => err instanceof ArgError && /Invalid target/.test(err.message)
        )
    })

    it('should throw when --out is missing a value', () => {
        assert.throws(
            () => parseArgs(['-o', '-t', 'ts']),
            (err: unknown) => err instanceof ArgError && /Missing value/.test(err.message)
        )
    })

    it('should throw when --import-path is missing a value', () => {
        assert.throws(
            () => parseArgs(['--import-path']),
            (err: unknown) => err instanceof ArgError && /Missing value/.test(err.message)
        )
    })

    it('should throw when --runtime-package is missing a value', () => {
        assert.throws(
            () => parseArgs(['--runtime-package', '--out', 'x']),
            (err: unknown) => err instanceof ArgError && /Missing value/.test(err.message)
        )
    })
})

describe('validateArgs', () => {
    it('should return null for valid args', () => {
        const args = parseArgs(['-o', './gen', 'user.proto'])
        assert.equal(validateArgs(args), null)
    })

    it('should return error when --out is missing', () => {
        const args = parseArgs(['user.proto'])
        const err = validateArgs(args)
        assert.ok(err)
        assert.ok(err.includes('--out'))
    })

    it('should return error when no files are specified', () => {
        const args = parseArgs(['-o', './gen'])
        const err = validateArgs(args)
        assert.ok(err)
        assert.ok(err.includes('.proto'))
    })

    it('should return null when --help is set (even without required args)', () => {
        const args = parseArgs(['--help'])
        assert.equal(validateArgs(args), null)
    })

    it('should return null when --version is set (even without required args)', () => {
        const args = parseArgs(['-v'])
        assert.equal(validateArgs(args), null)
    })
})

describe('getHelpText', () => {
    it('should include usage information', () => {
        const help = getHelpText()
        assert.ok(help.includes('Usage:'))
        assert.ok(help.includes('--out'))
        assert.ok(help.includes('--target'))
        assert.ok(help.includes('--help'))
        assert.ok(help.includes('--version'))
        assert.ok(help.includes('--import-path'))
        assert.ok(help.includes('--runtime-package'))
    })
})
