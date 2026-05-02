export function audioBufferToWav(buffer: AudioBuffer): Buffer {
  const numChannels = 2
  const sampleRate = buffer.sampleRate
  const numSamples = buffer.length
  const bytesPerSample = 2  // 16-bit
  const dataSize = numChannels * numSamples * bytesPerSample
  const wav = Buffer.alloc(44 + dataSize)

  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8, 'ascii')
  wav.write('fmt ', 12, 'ascii')
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(numChannels, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28)
  wav.writeUInt16LE(numChannels * bytesPerSample, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(dataSize, 40)

  const left  = buffer.getChannelData(0)
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    wav.writeInt16LE(clamp(left[i]  * 32767), offset);     offset += 2
    wav.writeInt16LE(clamp(right[i] * 32767), offset);     offset += 2
  }

  return wav
}

function clamp(v: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(v)))
}
