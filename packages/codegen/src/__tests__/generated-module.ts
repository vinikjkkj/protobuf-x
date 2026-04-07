import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
