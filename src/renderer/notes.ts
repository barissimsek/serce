const SEMITONES: Record<string, number> = {
  C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2
}

export interface ParsedPitch {
  note: string
  accidental: '#' | 'b' | null
  octave: number
}

export function parsePitch(pitch: string): ParsedPitch {
  const match = pitch.match(/^([A-G])([#b]?)(\d)$/)
  if (!match) throw new Error(`Invalid pitch: ${pitch}`)
  return {
    note: match[1],
    accidental: (match[2] || null) as ParsedPitch['accidental'],
    octave: parseInt(match[3], 10),
  }
}

export function pitchToFrequency(pitch: string): number {
  const { note, accidental, octave } = parsePitch(pitch)
  let semitone = SEMITONES[note]
  if (accidental === '#') semitone += 1
  if (accidental === 'b') semitone -= 1
  // Semitone distance from A4; A4 is at octave 4, semitone offset 0
  const distanceFromA4 = semitone + (octave - 4) * 12
  return 440 * Math.pow(2, distanceFromA4 / 12)
}
