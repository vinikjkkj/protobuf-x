/**
 * Hand-written test messages for benchmarks.
 * Uses two-pass encode (sizeOf + direct write) for maximum performance.
 * No BinaryWriter overhead — writes directly into a pre-sized buffer.
 */
import { BinaryReader, BinaryWriter, Message, encodeBase64 } from '../packages/runtime/src/index.js'
import type { MessageDescriptor } from '../packages/runtime/src/index.js'
import { varint32Size } from '../packages/runtime/src/binary/varint.js'

// Platform detection
const B = typeof globalThis.Buffer === 'function' ? globalThis.Buffer : null
const te = B ? null : new TextEncoder()

function strLen(s: string): number {
    return B ? B.byteLength(s, 'utf8') : te!.encode(s).length
}

function strWrite(s: string, buf: Uint8Array, pos: number, len: number): void {
    if (B) { (buf as unknown as { utf8Write(s: string, o: number, l: number): number }).utf8Write(s, pos, len) }
    else { te!.encodeInto(s, buf.subarray(pos)) }
}

function alloc(n: number): Uint8Array {
    return B ? B.allocUnsafe(n) : new Uint8Array(n)
}

function writeVarint(value: number, buf: Uint8Array, p: number): number {
    value = value >>> 0
    if (value < 0x80) { buf[p++] = value; return p }
    buf[p++] = (value & 0x7f) | 0x80
    if (value < 0x4000) { buf[p++] = value >>> 7; return p }
    buf[p++] = ((value >>> 7) & 0x7f) | 0x80
    if (value < 0x200000) { buf[p++] = value >>> 14; return p }
    buf[p++] = ((value >>> 14) & 0x7f) | 0x80
    if (value < 0x10000000) { buf[p++] = value >>> 21; return p }
    buf[p++] = ((value >>> 21) & 0x7f) | 0x80
    buf[p++] = value >>> 28; return p
}

const DESC: MessageDescriptor = { name: '', fields: [], oneofs: [], nestedTypes: new Map(), nestedEnums: new Map() }

// ── Small message: 3 scalar fields ──────────────────────────

export class SmallMessage extends Message<SmallMessage> {
    name = ''
    id = 0
    active = false

    constructor(init?: Partial<SmallMessage>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor = DESC

    static sizeOf(msg: SmallMessage): number {
        let s = 0
        if (msg.name !== '') { const bl = strLen(msg.name); s += 1 + varint32Size(bl) + bl }
        if (msg.id !== 0) { s += 1 + varint32Size(msg.id) }
        if (msg.active) { s += 2 }
        return s
    }

    static encodeTo(msg: SmallMessage, buf: Uint8Array, p: number): number {
        if (msg.name !== '') { buf[p++] = 0x0a; const bl = strLen(msg.name); p = writeVarint(bl, buf, p); strWrite(msg.name, buf, p, bl); p += bl }
        if (msg.id !== 0) { buf[p++] = 0x10; p = writeVarint(msg.id, buf, p) }
        if (msg.active) { buf[p++] = 0x18; buf[p++] = 1 }
        return p
    }

    toBinary(): Uint8Array {
        const size = SmallMessage.sizeOf(this)
        const buf = alloc(size)
        SmallMessage.encodeTo(this, buf, 0)
        return buf
    }

    static encode(msg: SmallMessage, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.name !== '') { w.raw(new Uint8Array([0x0a])); w.string(msg.name) }
        if (msg.id !== 0) { w.raw(new Uint8Array([0x10])); w.uint32(msg.id) }
        if (msg.active) { w.raw(new Uint8Array([0x18])); w.bool(msg.active) }
        return w
    }

    static decode(buf: Uint8Array): SmallMessage {
        const r = BinaryReader.create(buf)
        const msg = new SmallMessage()
        while (r.pos < r.end) {
            const tag = r.uint32()
            switch (tag >>> 3) {
                case 1: msg.name = r.string(); break
                case 2: msg.id = r.uint32(); break
                case 3: msg.active = r.bool(); break
                default: r.skip(tag & 7)
            }
        }
        return msg
    }

    // Code-generated toJSON — inline per field, no Object.entries
    toJSON(): Record<string, unknown> {
        return { name: this.name, id: this.id, active: this.active }
    }

