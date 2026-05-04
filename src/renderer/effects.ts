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

export function buildDistortion(ctx: OfflineAudioContext, params: Record<string, number>): EffectChain {
  const amount = params.amount ?? 0.5
  // drive controls how aggressively the signal is pushed into saturation
  const drive = 1 + amount * 4
  const samples = 256
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1
    // tanh saturation normalised to ±1 at the curve edges
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive)
  }
  const ws = ctx.createWaveShaper()
  ws.curve = curve

  // Compensate for the gain boost the drive applies to small signals
  const compensation = ctx.createGain()
  compensation.gain.value = 1 / drive
  ws.connect(compensation)

  return { input: ws, output: compensation }
}

export function buildReverb(ctx: OfflineAudioContext, params: Record<string, number>): EffectChain {
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

  const input = ctx.createGain()
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  const output = ctx.createGain()

  const mix = params.mix ?? 0.3
  dryGain.gain.value = 1 - mix
  wetGain.gain.value = mix

  input.connect(dryGain)
  dryGain.connect(output)
  input.connect(convolver)
  convolver.connect(wetGain)
  wetGain.connect(output)

  return { input, output }
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
  dryGain.gain.value = 1.0

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
  if (fx.type === 'distortion') return buildDistortion(ctx, fx.params)
  if (fx.type === 'reverb')     return buildReverb(ctx, fx.params)
  if (fx.type === 'delay')      return buildDelay(ctx, fx.params)
  throw new Error(`Unsupported effect: ${fx.type}`)
}
