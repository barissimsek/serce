export function playPiano(
  ctx: OfflineAudioContext,
  freq: number,
  startTime: number,
  duration: number,
  destination: AudioNode
): void {
  const sampleRate = ctx.sampleRate
  const totalSamples = Math.ceil(sampleRate * duration)
  const attackSamples = Math.ceil(0.003 * sampleRate)  // 3ms hammer strike

  // Low notes sustain longer than high notes
  const decayScale = Math.pow(220 / Math.max(freq, 55), 0.5)

  // Inharmonicity coefficient — piano strings are stiff, so partials stretch slightly sharp
  const B = 0.0001

  // Harmonic partials: [frequency multiplier, relative amplitude, decay seconds at A3]
  const partials: [number, number, number][] = [
    [1,    1.000, 8.0],
    [2,    0.500, 5.0],
    [3,    0.250, 3.5],
    [4,    0.120, 2.5],
    [5,    0.060, 1.8],
    [6,    0.030, 1.2],
    [7,    0.015, 0.9],
  ]

  const buffer = ctx.createBuffer(1, totalSamples, sampleRate)
  const data = buffer.getChannelData(0)

  for (const [mult, amp, baseDecay] of partials) {
    const partialFreq = freq * mult * Math.sqrt(1 + B * mult * mult)
    const omega = (2 * Math.PI * partialFreq) / sampleRate
    const decayFactor = Math.exp(-1 / (baseDecay * decayScale * sampleRate))
    let env = 1.0

    for (let i = 0; i < totalSamples; i++) {
      const attack = i < attackSamples ? i / attackSamples : 1.0
      data[i] += amp * Math.sin(omega * i) * attack * env
      env *= decayFactor
    }
  }

  const peakAmp = partials.reduce((sum, [, amp]) => sum + amp, 0)

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const gain = ctx.createGain()
  const g = 0.3 / peakAmp
  gain.gain.setValueAtTime(g, startTime)
  gain.gain.setValueAtTime(g, startTime + Math.max(0, duration - 0.04))
  gain.gain.linearRampToValueAtTime(0, startTime + duration)

  source.connect(gain)
  gain.connect(destination)

  source.start(startTime)
  source.stop(startTime + duration)
}