    // Code-generated fromJSON — direct property set, no intermediate object
    static fromJSON(obj: Record<string, unknown>): SmallMessage {
        const m = new SmallMessage()
        if (obj.name !== undefined) m.name = obj.name as string
        if (obj.id !== undefined) m.id = obj.id as number
        if (obj.active !== undefined) m.active = obj.active as boolean
        return m
    }

    // Code-generated verify — inline type checks
    static verify(msg: SmallMessage): string | null {
        if (typeof msg.name !== 'string') return 'name: expected string'
        if (typeof msg.id !== 'number') return 'id: expected number'
        if (typeof msg.active !== 'boolean') return 'active: expected boolean'
        return null
    }
}

// ── Medium message: nested + repeated ───────────────────────

export class Address extends Message<Address> {
    street = ''
    city = ''
    zip = ''

    constructor(init?: Partial<Address>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor = DESC

    static sizeOf(msg: Address): number {
        let s = 0
        if (msg.street !== '') { const bl = strLen(msg.street); s += 1 + varint32Size(bl) + bl }
        if (msg.city !== '') { const bl = strLen(msg.city); s += 1 + varint32Size(bl) + bl }
        if (msg.zip !== '') { const bl = strLen(msg.zip); s += 1 + varint32Size(bl) + bl }
        return s
    }

    static encodeTo(msg: Address, buf: Uint8Array, p: number): number {
        if (msg.street !== '') { buf[p++] = 0x0a; const bl = strLen(msg.street); p = writeVarint(bl, buf, p); strWrite(msg.street, buf, p, bl); p += bl }
        if (msg.city !== '') { buf[p++] = 0x12; const bl = strLen(msg.city); p = writeVarint(bl, buf, p); strWrite(msg.city, buf, p, bl); p += bl }
        if (msg.zip !== '') { buf[p++] = 0x1a; const bl = strLen(msg.zip); p = writeVarint(bl, buf, p); strWrite(msg.zip, buf, p, bl); p += bl }
        return p
    }

    toBinary(): Uint8Array {
        const size = Address.sizeOf(this)
        const buf = alloc(size)
        Address.encodeTo(this, buf, 0)
        return buf
    }

    static encode(msg: Address, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.street !== '') { w.raw(new Uint8Array([0x0a])); w.string(msg.street) }
        if (msg.city !== '') { w.raw(new Uint8Array([0x12])); w.string(msg.city) }
        if (msg.zip !== '') { w.raw(new Uint8Array([0x1a])); w.string(msg.zip) }
        return w
    }

    static decode(buf: Uint8Array): Address {
        const r = BinaryReader.create(buf)
        return Address.decodeReader(r, r.end)
    }

    /** Decode directly from a reader up to `end` — avoids creating a new BinaryReader. */
    static decodeReader(r: BinaryReader, end: number): Address {
        const msg = new Address()
        while (r.pos < end) {
            const tag = r.uint32()
            switch (tag >>> 3) {
                case 1: msg.street = r.string(); break
                case 2: msg.city = r.string(); break
                case 3: msg.zip = r.string(); break
                default: r.skip(tag & 7)
            }
        }
        return msg
    }

    toJSON(): Record<string, unknown> {
        return { street: this.street, city: this.city, zip: this.zip }
    }

    static fromJSON(obj: Record<string, unknown>): Address {
        return new Address({
            street: obj.street as string ?? '',
            city: obj.city as string ?? '',
            zip: obj.zip as string ?? ''
        })
    }
}

export class MediumMessage extends Message<MediumMessage> {
    name = ''
    age = 0
    address: Address | undefined = undefined
    tags: string[] = []

