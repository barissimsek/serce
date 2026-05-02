import { describe, it, expect } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'
import { buildEffectChain, buildDistortion, buildReverb } from '../../src/renderer/effects.js'

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
    expect(() => buildEffectChain(ctx, [{ type: 'delay', params: {} }]))
      .toThrow('Effect not yet implemented: delay')
  })
})

describe('buildDistortion', () => {
  it('sets WaveShaperNode curve of length 256', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const node = buildDistortion(ctx, { amount: 0.8 })
    expect(node.curve).not.toBeNull()
    expect(node.curve!.length).toBe(256)
  })

  it('uses default amount 0.5 when param is omitted', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const node = buildDistortion(ctx, {})
    expect(node.curve).not.toBeNull()
    expect(node.curve!.length).toBe(256)
  })
})

describe('buildReverb', () => {
  it('sets ConvolverNode buffer length from decay param', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const node = buildReverb(ctx, { decay: 2.0 })
    expect(node.buffer).not.toBeNull()
    expect(node.buffer!.length).toBe(Math.ceil(2.0 * 44100))
  })

  it('uses default decay 1.5 when param is omitted', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const node = buildReverb(ctx, {})
    expect(node.buffer!.length).toBe(Math.ceil(1.5 * 44100))
  })
})
