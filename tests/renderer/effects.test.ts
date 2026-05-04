import { describe, it, expect } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'
import { buildEffectChain, buildDistortion, buildReverb, buildDelay } from '../../src/renderer/effects.js'
import type { EffectIR } from '../../src/ir/types.js'

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
    expect(() => buildEffectChain(ctx, [{ type: 'chorus', params: {} }]))
      .toThrow('Unsupported effect: chorus')
  })

  it('with two chained effects, passes signal through to destination', async () => {
    const ctx = new OfflineAudioContext(2, 44100 * 4, 44100)
    const effects: EffectIR[] = [
      { type: 'distortion', params: { amount: 0.5 } },
      { type: 'reverb',     params: { decay: 1.0 } },
    ]
    const entry = buildEffectChain(ctx, effects)
    const osc = ctx.createOscillator()
    osc.frequency.value = 440
    osc.connect(entry)
    osc.start(0)
    osc.stop(0.1)
    const buf = await ctx.startRendering()
    const samples = buf.getChannelData(0)
    const max = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(max).toBeGreaterThan(0)
  })
})

describe('buildDistortion', () => {
  it('returns an effect chain with distinct input and output nodes', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const chain = buildDistortion(ctx, { amount: 0.8 })
    expect(chain.input).toBeDefined()
    expect(chain.output).toBeDefined()
    expect(chain.input).not.toBe(chain.output)
  })

  it('returns an effect chain with default params', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const chain = buildDistortion(ctx, {})
    expect(chain.input).toBeDefined()
    expect(chain.output).toBeDefined()
  })
})

describe('buildReverb', () => {
  it('returns an effect chain with distinct input and output nodes', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const chain = buildReverb(ctx, { decay: 2.0 })
    expect(chain.input).toBeDefined()
    expect(chain.output).toBeDefined()
    expect(chain.input).not.toBe(chain.output)
  })

  it('returns a valid chain for default decay', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const chain = buildReverb(ctx, {})
    expect(chain.input).toBeDefined()
    expect(chain.output).toBeDefined()
  })
})

describe('buildDelay', () => {
  it('sets DelayNode delayTime from time param', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const { delayNode } = buildDelay(ctx, { time: 0.75, feedback: 0.5 })
    expect(delayNode.delayTime.value).toBeCloseTo(0.75)
  })

  it('uses default time 0.3 when param is omitted', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const { delayNode } = buildDelay(ctx, {})
    expect(delayNode.delayTime.value).toBeCloseTo(0.3)
  })

  it('sets feedbackGain value from feedback param', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const { feedbackGain } = buildDelay(ctx, { time: 0.3, feedback: 0.6 })
    expect(feedbackGain.gain.value).toBeCloseTo(0.6)
  })
})

describe('buildDelay render behavior', () => {
  it('produces audio after note ends due to delay feedback', async () => {
    // 2-second buffer: note plays for 0.1s, delay tail should extend into rest of buffer
    const ctx = new OfflineAudioContext(1, 44100 * 2, 44100)
    const effects: EffectIR[] = [{ type: 'delay', params: { time: 0.2, feedback: 0.6 } }]
    const entry = buildEffectChain(ctx, effects)
    const osc = ctx.createOscillator()
    osc.frequency.value = 440
    osc.connect(entry)
    osc.start(0)
    osc.stop(0.1)
    const buf = await ctx.startRendering()
    const samples = buf.getChannelData(0)
    // Check for signal in the range 0.3s–0.5s (after the note has fully ended + initial delay)
    const tail = Array.from(samples.slice(Math.floor(0.3 * 44100), Math.floor(0.5 * 44100)))
    const maxTail = tail.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(maxTail).toBeGreaterThan(0)
  })
})
