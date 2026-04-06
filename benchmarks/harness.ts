import { performance } from 'node:perf_hooks'

export interface BenchResult {
    name: string
    opsPerSec: number
    avgNs: number
    totalMs: number
    iterations: number
    throughputMBs?: number
}

export interface BenchOptions {
    warmup?: number
    iterations?: number
    bytesPerOp?: number
}

/**
 * Run a synchronous benchmark.
 * Warms up first, then measures `iterations` calls.
 */
export function bench(
    name: string,
    fn: () => void,
    opts: BenchOptions = {}
): BenchResult {
    const warmup = opts.warmup ?? 1000
    const iterations = opts.iterations ?? 100_000

    // Warmup
    for (let i = 0; i < warmup; i++) fn()

    // Measure
    const start = performance.now()
    for (let i = 0; i < iterations; i++) fn()
    const totalMs = performance.now() - start

    const avgNs = (totalMs * 1_000_000) / iterations
    const opsPerSec = Math.round((iterations / totalMs) * 1000)

    const result: BenchResult = { name, opsPerSec, avgNs, totalMs, iterations }

    if (opts.bytesPerOp) {
        result.throughputMBs = (opts.bytesPerOp * opsPerSec) / (1024 * 1024)
    }

    return result
}

/**
 * Run an async benchmark.
 */
export async function benchAsync(
    name: string,
    fn: () => Promise<void>,
    opts: BenchOptions = {}
): Promise<BenchResult> {
    const warmup = opts.warmup ?? 100
    const iterations = opts.iterations ?? 10_000

    for (let i = 0; i < warmup; i++) await fn()

    const start = performance.now()
    for (let i = 0; i < iterations; i++) await fn()
    const totalMs = performance.now() - start

    const avgNs = (totalMs * 1_000_000) / iterations
    const opsPerSec = Math.round((iterations / totalMs) * 1000)

    const result: BenchResult = { name, opsPerSec, avgNs, totalMs, iterations }

    if (opts.bytesPerOp) {
        result.throughputMBs = (opts.bytesPerOp * opsPerSec) / (1024 * 1024)
    }

    return result
}

/** Pretty-print benchmark results as a table. */
export function printResults(results: BenchResult[]) {
    const pad = (s: string, n: number) => s.padEnd(n)
    const rpad = (s: string, n: number) => s.padStart(n)

    const nameW = Math.max(20, ...results.map(r => r.name.length + 2))
    const header = [
        pad('Benchmark', nameW),
        rpad('ops/sec', 14),
        rpad('avg (ns)', 12),
        rpad('total (ms)', 12),
        rpad('MB/s', 10)
    ].join(' | ')

    console.log()
    console.log(header)
    console.log('-'.repeat(header.length))

    for (const r of results) {
        console.log([
            pad(r.name, nameW),
            rpad(r.opsPerSec.toLocaleString(), 14),
            rpad(r.avgNs.toFixed(0), 12),
            rpad(r.totalMs.toFixed(1), 12),
            rpad(r.throughputMBs ? r.throughputMBs.toFixed(1) : '-', 10)
        ].join(' | '))
    }

    console.log()
}