    constructor(init?: Partial<MediumMessage>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor = DESC

    static sizeOf(msg: MediumMessage): number {
        let s = 0
        if (msg.name !== '') { const bl = strLen(msg.name); s += 1 + varint32Size(bl) + bl }
        if (msg.age !== 0) { s += 1 + varint32Size(msg.age) }
        if (msg.address !== undefined) {
            const ns = Address.sizeOf(msg.address)
            s += 1 + varint32Size(ns) + ns
        }
        for (const t of msg.tags) { const bl = strLen(t); s += 1 + varint32Size(bl) + bl }
        return s
    }

    static encodeTo(msg: MediumMessage, buf: Uint8Array, p: number): number {
        if (msg.name !== '') { buf[p++] = 0x0a; const bl = strLen(msg.name); p = writeVarint(bl, buf, p); strWrite(msg.name, buf, p, bl); p += bl }
        if (msg.age !== 0) { buf[p++] = 0x10; p = writeVarint(msg.age, buf, p) }
        if (msg.address !== undefined) {
            buf[p++] = 0x1a
            const ns = Address.sizeOf(msg.address)
            p = writeVarint(ns, buf, p)
            p = Address.encodeTo(msg.address, buf, p)
        }
        for (const t of msg.tags) { buf[p++] = 0x22; const bl = strLen(t); p = writeVarint(bl, buf, p); strWrite(t, buf, p, bl); p += bl }
        return p
    }

    toBinary(): Uint8Array {
        const size = MediumMessage.sizeOf(this)
        const buf = alloc(size)
        MediumMessage.encodeTo(this, buf, 0)
        return buf
    }

    static encode(msg: MediumMessage, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.name !== '') { w.raw(new Uint8Array([0x0a])); w.string(msg.name) }
        if (msg.age !== 0) { w.raw(new Uint8Array([0x10])); w.uint32(msg.age) }
        if (msg.address !== undefined) { w.raw(new Uint8Array([0x1a])); w.fork(); Address.encode(msg.address, w); w.join() }
        for (const t of msg.tags) { w.raw(new Uint8Array([0x22])); w.string(t) }
        return w
    }

    static decode(buf: Uint8Array): MediumMessage {
        const r = BinaryReader.create(buf)
        const msg = new MediumMessage()
        while (r.pos < r.end) {
            const tag = r.uint32()
            switch (tag >>> 3) {
                case 1: msg.name = r.string(); break
                case 2: msg.age = r.uint32(); break
                case 3: { const len = r.uint32(); const end = r.pos + len; msg.address = Address.decodeReader(r, end); break }
                case 4: msg.tags.push(r.string()); break
                default: r.skip(tag & 7)
            }
        }
        return msg
    }

    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            age: this.age,
            address: this.address ? this.address.toJSON() : undefined,
            tags: this.tags
        }
    }

    static fromJSON(obj: Record<string, unknown>): MediumMessage {
        const m = new MediumMessage()
        if (obj.name !== undefined) m.name = obj.name as string
        if (obj.age !== undefined) m.age = obj.age as number
        if (obj.address) m.address = Address.fromJSON(obj.address as Record<string, unknown>)
        if (obj.tags) m.tags = obj.tags as string[]
        return m
    }

    static verify(msg: MediumMessage): string | null {
        if (typeof msg.name !== 'string') return 'name: expected string'
        if (typeof msg.age !== 'number') return 'age: expected number'
        if (msg.address !== undefined) {
            if (typeof msg.address !== 'object') return 'address: expected object'
        }
        if (!Array.isArray(msg.tags)) return 'tags: expected array'
        return null
    }
}

// ── Large message: many fields, long strings, bytes, double ─

const f64Scratch = new Float64Array(1)
const u8f64 = new Uint8Array(f64Scratch.buffer)

export class LargeMessage extends Message<LargeMessage> {
    title = ''
    description = ''
    content = ''
    version = 0
    score = 0
    payload: Uint8Array = new Uint8Array(0)
    metadata: string[] = []

    constructor(init?: Partial<LargeMessage>) {
        super()
        if (init) Object.assign(this, init)
    }

    static readonly descriptor = DESC

    // Dynamically-sized scratch buffer for caching string byte lengths
    private static _sbl: Int32Array = new Int32Array(64)

    private static ensureSbl(n: number): Int32Array {
        if (LargeMessage._sbl.length < n) {
            LargeMessage._sbl = new Int32Array(n * 2)
        }
        return LargeMessage._sbl
    }

