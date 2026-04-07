import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { generateJavaScript } from '../generator/js-generator.js'
import { generateTypeScript } from '../generator/ts-generator.js'
import type { ProtoFile, TsGeneratorOptions } from '../generator/ts-generator.js'

const runtimeEntry = fileURLToPath(new URL('../../../runtime/src/index.ts', import.meta.url))

export function toImportSpecifier(fromDir: string, targetFile: string): string {
    const specifier = relative(fromDir, targetFile).replace(/\\/g, '/')
    return specifier.startsWith('.') ? specifier : `./${specifier}`
}

export function runtimePackageSpecifier(fromDir: string): string {
    return toImportSpecifier(fromDir, runtimeEntry)
}

export async function importGeneratedModule(filePath: string): Promise<Record<string, unknown>> {
    const imported = await import(pathToFileURL(filePath).href)
    return (imported.default ?? imported['module.exports'] ?? imported) as Record<string, unknown>
}

export async function generateAndImportModule(
    proto: ProtoFile,
    fileName = 'generated_pb.ts',
    options?: Omit<TsGeneratorOptions, 'runtimePackage'>
): Promise<{ filePath: string; module: Record<string, unknown>; source: string }> {
    const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-generated-'))
    const source = generateTypeScript(proto, {
        runtimePackage: runtimePackageSpecifier(dir),
        ...options
    })
    const filePath = join(dir, fileName)
    writeFileSync(filePath, source, 'utf-8')
    return {
        filePath,
        module: await importGeneratedModule(filePath),
        source
    }
}

export function moduleDir(filePath: string): string {
    return dirname(filePath)
}

/**
 * Generate `.js` (via `generateJavaScript`), write it to a temp dir, and
 * dynamically import it. Used by the JS-target regression tests to verify
 * the generated code is not just syntactically valid but actually loadable
 * by the Node.js ESM loader (catches things like leaked TS-only syntax,
 * bad imports, missing exports).
 */
export async function generateAndImportJsModule(
    proto: ProtoFile,
    fileName = 'generated_pb.js',
    options?: Omit<TsGeneratorOptions, 'runtimePackage'>
): Promise<{ filePath: string; module: Record<string, unknown>; js: string; dts: string }> {
    const dir = mkdtempSync(join(tmpdir(), 'protobuf-x-generated-js-'))
    const { js, dts } = generateJavaScript(proto, {
        runtimePackage: runtimePackageSpecifier(dir),
        ...options
    })
    const filePath = join(dir, fileName)
    writeFileSync(filePath, js, 'utf-8')
    return {
        filePath,
        module: await importGeneratedModule(filePath),
        js,
        dts
    }
}
