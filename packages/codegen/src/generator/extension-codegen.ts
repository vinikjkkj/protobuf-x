import type { ProtoField } from './field-codegen.js'
import { fieldDescriptorConstName, generateFieldDescriptor } from './field-codegen.js'
import { CodeTemplate } from './template.js'

export interface ProtoRange {
    from: number
    to: number
}

export interface ProtoExtensionGroup {
    name: string
    extendee: string
    extendeeExpr: string
    fields: ProtoField[]
}

function extensionConstName(groupName: string, fieldName: string): string {
    return `_ext_${`${groupName}_${fieldName}`.replace(/[^a-zA-Z0-9_$]/g, '_')}`
}

export function generateExtensionGroup(group: ProtoExtensionGroup): string {
    const t = new CodeTemplate()
    const scope = `ext_${group.name}`

    for (const field of group.fields) {
        t.raw(generateFieldDescriptor(field, scope))
    }
    if (group.fields.length > 0) {
        t.blank()
    }

    for (const field of group.fields) {
        t.line(
            `const ${extensionConstName(group.name, field.name)} = { extendee: '${group.extendee}', field: ${fieldDescriptorConstName(field, scope)} };`
        )
    }
    if (group.fields.length > 0) {
        t.blank()
    }

    t.block(`export const ${group.name}: Record<string, ExtensionDescriptor> = {`, () => {
        for (const field of group.fields) {
            t.line(`${field.name}: ${extensionConstName(group.name, field.name)},`)
        }
    })

    return t.toString()
}

export function generateExtensionPatch(group: ProtoExtensionGroup): string {
    return `Object.assign(${group.extendeeExpr}.descriptor, { extensions: [...((${group.extendeeExpr}.descriptor as Record<string, ExtensionDescriptor[]>).extensions ?? []), ...Object.values(${group.name})] });`
}
