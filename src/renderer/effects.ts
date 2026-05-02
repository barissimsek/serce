import { OfflineAudioContext } from 'node-web-audio-api'
import { EffectIR } from '../ir/types.js'

const SAMPLE_RATE = 44100

interface EffectChain {
  input: AudioNode
  output: AudioNode
}

export function buildEffectChain(ctx: OfflineAudioContext, effects: EffectIR[]): GainNode {
  const trackInputGain = ctx.createGain()

  let current: AudioNode = trackInputGain
  for (const fx of effects) {
    const chain = connectEffect(ctx, fx)
    current.connect(chain.input)
    current = chain.output
  }
  current.connect(ctx.destination)

  // Connect your audio source to the returned GainNode; it is the chain entry point
  return trackInputGain
}

export function buildDistortion(ctx: OfflineAudioContext, params: Record<string, number>): WaveShaperNode {
  const amount = params.amount ?? 0.5
  const samples = 256
  const curve = new Float32Array(samples)
  const k = amount * 100
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x))
  }
  const ws = ctx.createWaveShaper()
  ws.curve = curve
  return ws
}

export function buildReverb(ctx: OfflineAudioContext, params: Record<string, number>): ConvolverNode {
  const decay = params.decay ?? 1.5
  const length = Math.ceil(decay * SAMPLE_RATE)
  const ir = ctx.createBuffer(2, length, SAMPLE_RATE)
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t / decay)
    }
  }
  const convolver = ctx.createConvolver()
  convolver.buffer = ir
  return convolver
}

export interface DelayChain {
  input: GainNode
  output: GainNode
  delayNode: DelayNode
  feedbackGain: GainNode
}

export function buildDelay(ctx: OfflineAudioContext, params: Record<string, number>): DelayChain {
  const time = params.time ?? 0.3
  const feedback = params.feedback ?? 0.4

  const input = ctx.createGain()
  const delayNode = ctx.createDelay(2.0)
  const feedbackGain = ctx.createGain()
  const dryGain = ctx.createGain()
  const output = ctx.createGain()

  delayNode.delayTime.value = time
  feedbackGain.gain.value = feedback
  dryGain.gain.value = 0.5

  const wetGain = ctx.createGain()
  wetGain.gain.value = 0.5

  // Dry path: input → dryGain → output
  input.connect(dryGain)
  dryGain.connect(output)

  // Wet path: input → delayNode → wetGain → output
  input.connect(delayNode)
  delayNode.connect(wetGain)
  wetGain.connect(output)

  // Feedback loop: delayNode → feedbackGain → delayNode
  delayNode.connect(feedbackGain)
  feedbackGain.connect(delayNode)

  return { input, output, delayNode, feedbackGain }
}

function connectEffect(ctx: OfflineAudioContext, fx: EffectIR): EffectChain {
  if (fx.type === 'distortion') {
    const node = buildDistortion(ctx, fx.params)
    return { input: node, output: node }
  }
  if (fx.type === 'reverb') {
    const node = buildReverb(ctx, fx.params)
    return { input: node, output: node }
  }
  if (fx.type === 'delay') {
    const { input, output } = buildDelay(ctx, fx.params)
    return { input, output }
  }
  throw new Error(`Unsupported effect: ${fx.type}`)
}
