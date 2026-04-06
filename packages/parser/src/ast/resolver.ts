import type {
    ProtoFileNode,
    MessageNode,
    FieldNode,
    EnumNode,
    MapFieldNode,
    MethodNode,
    OneofNode,
    ExtendNode,
    ServiceNode
} from './nodes.js'

/** A reference that could not be resolved. */
export interface UnresolvedReference {
    readonly typeName: string
    readonly context: string
    readonly line: number
    readonly column: number
}

/** Result of type resolution. */
export interface ResolveResult {
    /** Map from original type name to fully qualified name. */
    readonly resolved: ReadonlyMap<string, string>
    /** References that could not be resolved. */
    readonly unresolved: readonly UnresolvedReference[]
}

/**
 * Resolves type references in a ProtoFileNode AST.
 *
 * This walks through every field, map field, method input/output, and extend
 * type name, resolving relative references to fully qualified names based on
 * the package and nested message scopes.
 */
export class TypeResolver {
    private readonly typeMap = new Map<string, string>()
    private readonly resolved = new Map<string, string>()
    private readonly unresolved: UnresolvedReference[] = []

    /** Resolve all type references in the given file node. */
    resolve(file: ProtoFileNode): ResolveResult {
        this.typeMap.clear()
        this.resolved.clear()
        this.unresolved.length = 0

        const pkg = file.package

        // Phase 1: Build a map of all defined types
        this.collectTypes(file.messages, pkg)
        this.collectEnumTypes(file.enums, pkg)

        // Phase 2: Resolve all references
        this.resolveMessages(file.messages, pkg)
        this.resolveServices(file.services, pkg)
        this.resolveExtends(file.extends, pkg)

        return {
            resolved: new Map(this.resolved),
            unresolved: [...this.unresolved]
        }
    }

    // ── Phase 1: Collect type definitions ──────────────────────

    private collectTypes(messages: readonly MessageNode[], scope: string): void {
        for (const msg of messages) {
            const fqn = scope ? `${scope}.${msg.name}` : msg.name
            this.typeMap.set(fqn, fqn)

            // Collect nested types
            this.collectTypes(msg.nestedMessages, fqn)
            this.collectEnumTypes(msg.nestedEnums, fqn)
        }
    }

    private collectEnumTypes(enums: readonly EnumNode[], scope: string): void {
        for (const e of enums) {
            const fqn = scope ? `${scope}.${e.name}` : e.name
            this.typeMap.set(fqn, fqn)
        }
    }

    // ── Phase 2: Resolve references ────────────────────────────

    private resolveMessages(messages: readonly MessageNode[], scope: string): void {
        for (const msg of messages) {
            const msgScope = scope ? `${scope}.${msg.name}` : msg.name

            for (const field of msg.fields) {
                this.resolveFieldType(field, msgScope)
            }

            for (const oneof of msg.oneofs) {
                this.resolveOneofFields(oneof, msgScope)
            }

            for (const mapField of msg.mapFields) {
                this.resolveMapFieldType(mapField, msgScope)
            }

            for (const ext of msg.extends) {
                this.resolveExtendType(ext, msgScope)
            }

            // Recurse into nested messages
            this.resolveMessages(msg.nestedMessages, msgScope)
        }
    }

    private resolveOneofFields(oneof: OneofNode, scope: string): void {
        for (const field of oneof.fields) {
            this.resolveFieldType(field, scope)
        }
    }

    private resolveFieldType(field: FieldNode, scope: string): void {
        if (isScalarType(field.type)) return
        const fqn = this.resolveTypeName(field.type, scope)
        if (fqn !== undefined) {
            this.resolved.set(field.type, fqn)
        } else {
            this.unresolved.push({
                typeName: field.type,
                context: `field '${field.name}' in '${scope}'`,
                line: field.line,
                column: field.column
            })
        }
    }

    private resolveMapFieldType(mapField: MapFieldNode, scope: string): void {
        // Key types are always scalars in proto. Value type may be a message/enum.
        if (!isScalarType(mapField.valueType)) {
            const fqn = this.resolveTypeName(mapField.valueType, scope)
            if (fqn !== undefined) {
                this.resolved.set(mapField.valueType, fqn)
            } else {
                this.unresolved.push({
                    typeName: mapField.valueType,
                    context: `map field '${mapField.name}' value in '${scope}'`,
                    line: mapField.line,
                    column: mapField.column
                })
            }
        }
    }

    private resolveServices(services: readonly ServiceNode[], scope: string): void {
        for (const svc of services) {
            for (const method of svc.methods) {
                this.resolveMethodTypes(method, scope)
            }
        }
    }

    private resolveMethodTypes(method: MethodNode, scope: string): void {
        for (const typeName of [method.inputType, method.outputType]) {
            if (!isScalarType(typeName)) {
                const fqn = this.resolveTypeName(typeName, scope)
                if (fqn !== undefined) {
                    this.resolved.set(typeName, fqn)
                } else {
                    this.unresolved.push({
                        typeName,
                        context: `method '${method.name}'`,
                        line: method.line,
                        column: method.column
                    })
                }
            }
        }
    }

    private resolveExtends(extends_: readonly ExtendNode[], scope: string): void {
        for (const ext of extends_) {
            this.resolveExtendType(ext, scope)
            for (const field of ext.fields) {
                this.resolveFieldType(field, scope)
            }
        }
    }

    private resolveExtendType(ext: ExtendNode, scope: string): void {
        if (!isScalarType(ext.typeName)) {
            const fqn = this.resolveTypeName(ext.typeName, scope)
            if (fqn !== undefined) {
                this.resolved.set(ext.typeName, fqn)
            } else {
                this.unresolved.push({
                    typeName: ext.typeName,
                    context: `extend '${ext.typeName}'`,
                    line: ext.line,
                    column: ext.column
                })
            }
        }
    }

    /**
     * Resolve a type name to a fully qualified name.
     *
     * Resolution order:
     * 1. If the name starts with '.', it's already fully qualified (strip the leading dot).
     * 2. Search from the current scope outward (inner to outer).
     * 3. Search from package root.
     * 4. Search without any prefix (bare name).
     */
    private resolveTypeName(name: string, scope: string): string | undefined {
        // Fully qualified (leading dot)
        if (name.startsWith('.')) {
            const fqn = name.slice(1)
            if (this.typeMap.has(fqn)) return fqn
            return undefined
        }

        // Try scoped resolution from innermost to outermost
        let currentScope = scope
        while (currentScope) {
            const candidate = `${currentScope}.${name}`
            if (this.typeMap.has(candidate)) return candidate

            const dotIdx = currentScope.lastIndexOf('.')
            currentScope = dotIdx >= 0 ? currentScope.slice(0, dotIdx) : ''
        }

        // Try bare name
        if (this.typeMap.has(name)) return name

        return undefined
    }
}

/** Set of proto scalar type names. */
const SCALAR_TYPES = new Set([
    'double',
    'float',
    'int32',
    'int64',
    'uint32',
    'uint64',
    'sint32',
    'sint64',
    'fixed32',
    'fixed64',
    'sfixed32',
    'sfixed64',
    'bool',
    'string',
    'bytes'
])

function isScalarType(name: string): boolean {
    return SCALAR_TYPES.has(name)
}
