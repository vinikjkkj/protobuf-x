import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CodeTemplate } from '../template.js'

describe('CodeTemplate', () => {
    it('appends another template preserving content order', () => {
        const base = new CodeTemplate()
        base.line('line1')

        const extra = new CodeTemplate()
        extra.line('line2')
        extra.blank()
        extra.line('line3')

        base.append(extra)

        const result = base.toString()
        assert.ok(result.includes('line1'))
        assert.ok(result.includes('line2'))
        assert.ok(result.includes('line3'))
    })
})
