import { OfflineAudioContext } from 'node-web-audio-api'
import { EffectIR } from '../ir/types.js'

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

function connectEffect(ctx: OfflineAudioContext, fx: EffectIR): EffectChain {
  if (fx.type === 'distortion') {
    const node = buildDistortion(ctx, fx.params)
    return { input: node, output: node }
  }
  throw new Error(`Effect not yet implemented: ${fx.type}`)
}
