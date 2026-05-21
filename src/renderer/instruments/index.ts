import { Instrument } from '../../ir/types.js'
import { playOscillator } from './oscillator.js'
import { playElectricGuitar } from './electric_guitar.js'
import { playClassicalGuitar } from './classical_guitar.js'
import { playPiano } from './piano.js'

export function playInstrumentVoice(
  ctx: OfflineAudioContext,
  instrument: Instrument,
  params: Record<string, number>,
  freq: number,
  startTime: number,
  duration: number,
  destination: AudioNode,
  slideToFreq?: number
): void {
  const transpose = params.transpose ?? 0
  const transposedFreq = transpose === 0 ? freq : freq * Math.pow(2, transpose / 12)
  const transposedSlide = slideToFreq !== undefined
    ? (transpose === 0 ? slideToFreq : slideToFreq * Math.pow(2, transpose / 12))
    : undefined

  switch (instrument) {
    case 'sine':
    case 'square':
    case 'sawtooth':
    case 'triangle':
      playOscillator(ctx, instrument, transposedFreq, startTime, duration, destination, transposedSlide)
      break
    case 'electric_guitar':
      playElectricGuitar(ctx, transposedSlide ?? transposedFreq, startTime, duration, destination)
      break
    case 'classical_guitar':
      playClassicalGuitar(ctx, transposedSlide ?? transposedFreq, startTime, duration, destination)
      break
    case 'piano':
      playPiano(ctx, transposedSlide ?? transposedFreq, startTime, duration, destination)
      break
  }
}
