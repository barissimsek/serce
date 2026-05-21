export function playOscillator(
  ctx: OfflineAudioContext,
  type: OscillatorType,
  freq: number,
  startTime: number,
  duration: number,
  destination: AudioNode,
  slideToFreq?: number
): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  if (slideToFreq !== undefined) {
    osc.frequency.linearRampToValueAtTime(slideToFreq, startTime + duration)
  }

  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.3, startTime + 0.005)
  gain.gain.setValueAtTime(0.3, startTime + duration - 0.01)
  gain.gain.linearRampToValueAtTime(0, startTime + duration)

  osc.connect(gain)
  gain.connect(destination)

  osc.start(startTime)
  osc.stop(startTime + duration)
}
