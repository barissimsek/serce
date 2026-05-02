import { describe, it, expect } from 'vitest'
import { render } from '../../src/renderer/renderer.js'
import { buildIR } from '../../src/ir/builder.js'
import { parseFile, mergeFiles } from '../../src/parser/parser.js'

function irFrom(...sources: [string, string][]) {
  return buildIR(mergeFiles(sources.map(([src, path]) => parseFile(src, path))))
}

describe('render', () => {
  it('returns an AudioBuffer', async () => {
    const ir = irFrom(
      ['@song x\n@author y\n@tempo 120\n@sections default\n', 'meta.serce'],
      ['track bass sine\n  |1| C4/q D4/q E4/q G4/q\n', 'bass.serce']
    )
    const buf = await render(ir)
    expect(buf.numberOfChannels).toBe(2)
    expect(buf.sampleRate).toBe(44100)
    expect(buf.length).toBeGreaterThan(0)
  })

  it('produces non-silent output for a note', async () => {
    const ir = irFrom(
      ['@song x\n@author y\n@tempo 120\n@sections default\n', 'meta.serce'],
      ['track bass sine\n  |1| A4/w\n', 'bass.serce']
    )
    const buf = await render(ir)
    const data = buf.getChannelData(0)
    const max = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(max).toBeGreaterThan(0)
  })

  it('produces silence for a rest', async () => {
    const ir = irFrom(
      ['@song x\n@author y\n@tempo 120\n@sections default\n', 'meta.serce'],
      ['track bass sine\n  |1| -/w\n', 'bass.serce']
    )
    const buf = await render(ir)
    const data = buf.getChannelData(0)
    const max = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(max).toBe(0)
  })

  it('duration matches tempo: 1 bar of 4/4 at 120bpm = 2 seconds', async () => {
    const ir = irFrom(
      ['@song x\n@author y\n@tempo 120\n@sections default\n', 'meta.serce'],
      ['track bass sine\n  |1| C4/w\n', 'bass.serce']
    )
    const buf = await render(ir)
    expect(buf.duration).toBeCloseTo(2.0, 1)
  })
})
