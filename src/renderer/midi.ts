import { SongIR } from '../ir/types.js'
import { parsePitch } from './notes.js'
import { parseChordName } from './chords.js'

const TICKS_PER_BEAT = 480

const DURATION_TICKS: Record<string, number> = {
  w: 1920, h: 960, q: 480, e: 240, s: 120,
}

// General MIDI program numbers
const GM_PROGRAM: Record<string, number> = {
  sine:             80,  // Lead 1 (square)
  square:           80,
  sawtooth:         81,  // Lead 2 (sawtooth)
  triangle:          8,  // Celesta
  electric_guitar:  27,  // Electric guitar (clean)
  classical_guitar: 24,  // Nylon string guitar
  piano:             0,  // Acoustic grand piano
}

const NOTE_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
}

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

function pitchToMidi(pitch: string): number {
  const { note, accidental, octave } = parsePitch(pitch)
  let semitone = NOTE_SEMITONES[note]
  if (accidental === '#') semitone++
  if (accidental === 'b') semitone--
  return (octave + 1) * 12 + semitone
}

function chordToMidiNotes(name: string, octave: number): number[] {
  const { root, accidental, quality } = parseChordName(name)
  let rootSemitone = NOTE_SEMITONES[root]
  if (accidental === '#') rootSemitone++
  if (accidental === 'b') rootSemitone--
  const rootMidi = (octave + 1) * 12 + rootSemitone
  return (CHORD_INTERVALS[quality] ?? [0, 4, 7]).map(iv => rootMidi + iv)
}

function varLen(value: number): number[] {
  const bytes: number[] = [value & 0x7F]
  value >>= 7
  while (value > 0) {
    bytes.unshift((value & 0x7F) | 0x80)
    value >>= 7
  }
  return bytes
}

function uint32BE(n: number): number[] {
  return [(n >> 24) & 0xFF, (n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]
}

function uint16BE(n: number): number[] {
  return [(n >> 8) & 0xFF, n & 0xFF]
}

interface MidiEvent {
  tick: number
  data: number[]
}

function buildTrackBytes(events: MidiEvent[]): number[] {
  events.sort((a, b) => a.tick - b.tick)
  const bytes: number[] = []
  let prev = 0
  for (const ev of events) {
    bytes.push(...varLen(ev.tick - prev), ...ev.data)
    prev = ev.tick
  }
  bytes.push(0x00, 0xFF, 0x2F, 0x00)  // end of track
  return bytes
}

function trackChunk(bytes: number[]): number[] {
  return [0x4D, 0x54, 0x72, 0x6B, ...uint32BE(bytes.length), ...bytes]
}

export function buildMidi(ir: SongIR): Buffer {
  const [beatsPerBar, beatDenom] = ir.meta.time.split('/').map(Number)
  const tempoEvents: MidiEvent[] = []

  // Time signature at tick 0
  tempoEvents.push({
    tick: 0,
    data: [0xFF, 0x58, 0x04, beatsPerBar, Math.log2(beatDenom), 24, 8],
  })

  // One MIDI track per unique Serce track name, channel assigned in order (skip ch 9)
  const channelMap = new Map<string, number>()
  const trackEvents = new Map<string, MidiEvent[]>()
  let nextCh = 0

  let sectionTick = 0

  for (const section of ir.sections) {
    const usPerBeat = Math.round(60_000_000 / section.tempo)
    tempoEvents.push({
      tick: sectionTick,
      data: [0xFF, 0x51, 0x03, (usPerBeat >> 16) & 0xFF, (usPerBeat >> 8) & 0xFF, usPerBeat & 0xFF],
    })

    const maxBars = Math.max(...section.tracks.map(t => t.bars.length), 0)
    const sectionTicks = maxBars * beatsPerBar * TICKS_PER_BEAT

    for (const track of section.tracks) {
      if (!channelMap.has(track.name)) {
        let ch = nextCh++
        if (ch >= 9) ch++  // skip GM drum channel
        channelMap.set(track.name, ch)
        trackEvents.set(track.name, [])
      }

      const ch = channelMap.get(track.name)!
      const events = trackEvents.get(track.name)!
      const program = GM_PROGRAM[track.instrument] ?? 0
      const transpose = Math.round(track.instrumentParams.transpose ?? 0)

      // Program change at section start
      events.push({ tick: sectionTick, data: [0xC0 | ch, program] })

      let barTick = sectionTick
      for (const bar of track.bars) {
        let offset = 0
        for (const event of bar.events) {
          const dur = DURATION_TICKS[event.duration] ?? TICKS_PER_BEAT
          const onTick = barTick + offset

          let notes: number[] = []
          if (event.type === 'note') {
            notes = [pitchToMidi(event.pitch) + transpose]
          } else if (event.type === 'chord') {
            notes = chordToMidiNotes(event.name, event.octave).map(n => n + transpose)
          } else if (event.type === 'inline_chord') {
            notes = event.pitches.map(p => pitchToMidi(p) + transpose)
          } else if (event.type === 'slide') {
            notes = [pitchToMidi(event.toPitch) + transpose]
          }

          for (const note of notes) {
            const n = Math.max(0, Math.min(127, note))
            events.push({ tick: onTick,       data: [0x90 | ch, n, 80] })  // note on
            events.push({ tick: onTick + dur - 1, data: [0x80 | ch, n, 0]  })  // note off
          }

          offset += dur
        }
        barTick += beatsPerBar * TICKS_PER_BEAT
      }
    }

    sectionTick += sectionTicks
  }

  const numTracks = 1 + trackEvents.size
  const header = [
    0x4D, 0x54, 0x68, 0x64,  // MThd
    0x00, 0x00, 0x00, 0x06,  // length = 6
    0x00, 0x01,               // format 1
    ...uint16BE(numTracks),
    ...uint16BE(TICKS_PER_BEAT),
  ]

  const chunks: number[] = [
    ...header,
    ...trackChunk(buildTrackBytes(tempoEvents)),
    ...[...trackEvents.values()].flatMap(ev => trackChunk(buildTrackBytes(ev))),
  ]

  return Buffer.from(chunks)
}
