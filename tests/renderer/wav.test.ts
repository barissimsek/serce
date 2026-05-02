import { describe, it, expect } from 'vitest'
import { audioBufferToWav } from '../../src/renderer/wav.js'
import { render } from '../../src/renderer/renderer.js'
import { buildIR } from '../../src/ir/builder.js'
import { parseFile, mergeFiles } from '../../src/parser/parser.js'

async function renderSimple() {
  const ir = buildIR(mergeFiles([
    parseFile('@song x\n@author y\n@tempo 120\n@sections default\n', 'meta.serce'),
    parseFile('track bass sine\n  |1| C4/w\n', 'bass.serce'),
  ]))
  return render(ir)
}

describe('audioBufferToWav', () => {
  it('starts with RIFF header', async () => {
    const buf = await renderSimple()
    const wav = audioBufferToWav(buf)
    expect(wav.subarray(0, 4).toString()).toBe('RIFF')
  })

  it('contains WAVE marker at offset 8', async () => {
    const buf = await renderSimple()
    const wav = audioBufferToWav(buf)
    expect(wav.subarray(8, 12).toString()).toBe('WAVE')
  })

  it('has correct sample rate in header (44100)', async () => {
    const buf = await renderSimple()
    const wav = audioBufferToWav(buf)
    expect(wav.readUInt32LE(24)).toBe(44100)
  })

  it('total size matches buffer length', async () => {
    const buf = await renderSimple()
    const wav = audioBufferToWav(buf)
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8)
  })

  it('data section contains non-zero samples', async () => {
    const buf = await renderSimple()
    const wav = audioBufferToWav(buf)
    // samples start at offset 44
    const hasNonZero = Array.from(wav.subarray(44, 144)).some(b => b !== 0)
    expect(hasNonZero).toBe(true)
  })
})
