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

function connectEffect(_ctx: OfflineAudioContext, fx: EffectIR): EffectChain {
  throw new Error(`Effect not yet implemented: ${fx.type}`)
}
