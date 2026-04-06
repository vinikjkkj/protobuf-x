/**
 * Enum code generation: produces const enum declarations.
 */

import type { ProtoRange } from './extension-codegen.js'
import { CodeTemplate } from './template.js'

/** Represents a parsed proto enum for code generation. */
export interface ProtoEnum {
    name: string
    generatedName?: string
    fullName?: string
    reservedRanges?: ProtoRange[]
    reservedNames?: string[]
    values: Array<{ name: string; number: number }>
}

/**
 * Generate a const enum declaration for a proto enum.
 *
 * Example output:
 *   export const enum Status {
 *     UNKNOWN = 0,
 *     ACTIVE = 1,
 *     INACTIVE = 2,
 *   }
 */
export function generateEnum(protoEnum: ProtoEnum): string {
    const t = new CodeTemplate()
    const enumName = protoEnum.generatedName ?? protoEnum.name
    t.block(`export const enum ${enumName} {`, () => {
        for (const val of protoEnum.values) {
            t.line(`${val.name} = ${val.number},`)
        }
    })
    return t.toString()
}

export function generateEnumDescriptor(protoEnum: ProtoEnum): string {
    const enumName = protoEnum.generatedName ?? protoEnum.name
    const descriptorName = protoEnum.fullName ?? protoEnum.name
    const values = protoEnum.values.map((value) => `['${value.name}', ${value.number}]`).join(', ')
    const valuesByNumber = protoEnum.values
        .map((value) => `[${value.number}, '${value.name}']`)
        .join(', ')
    const reservedRanges = formatRangeArray(protoEnum.reservedRanges)
    const reservedNames = protoEnum.reservedNames?.map((name) => `'${name}'`).join(', ') ?? ''

    return [
        `export const ${enumName}Descriptor: EnumDescriptor = {`,
        `    name: '${descriptorName}',`,
        `    values: new Map([${values}]),`,
        `    valuesByNumber: new Map([${valuesByNumber}]),`,
        `    reservedRanges: [${reservedRanges}],`,
        `    reservedNames: [${reservedNames}],`,
        '};'
    ].join('\n')
}

function formatRangeArray(ranges?: readonly ProtoRange[]): string {
    if (!ranges || ranges.length === 0) {
        return ''
    }
    return ranges.map((range) => `{ from: ${range.from}, to: ${range.to} }`).join(', ')
}

/**
 * Generate a runtime name-to-number mapping object for an enum.
 * Useful for JSON serialization and reflection.
 *
 * Example output:
 *   export const StatusName: Record<string, number> = {
 *     'UNKNOWN': 0,
 *     'ACTIVE': 1,
 *   } as const;
 */
export function generateEnumNameMap(protoEnum: ProtoEnum): string {
    const t = new CodeTemplate()
    const enumName = protoEnum.generatedName ?? protoEnum.name
    t.block(`export const ${enumName}Name: Record<string, number> = {`, () => {
        for (const val of protoEnum.values) {
            t.line(`'${val.name}': ${val.number},`)
        }
    })
    // Replace closing brace with " as const;"
    const str = t.toString()
    return str.slice(0, str.length - 1) + ' as const;'
}

/**
 * Generate a number-to-name reverse mapping for an enum.
 *
 * Example output:
 *   export const StatusNumber: Record<number, string> = {
 *     0: 'UNKNOWN',
 *     1: 'ACTIVE',
 *   } as const;
 */
export function generateEnumNumberMap(protoEnum: ProtoEnum): string {
    const t = new CodeTemplate()
    const enumName = protoEnum.generatedName ?? protoEnum.name
    t.block(`export const ${enumName}Number: Record<number, string> = {`, () => {
        for (const val of protoEnum.values) {
            t.line(`${val.number}: '${val.name}',`)
        }
    })
    const str = t.toString()
    return str.slice(0, str.length - 1) + ' as const;'
}