    toBinary(): Uint8Array {
        const metaLen = this.metadata.length
        const sbl = LargeMessage.ensureSbl(3 + metaLen)
        sbl[0] = this.title !== '' ? strLen(this.title) : 0
        sbl[1] = this.description !== '' ? strLen(this.description) : 0
        sbl[2] = this.content !== '' ? strLen(this.content) : 0
        for (let i = 0; i < metaLen; i++) sbl[3 + i] = strLen(this.metadata[i]!)

        let s = 0
        if (sbl[0]! > 0) s += 1 + varint32Size(sbl[0]!) + sbl[0]!
        if (sbl[1]! > 0) s += 1 + varint32Size(sbl[1]!) + sbl[1]!
        if (sbl[2]! > 0) s += 1 + varint32Size(sbl[2]!) + sbl[2]!
        if (this.version !== 0) s += 1 + varint32Size(this.version)
        if (this.score !== 0) s += 9
        if (this.payload.length > 0) s += 1 + varint32Size(this.payload.length) + this.payload.length
        for (let i = 0; i < metaLen; i++) { const bl = sbl[3 + i]!; s += 1 + varint32Size(bl) + bl }

        const buf = alloc(s)
        let p = 0
        if (sbl[0]! > 0) { buf[p++] = 0x0a; p = writeVarint(sbl[0]!, buf, p); strWrite(this.title, buf, p, sbl[0]!); p += sbl[0]! }
        if (sbl[1]! > 0) { buf[p++] = 0x12; p = writeVarint(sbl[1]!, buf, p); strWrite(this.description, buf, p, sbl[1]!); p += sbl[1]! }
        if (sbl[2]! > 0) { buf[p++] = 0x1a; p = writeVarint(sbl[2]!, buf, p); strWrite(this.content, buf, p, sbl[2]!); p += sbl[2]! }
        if (this.version !== 0) { buf[p++] = 0x20; p = writeVarint(this.version, buf, p) }
        if (this.score !== 0) {
            buf[p++] = 0x29; f64Scratch[0] = this.score
            buf[p++] = u8f64[0]!; buf[p++] = u8f64[1]!; buf[p++] = u8f64[2]!; buf[p++] = u8f64[3]!
            buf[p++] = u8f64[4]!; buf[p++] = u8f64[5]!; buf[p++] = u8f64[6]!; buf[p++] = u8f64[7]!
        }
        if (this.payload.length > 0) { buf[p++] = 0x32; p = writeVarint(this.payload.length, buf, p); buf.set(this.payload, p); p += this.payload.length }
        for (let i = 0; i < metaLen; i++) {
            const bl = sbl[3 + i]!; buf[p++] = 0x3a; p = writeVarint(bl, buf, p); strWrite(this.metadata[i]!, buf, p, bl); p += bl
        }
        return buf
    }

    toJSON(): Record<string, unknown> {
        return {
            title: this.title,
            description: this.description,
            content: this.content,
            version: this.version,
            score: this.score,
            payload: this.payload.length > 0 ? encodeBase64(this.payload) : '',
            metadata: this.metadata
        }
    }

    static sizeOf(msg: LargeMessage): number { return msg.toBinary().length }
    static encodeTo(msg: LargeMessage, buf: Uint8Array, p: number): number { const b = msg.toBinary(); buf.set(b, p); return p + b.length }

    static encode(msg: LargeMessage, w?: BinaryWriter): BinaryWriter {
        w ??= BinaryWriter.create()
        if (msg.title !== '') { w.raw(new Uint8Array([0x0a])); w.string(msg.title) }
        if (msg.description !== '') { w.raw(new Uint8Array([0x12])); w.string(msg.description) }
        if (msg.content !== '') { w.raw(new Uint8Array([0x1a])); w.string(msg.content) }
        if (msg.version !== 0) { w.raw(new Uint8Array([0x20])); w.uint32(msg.version) }
        if (msg.score !== 0) { w.raw(new Uint8Array([0x29])); w.double(msg.score) }
        if (msg.payload.length > 0) { w.raw(new Uint8Array([0x32])); w.bytes(msg.payload) }
        for (const m of msg.metadata) { w.raw(new Uint8Array([0x3a])); w.string(m) }
        return w
    }

    static decode(buf: Uint8Array): LargeMessage {
        const r = BinaryReader.create(buf)
        const msg = new LargeMessage()
        while (r.pos < r.end) {
            const tag = r.uint32()
            switch (tag >>> 3) {
                case 1: msg.title = r.string(); break
                case 2: msg.description = r.string(); break
                case 3: msg.content = r.string(); break
                case 4: msg.version = r.uint32(); break
                case 5: msg.score = r.double(); break
                case 6: msg.payload = r.bytes(); break
                case 7: msg.metadata.push(r.string()); break
                default: r.skip(tag & 7)
            }
        }
        return msg
    }
}
