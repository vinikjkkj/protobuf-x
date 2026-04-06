/**
 * Code string builder utility with indentation management.
 */

export class CodeTemplate {
    private lines: string[] = []
    private indentLevel = 0
    private indentStr = '  '

    /** Get the current indent prefix string. */
    private get prefix(): string {
        return this.indentStr.repeat(this.indentLevel)
    }

    /** Increase indent level. */
    indent(): this {
        this.indentLevel++
        return this
    }

    /** Decrease indent level. */
    dedent(): this {
        if (this.indentLevel > 0) {
            this.indentLevel--
        }
        return this
    }

    /** Add a line with current indentation. */
    line(str: string): this {
        this.lines.push(this.prefix + str)
        return this
    }

    /** Add a raw line with no indentation applied. */
    raw(str: string): this {
        this.lines.push(str)
        return this
    }

    /** Add a blank line. */
    blank(): this {
        this.lines.push('')
        return this
    }

    /**
     * Write a block with a header, body, and closing brace.
     * E.g., block('class Foo {', fn) produces:
     *   class Foo {
     *     ... (fn output, indented)
     *   }
     */
    block(header: string, fn: () => void): this {
        this.line(header)
        this.indent()
        fn()
        this.dedent()
        this.line('}')
        return this
    }

    /** Append lines from another CodeTemplate at the current indent level. */
    append(other: CodeTemplate): this {
        const otherStr = other.toString()
        for (const l of otherStr.split('\n')) {
            if (l === '') {
                this.blank()
            } else {
                this.line(l)
            }
        }
        return this
    }

    /** Return the assembled code string. */
    toString(): string {
        return this.lines.join('\n')
    }
}
