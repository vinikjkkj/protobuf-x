#!/usr/bin/env node
// Cross-platform, cross-Node-version test runner.
//
// Why this exists: `node --test "src/**/*.test.ts"` only supports glob
// patterns natively on Node 21+. For Node 18/20 (and to avoid relying on
// shell glob expansion which differs between bash/zsh/cmd/PowerShell),
// we expand the glob ourselves and pass an explicit file list.
//
// Usage: node --import tsx scripts/run-tests.mjs <glob-pattern>
//        e.g. `node --import tsx scripts/run-tests.mjs "src/**/__tests__/**/*.test.ts"`

import { readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, relative, sep } from 'node:path'

const pattern = process.argv[2]
if (!pattern) {
    console.error('Usage: run-tests.mjs <glob-pattern>')
    process.exit(2)
}

// Convert a simple glob to a regex.
// Supports: `**` (recursive), `*` (single segment), literal characters, `/`.
// We don't need full glob support — just enough for `src/**/__tests__/**/*.test.ts`.
function globToRegex(glob) {
    let re = '^'
    let i = 0
    while (i < glob.length) {
        const c = glob[i]
        if (c === '*') {
            if (glob[i + 1] === '*') {
                // `**` matches any number of path segments (including zero)
                re += '.*'
                i += 2
                if (glob[i] === '/') i++
            } else {
                // `*` matches anything except `/`
                re += '[^/]*'
                i++
            }
        } else if (c === '/') {
            re += '\\/'
            i++
        } else if (/[.+^${}()|[\]\\]/.test(c)) {
            re += '\\' + c
            i++
        } else {
            re += c
            i++
        }
    }
    re += '$'
    return new RegExp(re)
}

function walk(dir, files = []) {
    let entries
    try {
        entries = readdirSync(dir)
    } catch {
        return files
    }
    for (const entry of entries) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
        const full = join(dir, entry)
        let stat
        try {
            stat = statSync(full)
        } catch {
            continue
        }
        if (stat.isDirectory()) {
            walk(full, files)
        } else {
            files.push(full)
        }
    }
    return files
}

const regex = globToRegex(pattern)
const cwd = process.cwd()
const all = walk(cwd)
const matched = all
    // Make paths relative to cwd, normalize separators to forward slashes for matching
    .map((p) => relative(cwd, p).split(sep).join('/'))
    .filter((p) => regex.test(p))

if (matched.length === 0) {
    console.error(`No test files matched pattern: ${pattern}`)
    process.exit(1)
}

const result = spawnSync('node', ['--import', 'tsx', '--test', ...matched], {
    stdio: 'inherit',
    shell: false
})
process.exit(result.status ?? 1)
