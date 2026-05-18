export function playClassicalGuitar(
  ctx: OfflineAudioContext,
  freq: number,
  startTime: number,
  duration: number,
  destination: AudioNode
): void {
  const sampleRate = ctx.sampleRate
  const N = Math.round(sampleRate / freq)
  const totalSamples = Math.ceil(sampleRate * duration)

  // Nylon string: half-cosine shaped excitation for a soft finger-pluck onset
  const delayLine = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const shape = 0.5 * (1 - Math.cos(Math.PI * i / N))  // half-cosine window
    delayLine[i] = (Math.random() * 2 - 1) * shape
  }

  // Asymmetric weighted average: coefficients sum to ~0.997 so the signal sustains
  // but decays naturally. The 0.6/0.4 split (vs 0.5/0.5 for electric) biases toward
  // the current sample, rolling off high frequencies faster for a warmer tone.
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate)
  const channelData = buffer.getChannelData(0)
  let ptr = 0
  for (let i = 0; i < totalSamples; i++) {
    channelData[i] = delayLine[ptr]
    delayLine[ptr] = (delayLine[ptr] * 0.6 + delayLine[(ptr + 1) % N] * 0.4) * 0.997
    ptr = (ptr + 1) % N
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer

  // Body resonance: gentle boost in the low-mid range (around 280 Hz)
  const body = ctx.createBiquadFilter()
  body.type = 'peaking'
  body.frequency.value = 280
  body.gain.value = 4
  body.Q.value = 1.2

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02)  // softer attack than electric
  gain.gain.setValueAtTime(0.3, startTime + Math.max(0, duration - 0.04))
  gain.gain.linearRampToValueAtTime(0, startTime + duration)

  source.connect(body)
  body.connect(gain)
  gain.connect(destination)

  source.start(startTime)
  source.stop(startTime + duration)
}
