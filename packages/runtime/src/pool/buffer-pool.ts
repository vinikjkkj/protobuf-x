/**
 * Slab allocator for Uint8Array buffers.
 * Pre-allocates a large buffer and hands out subarray slices.
 * When exhausted, allocates a new slab. Zero-copy within a slab.
 */
export class BufferPool {
    private readonly slabSize: number
    private slab: Uint8Array
    private offset: number

    constructor(slabSize = 65536) {
        this.slabSize = slabSize
        this.slab = new Uint8Array(slabSize)
        this.offset = 0
    }

    /**
     * Allocate a buffer of `size` bytes.
     * Returns a subarray of the current slab if there's room,
     * otherwise allocates a new slab first.
     * For sizes larger than the slab, returns a standalone buffer.
     */
    alloc(size: number): Uint8Array {
        if (size > this.slabSize) {
            return new Uint8Array(size)
        }

        if (this.offset + size > this.slabSize) {
            // Current slab exhausted, allocate new one
            this.slab = new Uint8Array(this.slabSize)
            this.offset = 0
        }

        const buf = this.slab.subarray(this.offset, this.offset + size)
        this.offset += size
        return buf
    }

    /** Reset the pool, reusing the current slab from the beginning. */
    reset(): void {
        this.offset = 0
    }

    /** Get remaining bytes in current slab. */
    get remaining(): number {
        return this.slabSize - this.offset
    }

    /** Get the slab size. */
    get capacity(): number {
        return this.slabSize
    }
}

/** Global shared buffer pool instance. */
export const globalBufferPool = new BufferPool()
