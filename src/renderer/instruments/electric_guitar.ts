export function playElectricGuitar(
  ctx: OfflineAudioContext,
  freq: number,
  startTime: number,
  duration: number,
  destination: AudioNode
): void {
  const sampleRate = ctx.sampleRate
  // Delay line length = one period of the target frequency
  const N = Math.round(sampleRate / freq)
  const totalSamples = Math.ceil(sampleRate * duration)

  // Run Karplus-Strong in JS: more reliable than Web Audio feedback loops
  // Seed the delay line with white noise, then apply an averaging (low-pass) filter
  // on each cycle. The lossy coefficient (< 0.5) controls decay speed.
  const delayLine = new Float32Array(N)
  for (let i = 0; i < N; i++) delayLine[i] = Math.random() * 2 - 1

  const buffer = ctx.createBuffer(1, totalSamples, sampleRate)
  const channelData = buffer.getChannelData(0)
  let ptr = 0
  for (let i = 0; i < totalSamples; i++) {
    channelData[i] = delayLine[ptr]
    delayLine[ptr] = (delayLine[ptr] + delayLine[(ptr + 1) % N]) * 0.498
    ptr = (ptr + 1) % N
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01)
  gain.gain.setValueAtTime(0.3, startTime + Math.max(0, duration - 0.04))
  gain.gain.linearRampToValueAtTime(0, startTime + duration)

  source.connect(gain)
  gain.connect(destination)

  source.start(startTime)
  source.stop(startTime + duration)
}
