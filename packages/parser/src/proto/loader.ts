import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

import type { ProtoFileNode } from '../ast/nodes.js'
import { ProtoParser } from '../ast/parser.js'

import { ProtoFile } from './file.js'

export interface LoaderOptions {
    /** Additional directories to search for imports. */
    importPaths?: string[]
    /** Encoding to use when reading files. Default: 'utf-8'. */
    encoding?: BufferEncoding
}

/**
 * Loads .proto files from the filesystem, resolving imports.
 */
export class ProtoLoader {
    private readonly importPaths: string[]
    private readonly encoding: BufferEncoding
    private readonly parser = new ProtoParser()
    private readonly cache = new Map<string, ProtoFileNode>()

    constructor(options?: LoaderOptions) {
        this.importPaths = options?.importPaths ?? []
        this.encoding = options?.encoding ?? 'utf-8'
    }

    /**
     * Load a .proto file and all its transitive imports.
     * Returns a ProtoFile wrapping the root file's AST.
     *
     * @param filePath - The path to the .proto file.
     */
    load(filePath: string): ProtoFile {
        const absolutePath = resolve(filePath)
        const ast = this.loadFile(absolutePath)
        return new ProtoFile(ast)
    }

    /**
     * Load and return all parsed ASTs (root + all imported files).
     * Useful when you need access to type definitions from imports.
     */
    loadAll(filePath: string): Map<string, ProtoFileNode> {
        const absolutePath = resolve(filePath)
        this.loadFile(absolutePath)
        return new Map(this.cache)
    }

    // ── private ────────────────────────────────────────────────

    private loadFile(absolutePath: string): ProtoFileNode {
        const cached = this.cache.get(absolutePath)
        if (cached) return cached

        const source = readFileSync(absolutePath, this.encoding)
        const ast = this.parser.parse(source)
        this.cache.set(absolutePath, ast)

        // Resolve and load imports
        const fileDir = dirname(absolutePath)
        for (const imp of ast.imports) {
            const importPath = this.resolveImportPath(imp.path, fileDir)
            if (importPath !== undefined) {
                this.loadFile(importPath)
            }
            // If import cannot be resolved, silently skip (caller can check AST imports)
        }

        return ast
    }

    /**
     * Resolve an import path to an absolute filesystem path.
     * Searches:
     * 1. Relative to the importing file's directory.
     * 2. Each configured import path directory.
     */
    private resolveImportPath(importPath: string, fileDir: string): string | undefined {
        // Try relative to the importing file
        const candidate = resolve(fileDir, importPath)
        if (this.fileExists(candidate)) return candidate

        // Try each import path
        for (const dir of this.importPaths) {
            const abs = resolve(dir, importPath)
            if (this.fileExists(abs)) return abs
        }

        return undefined
    }

    private fileExists(path: string): boolean {
        try {
            readFileSync(path)
            return true
        } catch {
            return false
        }
    }
}

/**
 * Convenience function: parse a .proto source string directly.
 * Does not resolve imports.
 */
export function parseProto(source: string): ProtoFile {
    const parser = new ProtoParser()
    const ast = parser.parse(source)
    return new ProtoFile(ast)
}
