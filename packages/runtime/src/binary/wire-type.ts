/** Protobuf wire types as defined in the protocol buffer encoding spec. */
export const enum WireType {
    /** int32, int64, uint32, uint64, sint32, sint64, bool, enum */
    Varint = 0,
    /** fixed64, sfixed64, double */
    Bit64 = 1,
    /** string, bytes, embedded messages, packed repeated fields */
    LengthDelimited = 2,
    /** start of a deprecated group field */
    StartGroup = 3,
    /** end of a deprecated group field */
    EndGroup = 4,
    /** fixed32, sfixed32, float */
    Bit32 = 5
}

/** Create a field tag from field number and wire type. */
export function makeTag(fieldNumber: number, wireType: WireType): number {
    return (fieldNumber << 3) | wireType
}

/** Extract field number from a tag. */
export function tagFieldNumber(tag: number): number {
    return tag >>> 3
}

/** Extract wire type from a tag. */
export function tagWireType(tag: number): WireType {
    return (tag & 0x07) as WireType
}
