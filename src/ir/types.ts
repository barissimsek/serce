export type Duration = 'w' | 'h' | 'q' | 'e' | 's'
export type Instrument = 'sine' | 'square' | 'sawtooth' | 'triangle'
export type EffectType = 'distortion' | 'reverb' | 'delay' | 'chorus'

export interface SongIR {
  meta: SongMeta
  sections: SectionIR[]
}

export interface SongMeta {
  song: string
  author: string
  tempo: number    // global BPM
  time: string     // e.g. '4/4'
}

export interface SectionIR {
  name: string
  tempo: number    // resolved: section override or global tempo
  tracks: TrackIR[]
}

export interface TrackIR {
  name: string
  instrument: Instrument
  effects: EffectIR[]
  bars: BarIR[]
}

export interface EffectIR {
  type: EffectType
  params: Record<string, number>
}

export interface BarIR {
  index: number
  events: EventIR[]
}

export type EventIR = NoteEventIR | ChordEventIR | RestEventIR | InlineChordEventIR

export interface NoteEventIR {
  type: 'note'
  pitch: string    // e.g. 'C4', 'F#3'
  duration: Duration
}

export interface ChordEventIR {
  type: 'chord'
  name: string     // quality without octave, e.g. 'Cmaj', 'G7'
  octave: number
  duration: Duration
}

export interface RestEventIR {
  type: 'rest'
  duration: Duration
}

export interface InlineChordEventIR {
  type: 'inline_chord'
  pitches: string[]
  duration: Duration
}
