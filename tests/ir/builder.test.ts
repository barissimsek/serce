import { describe, it, expect } from 'vitest'
import { buildIR } from '../../src/ir/builder.js'
import { parseFile, mergeFiles } from '../../src/parser/parser.js'

function makeAST(...sources: [string, string][]) {
  return mergeFiles(sources.map(([src, path]) => parseFile(src, path)))
}

const META = (sections = 'default') =>
  `@song x\n@author y\n@tempo 120\n@sections ${sections}\n`

describe('buildIR', () => {
  it('builds meta from directives', () => {
    const ast = makeAST(['@song hello\n@author Ada\n@tempo 120\n@time 3/4\n@sections default\n', 'meta.serce'])
    const ir = buildIR(ast)
    expect(ir.meta).toEqual({ song: 'hello', author: 'Ada', tempo: 120, time: '3/4' })
  })

  it('defaults time to 4/4', () => {
    const ast = makeAST([META(), 'meta.serce'])
    const ir = buildIR(ast)
    expect(ir.meta.time).toBe('4/4')
  })

  it('puts top-level tracks in default section', () => {
    const ast = makeAST(
      [META(), 'meta.serce'],
      ['track bass sine\n  |1| C4/q D4/q E4/q G4/q\n', 'bass.serce']
    )
    const ir = buildIR(ast)
    expect(ir.sections[0].name).toBe('default')
    expect(ir.sections[0].tracks[0].name).toBe('bass')
  })

  it('resolves section tempo override', () => {
    const ast = makeAST(
      [META('slow'), 'meta.serce'],
      ['section slow @tempo 60\n  track bass sine\n    |1| C4/w\n', 'song.serce']
    )
    const ir = buildIR(ast)
    expect(ir.sections[0].tempo).toBe(60)
  })

  it('inherits global tempo when section has no override', () => {
    const ast = makeAST(
      [META('verse'), 'meta.serce'],
      ['section verse\n  track bass sine\n    |1| C4/w\n', 'song.serce']
    )
    const ir = buildIR(ast)
    expect(ir.sections[0].tempo).toBe(120)
  })

  it('builds note events correctly', () => {
    const ast = makeAST(
      [META(), 'meta.serce'],
      ['track bass sine\n  |1| F#3/h -/h\n', 'bass.serce']
    )
    const ir = buildIR(ast)
    const bar = ir.sections[0].tracks[0].bars[0]
    expect(bar.events[0]).toEqual({ type: 'note', pitch: 'F#3', duration: 'h' })
    expect(bar.events[1]).toEqual({ type: 'rest', duration: 'h' })
  })

  it('orders sections according to @sections directive', () => {
    const ast = makeAST(
      [META('verse intro'), 'meta.serce'],
      ['section intro\n  track bass sine\n    |1| C4/w\nsection verse\n  track bass sine\n    |1| G4/w\n', 'song.serce']
    )
    const ir = buildIR(ast)
    expect(ir.sections.map(s => s.name)).toEqual(['verse', 'intro'])
  })

  it('silently skips section names not found in parsed files', () => {
    const ast = makeAST(
      [META('intro missing verse'), 'meta.serce'],
      ['section intro\n  track bass sine\n    |1| C4/w\nsection verse\n  track bass sine\n    |1| G4/w\n', 'song.serce']
    )
    const ir = buildIR(ast)
    expect(ir.sections.map(s => s.name)).toEqual(['intro', 'verse'])
  })

  it('excludes sections not listed in @sections', () => {
    const ast = makeAST(
      [META('intro'), 'meta.serce'],
      ['section intro\n  track bass sine\n    |1| C4/w\nsection outro\n  track bass sine\n    |1| G4/w\n', 'song.serce']
    )
    const ir = buildIR(ast)
    expect(ir.sections.map(s => s.name)).toEqual(['intro'])
  })
})
