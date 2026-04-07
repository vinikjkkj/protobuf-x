import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import * as esbuild from 'esbuild'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const target = process.argv[2] // 'runtime' | 'parser' | 'codegen' | undefined (all)

function findTsFiles(dir: string): string[] {
    const files: string[] = []
    if (!existsSync(dir)) return files
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'node_modules') continue
            files.push(...findTsFiles(full))
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
            files.push(full)
        }
    }
    return files
}

async function buildPackage(name: string) {
    const pkgDir = join(ROOT, 'packages', name)
    const srcDir = join(pkgDir, 'src')
    const entryPoints = findTsFiles(srcDir)

    if (entryPoints.length === 0) {
        console.log(`[${name}] No source files found, skipping`)
        return
    }

    // ESM build
    await esbuild.build({
        entryPoints,
        outdir: join(pkgDir, 'dist', 'esm'),
        format: 'esm',
        platform: 'neutral',
        target: 'es2020',
        treeShaking: true,
        minifySyntax: true,
        sourcemap: true,
        outExtension: { '.js': '.js' }
    })

    // CJS build
    await esbuild.build({
        entryPoints,
        outdir: join(pkgDir, 'dist', 'cjs'),
        format: 'cjs',
        platform: 'neutral',
        target: 'es2020',
        treeShaking: true,
        minifySyntax: true,
        sourcemap: true,
        outExtension: { '.js': '.cjs' }
    })

    // Rewrite .js imports to .cjs in CJS output
    const cjsDir = join(pkgDir, 'dist', 'cjs')
    rewriteCjsImports(cjsDir)

    // Generate declarations
    execSync(`npx tsc -p ${join(pkgDir, 'tsconfig.json')} --emitDeclarationOnly`, {
        stdio: 'inherit',
        cwd: ROOT
    })

    // Build bin/ entries (CLI executables) — bundled, ESM, with shebang.
    // Bin source files import from `../src/...`, so we bundle each into a
    // self-contained file under dist/bin/. `packages: 'external'` keeps
    // node_modules deps out of the bundle.
    const binDir = join(pkgDir, 'bin')
    const binEntries = findTsFiles(binDir)
    if (binEntries.length > 0) {
        await esbuild.build({
            entryPoints: binEntries,
            outdir: join(pkgDir, 'dist', 'bin'),
            format: 'esm',
            platform: 'node',
            // ES2022 needed for top-level await in CLI entry points
            target: 'es2022',
            bundle: true,
            packages: 'external',
            sourcemap: true,
            outExtension: { '.js': '.js' }
        })
        // esbuild strips the source `#!/usr/bin/env node` shebang during
        // bundling — restore it on each generated bin file.
        const binOutDir = join(pkgDir, 'dist', 'bin')
        for (const entry of readdirSync(binOutDir, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith('.js')) {
                const full = join(binOutDir, entry.name)
                const content = readFileSync(full, 'utf-8')
                if (!content.startsWith('#!')) {
                    writeFileSync(full, `#!/usr/bin/env node\n${content}`, 'utf-8')
                }
            }
        }
    }

    console.log(`[${name}] Build complete`)
}

async function main() {
    const packages = target ? [target] : ['runtime', 'parser', 'codegen']
    for (const pkg of packages) {
        await buildPackage(pkg)
    }
}

/** Rewrite require("./foo.js") to require("./foo.cjs") in CJS output files */
function rewriteCjsImports(dir: string) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            rewriteCjsImports(full)
        } else if (entry.name.endsWith('.cjs')) {
            let content = readFileSync(full, 'utf-8')
            const rewritten = content.replace(
                /require\("(\.\.?\/[^"]+)\.js"\)/g,
                'require("$1.cjs")'
            )
            if (rewritten !== content) {
                writeFileSync(full, rewritten, 'utf-8')
            }
        }
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
