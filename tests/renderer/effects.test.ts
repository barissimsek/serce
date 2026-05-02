import { describe, it, expect } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'
import { buildEffectChain } from '../../src/renderer/effects.js'

describe('buildEffectChain', () => {
  it('with empty effects array, passes signal through to destination', async () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100)
    const entry = buildEffectChain(ctx, [])
    const osc = ctx.createOscillator()
    osc.frequency.value = 440
    osc.connect(entry)
    osc.start(0)
    osc.stop(0.5)
    const buf = await ctx.startRendering()
    const samples = buf.getChannelData(0)
    const max = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(max).toBeGreaterThan(0.9)
  })

  it('throws for unimplemented effect types', () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100)
    expect(() => buildEffectChain(ctx, [{ type: 'reverb', params: {} }]))
      .toThrow('Effect not yet implemented: reverb')
  })
})
