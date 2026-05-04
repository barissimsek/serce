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

  it('transpose shifts pitch: A4 with transpose:12 sounds different from transpose:0', async () => {
    const render0 = await render(irFrom(
      ['@song x\n@author y\n@tempo 60\n@sections default\n', 'meta.serce'],
      ['track t sine\n  |1| A4/w\n', 'track.serce']
    ))
    const render12 = await render(irFrom(
      ['@song x\n@author y\n@tempo 60\n@sections default\n', 'meta.serce'],
      ['track t sine transpose:12\n  |1| A4/w\n', 'track.serce']
    ))
    // A sine wave at 880Hz (transpose:12) completes twice as many cycles as 440Hz —
    // the mid-point sample will have opposite sign between the two renders
    const mid = Math.floor(render0.length / 2)
    const slice0  = Array.from(render0.getChannelData(0).subarray(mid, mid + 100))
    const slice12 = Array.from(render12.getChannelData(0).subarray(mid, mid + 100))
    expect(slice0).not.toEqual(slice12)
  })

  it('transpose:-12 shifts pitch down one octave', async () => {
    const renderBase = await render(irFrom(
      ['@song x\n@author y\n@tempo 60\n@sections default\n', 'meta.serce'],
      ['track t sine\n  |1| A5/w\n', 'track.serce']
    ))
    const renderDown = await render(irFrom(
      ['@song x\n@author y\n@tempo 60\n@sections default\n', 'meta.serce'],
      ['track t sine transpose:-12\n  |1| A5/w\n', 'track.serce']
    ))
    const mid = Math.floor(renderBase.length / 2)
    const sliceBase = Array.from(renderBase.getChannelData(0).subarray(mid, mid + 100))
    const sliceDown = Array.from(renderDown.getChannelData(0).subarray(mid, mid + 100))
    expect(sliceBase).not.toEqual(sliceDown)
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
