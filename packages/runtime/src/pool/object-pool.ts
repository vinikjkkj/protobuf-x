/**
 * Generic object pool for zero-allocation patterns.
 * Pre-allocates objects and recycles them via acquire()/release().
 *
 * If pooled objects have a `reset()` method, it will be invoked when an
 * object is returned to the pool via {@link release}.
 */
export class ObjectPool<T extends object> {
    private readonly pool: T[]
    private readonly factory: () => T
    private readonly maxSize: number

    constructor(factory: () => T, initialSize = 16, maxSize = 1024) {
        this.factory = factory
        this.maxSize = maxSize
        this.pool = []
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(factory())
        }
    }

    /** Acquire an object from the pool, or create a new one if empty. */
    acquire(): T {
        return this.pool.pop() ?? this.factory()
    }

    /**
     * Release an object back to the pool.
     * Calls reset() on the object if available.
     */
    release(obj: T): void {
        if (this.pool.length < this.maxSize) {
            const reset = (obj as { reset?(): void }).reset
            if (typeof reset === 'function') {
                reset.call(obj)
            }
            this.pool.push(obj)
        }
    }

    /** Current number of available objects in the pool. */
    get size(): number {
        return this.pool.length
    }

    /** Drain the pool, releasing all cached objects. */
    drain(): void {
        this.pool.length = 0
    }
}
