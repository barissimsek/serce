import { pitchToFrequency } from './notes.js'

// Intervals in semitones from root
const CHORD_INTERVALS: Record<string, number[]> = {
  maj:  [0, 4, 7],
  min:  [0, 3, 7],
  '7':  [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dim:  [0, 3, 6],
  aug:  [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
}

const NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Parse chord name string into root, accidental, quality.
 *  Input: 'Cmaj', 'G7', 'F#min7' (no octave, no duration) */
export function parseChordName(name: string): { root: string; accidental: string; quality: string } {
  const match = name.match(/^([A-G])([#b]?)(maj7|min7|maj|min|dim|aug|sus2|sus4|7)$/)
  if (!match) throw new Error(`Unrecognised chord: ${name}`)
  return { root: match[1], accidental: match[2], quality: match[3] }
}

/** Returns frequencies for all notes in the chord */
export function chordToFrequencies(chordName: string, octave: number): number[] {
  const { root, accidental, quality } = parseChordName(chordName)
  const intervals = CHORD_INTERVALS[quality]
  if (!intervals) throw new Error(`Unknown quality: ${quality}`)

  const rootPitch = root + accidental
  const rootNormalized = accidental === 'b'
    ? sharpEquivalent(root, accidental)
    : rootPitch
  const rootIndex = NOTE_ORDER.indexOf(rootNormalized)
  if (rootIndex === -1) throw new Error(`Unknown root: ${rootPitch}`)

  return intervals.map(interval => {
    const noteIndex = (rootIndex + interval) % 12
    const noteOctave = octave + Math.floor((rootIndex + interval) / 12)
    const pitch = `${NOTE_ORDER[noteIndex]}${noteOctave}`
    return pitchToFrequency(pitch)
  })
}

function sharpEquivalent(note: string, accidental: string): string {
  const FLAT_TO_SHARP: Record<string, string> = {
    'Bb': 'A#', 'Eb': 'D#', 'Ab': 'G#', 'Db': 'C#', 'Gb': 'F#',
    'Cb': 'B',  'Fb': 'E'
  }
  return FLAT_TO_SHARP[note + accidental] ?? note + accidental
}
