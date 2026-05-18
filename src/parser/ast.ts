// src/parser/ast.ts

export type Duration = 'w' | 'h' | 'q' | 'e' | 's'

export interface FileAST {
  filePath: string
  directives: DirectiveNode[]
  topLevelTracks: TrackNode[]  // tracks not inside a section
  sections: SectionNode[]
}

export interface DirectiveNode {
  key: 'song' | 'author' | 'tempo' | 'time' | 'sections' | 'published' | 'copyright'
  value: string
  line: number
  filePath: string
}

export interface SectionNode {
  name: string
  tempoOverride: number | null
  tracks: TrackNode[]
  line: number
  filePath: string
}

export interface TrackNode {
  name: string
  instrument: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'electric_guitar' | 'classical_guitar' | 'piano'
  instrumentParams: Record<string, number>
  effects: EffectNode[]
  bars: BarNode[]
  line: number
  filePath: string
}

export interface EffectNode {
  type: 'distortion' | 'reverb' | 'delay' | 'chorus'
  params: Record<string, number>
  line: number
}

export interface BarNode {
  index: number
  events: EventNode[]
  line: number
}

export type EventNode = NoteNode | ChordNode | RestNode | InlineChordNode

export interface NoteNode {
  type: 'note'
  pitch: string      // e.g. 'C4', 'F#3', 'Bb4'
  duration: Duration
}

export interface ChordNode {
  type: 'chord'
  name: string       // chord quality identifier, no octave: 'Cmaj', 'Amin', 'G7'
  octave: number     // parsed from name or defaulted to 4
  duration: Duration
}

export interface RestNode {
  type: 'rest'
  duration: Duration
}

export interface InlineChordNode {
  type: 'inline_chord'
  pitches: string[]  // e.g. ['C4', 'E4', 'G4']
  duration: Duration
}

/** Merged result of parsing all files in a song directory */
export interface SongAST {
  directives: DirectiveNode[]
  sections: SectionNode[]   // includes implicit 'default' section for top-level tracks
}
