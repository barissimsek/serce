import { describe, it, expect } from 'vitest'
import { pitchToFrequency, parsePitch } from '../../src/renderer/notes.js'
import { chordToFrequencies } from '../../src/renderer/chords.js'

describe('pitchToFrequency', () => {
  it('A4 = 440 Hz', () => {
    expect(pitchToFrequency('A4')).toBeCloseTo(440, 1)
  })

  it('C4 (middle C) ≈ 261.63 Hz', () => {
    expect(pitchToFrequency('C4')).toBeCloseTo(261.63, 1)
  })

  it('A5 = 880 Hz (one octave up from A4)', () => {
    expect(pitchToFrequency('A5')).toBeCloseTo(880, 1)
  })

  it('C#4 is one semitone above C4', () => {
    expect(pitchToFrequency('C#4')).toBeCloseTo(277.18, 1)
  })

  it('Bb4 equals A#4', () => {
    expect(pitchToFrequency('Bb4')).toBeCloseTo(pitchToFrequency('A#4'), 1)
  })
})

describe('parsePitch', () => {
  it('parses C4', () => {
    expect(parsePitch('C4')).toEqual({ note: 'C', accidental: null, octave: 4 })
  })
  it('parses F#3', () => {
    expect(parsePitch('F#3')).toEqual({ note: 'F', accidental: '#', octave: 3 })
  })
  it('parses Bb5', () => {
    expect(parsePitch('Bb5')).toEqual({ note: 'B', accidental: 'b', octave: 5 })
  })
})

describe('chordToFrequencies', () => {
  it('Cmaj at octave 4 returns C4, E4, G4 frequencies', () => {
    const freqs = chordToFrequencies('Cmaj', 4)
    expect(freqs).toHaveLength(3)
    expect(freqs[0]).toBeCloseTo(pitchToFrequency('C4'), 1)
    expect(freqs[1]).toBeCloseTo(pitchToFrequency('E4'), 1)
    expect(freqs[2]).toBeCloseTo(pitchToFrequency('G4'), 1)
  })

  it('Amin at octave 3 returns A3 as root frequency', () => {
    const freqs = chordToFrequencies('Amin', 3)
    expect(freqs[0]).toBeCloseTo(pitchToFrequency('A3'), 1)
  })

  it('G7 at default octave 4 returns 4 notes', () => {
    const freqs = chordToFrequencies('G7', 4)
    expect(freqs).toHaveLength(4)
  })
})
