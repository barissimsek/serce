import { Instrument } from '../../ir/types.js'
import { playOscillator } from './oscillator.js'
import { playElectricGuitar } from './electric_guitar.js'

export function playInstrumentVoice(
  ctx: OfflineAudioContext,
  instrument: Instrument,
  freq: number,
  startTime: number,
  duration: number,
  destination: AudioNode
): void {
  switch (instrument) {
    case 'sine':
    case 'square':
    case 'sawtooth':
    case 'triangle':
      playOscillator(ctx, instrument, freq, startTime, duration, destination)
      break
    case 'electric_guitar':
      playElectricGuitar(ctx, freq, startTime, duration, destination)
      break
  }
}
