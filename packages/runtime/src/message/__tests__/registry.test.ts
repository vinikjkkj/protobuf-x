import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { TypeRegistry } from '../registry.js'

describe('TypeRegistry', () => {
    it('registers and looks up types', () => {
        const reg = new TypeRegistry()
        const fakeType = { descriptor: { name: 'test.Msg' } } as never
        reg.register('test.Msg', fakeType)
        assert.equal(reg.lookup('test.Msg'), fakeType)
        assert.equal(reg.has('test.Msg'), true)
        assert.equal(reg.has('nonexistent'), false)
    })

    it('returns undefined for unknown types', () => {
        const reg = new TypeRegistry()
        assert.equal(reg.lookup('unknown'), undefined)
    })

    it('lists registered names', () => {
        const reg = new TypeRegistry()
        reg.register('a.A', {} as never)
        reg.register('b.B', {} as never)
        const names = [...reg.names()]
        assert.deepEqual(names.sort(), ['a.A', 'b.B'])
    })
})
