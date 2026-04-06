/**
 * Service stub generation: produces TypeScript interfaces and method signatures.
 */

import { CodeTemplate } from './template.js'

/** Represents a parsed proto RPC method. */
export interface ProtoMethod {
    name: string
    inputType: string
    outputType: string
    inputTypeExpr?: string
    outputTypeExpr?: string
    inputResolvedType?: string
    outputResolvedType?: string
    clientStreaming: boolean
    serverStreaming: boolean
}

/** Represents a parsed proto service. */
export interface ProtoService {
    name: string
    fullName?: string
    methods: ProtoMethod[]
}

/**
 * Get the TypeScript return type for an RPC method.
 */
function getMethodSignature(method: ProtoMethod): string {
    const inputTypeName = method.inputTypeExpr ?? method.inputType
    const outputTypeName = method.outputTypeExpr ?? method.outputType
    const inputType = method.clientStreaming ? `AsyncIterable<${inputTypeName}>` : inputTypeName

    const outputType = method.serverStreaming
        ? `AsyncIterable<${outputTypeName}>`
        : `Promise<${outputTypeName}>`

    return `${methodName(method.name)}(request: ${inputType}): ${outputType}`
}

/**
 * Generate a service interface with all RPC method signatures.
 *
 * Example output:
 *   export interface GreeterService {
 *     sayHello(request: HelloRequest): Promise<HelloResponse>;
 *     serverStream(request: StreamRequest): AsyncIterable<StreamResponse>;
 *     clientStream(request: AsyncIterable<StreamRequest>): Promise<StreamResponse>;
 *     bidiStream(request: AsyncIterable<StreamRequest>): AsyncIterable<StreamResponse>;
 *   }
 */
export function generateService(service: ProtoService): string {
    const t = new CodeTemplate()

    t.block(`export interface ${service.name} {`, () => {
        for (const method of service.methods) {
            t.line(`${getMethodSignature(method)};`)
        }
    })

    return t.toString()
}

/**
 * Generate a service descriptor constant.
 *
 * Example output:
 *   export const GreeterServiceDescriptor: ServiceDescriptor = {
 *     name: 'Greeter',
 *     methods: [
 *       { name: 'SayHello', inputType: 'HelloRequest', outputType: 'HelloResponse', clientStreaming: false, serverStreaming: false },
 *     ],
 *   };
 */
export function generateServiceDescriptor(service: ProtoService): string {
    const t = new CodeTemplate()
    const descriptorName = service.fullName ?? service.name

    t.block(`export const ${service.name}Descriptor: ServiceDescriptor = {`, () => {
        t.line(`name: '${descriptorName}',`)
        t.block('methods: [', () => {
            for (const method of service.methods) {
                t.line(
                    `{ name: '${method.name}', inputType: '${method.inputResolvedType ?? method.inputType}', outputType: '${method.outputResolvedType ?? method.outputType}', clientStreaming: ${method.clientStreaming}, serverStreaming: ${method.serverStreaming} },`
                )
            }
        })
    })

    // Fix closing to use ] instead of }
    const str = t.toString()
    return str.replace(/\n(\s*)}\n(\s*)}$/, '\n$1],\n$2};')
}

/**
 * Generate a concrete client class for a service that extends ServiceClient.
 *
 * Example output:
 *   export class GreeterClient extends ServiceClient implements Greeter {
 *     constructor(transport: Transport) {
 *       super(transport, 'Greeter');
 *     }
 *     async sayHello(request: HelloRequest): Promise<HelloResponse> {
 *       return this.unaryCall('SayHello', request, HelloResponse);
 *     }
 *   }
 */
export function generateServiceClient(service: ProtoService): string {
    const t = new CodeTemplate()
    const descriptorName = service.fullName ?? service.name

    t.block(
        `export class ${service.name}Client extends ServiceClient implements ${service.name} {`,
        () => {
            t.block('constructor(transport: Transport) {', () => {
                t.line(`super(transport, '${descriptorName}')`)
            })
            t.blank()
            for (const method of service.methods) {
                const inputTypeName = method.inputTypeExpr ?? method.inputType
                const outputTypeName = method.outputTypeExpr ?? method.outputType
                const camelName = methodName(method.name)

                if (!method.clientStreaming && !method.serverStreaming) {
                    // Unary
                    t.block(
                        `async ${camelName}(request: ${inputTypeName}): Promise<${outputTypeName}> {`,
                        () => {
                            t.line(
                                `return this.unaryCall('${method.name}', request, ${outputTypeName})`
                            )
                        }
                    )
                } else if (!method.clientStreaming && method.serverStreaming) {
                    // Server streaming
                    t.block(
                        `${camelName}(request: ${inputTypeName}): AsyncIterable<${outputTypeName}> {`,
                        () => {
                            t.line(
                                `return this.serverStreamCall('${method.name}', request, ${outputTypeName})`
                            )
                        }
                    )
                } else if (method.clientStreaming && !method.serverStreaming) {
                    // Client streaming
                    t.block(
                        `async ${camelName}(request: AsyncIterable<${inputTypeName}>): Promise<${outputTypeName}> {`,
                        () => {
                            t.line(
                                `return this.clientStreamCall('${method.name}', request, ${outputTypeName})`
                            )
                        }
                    )
                } else {
                    // Bidi streaming
                    t.block(
                        `${camelName}(request: AsyncIterable<${inputTypeName}>): AsyncIterable<${outputTypeName}> {`,
                        () => {
                            t.line(
                                `return this.bidiStreamCall('${method.name}', request, ${outputTypeName})`
                            )
                        }
                    )
                }
            }
        }
    )

    return t.toString()
}

/** Convert PascalCase method name to camelCase for TypeScript. */
function methodName(name: string): string {
    if (name.length === 0) return name
    return name.charAt(0).toLowerCase() + name.slice(1)
}
