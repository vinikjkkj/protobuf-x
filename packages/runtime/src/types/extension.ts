import type { BinaryReader } from '../binary/reader.js'
import type { BinaryWriter } from '../binary/writer.js'

/** Describes an extension field that can be get/set on an extendable message. */
export interface ExtensionFieldInfo<V> {
    /** The field number of the extension. */
    readonly fieldNumber: number
    /** The field name of the extension. */
    readonly fieldName: string
    /** The fully qualified name of the message being extended. */
    readonly extendee: string
    /** Encode the extension value into the writer. */
    encode(value: V, writer: BinaryWriter): void
    /** Decode the extension value from the reader. */
    decode(reader: BinaryReader): V
    /** The default value for this extension field. */
    defaultValue: V
}
