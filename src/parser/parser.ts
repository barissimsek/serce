// src/parser/parser.ts
import { tokenize } from '../lexer/lexer.js'
import { Token, parseParam } from '../lexer/tokens.js'
import {
  FileAST, SongAST, DirectiveNode, SectionNode, TrackNode,
  EffectNode, BarNode, EventNode, NoteNode, ChordNode,
  RestNode, InlineChordNode, Duration
} from './ast.js'

export function parseFile(source: string, filePath: string): FileAST {
  const tokens = tokenize(source, filePath)
  let pos = 0

  const peek = () => tokens[pos]
  const consume = () => tokens[pos++]
  const expectKind = (kind: string) => {
    const t = consume()
    if (t.kind !== kind) throw new ParseError(`Expected ${kind} but got ${t.kind}`, t)
    return t
  }

  function parseDirective(): DirectiveNode {
    const dir = consume()  // DIRECTIVE token
    const val = consume()  // VALUE token
    const key = dir.value as DirectiveNode['key']
    return { key, value: val.value, line: dir.line, filePath }
  }

  function parseEffect(): EffectNode {
    consume()  // KEYWORD 'effect'
    const typeTok = expectKind('EFFECT_TYPE')
    const params: Record<string, number> = {}
    while (peek().kind === 'PARAM') {
      const { key, val } = parseParam(consume())
      params[key] = val
    }
    return { type: typeTok.value as EffectNode['type'], params, line: typeTok.line }
  }

  function parseBar(): BarNode {
    const marker = consume()  // BAR_MARKER
    const index = parseInt(marker.value, 10)
    const events: EventNode[] = []

    while (!isBarOrTrackOrSectionOrEOF()) {
      if (peek().kind === 'NOTE') {
        const raw = consume().value   // e.g. 'C4/q'
        const slashIdx = raw.lastIndexOf('/')
        const pitch = raw.slice(0, slashIdx)
        const dur = raw.slice(slashIdx + 1) as Duration
        const node: NoteNode = { type: 'note', pitch, duration: dur }
        events.push(node)
      } else if (peek().kind === 'CHORD') {
        const raw = consume().value   // e.g. 'Cmaj/h' or 'Amin3/q'
        events.push(parseChordToken(raw))
      } else if (peek().kind === 'REST') {
        const dur = consume().value as Duration
        const node: RestNode = { type: 'rest', duration: dur }
        events.push(node)
      } else if (peek().kind === 'LBRACKET') {
        events.push(parseInlineChord())
      } else {
        break
      }
    }

    return { index, events, line: marker.line }
  }

  function parseChordToken(raw: string): ChordNode {
    // raw: 'Cmaj/h', 'Amin3/q', 'G7/e'
    const slashIdx = raw.lastIndexOf('/')
    const nameAndOctave = raw.slice(0, slashIdx)
    const dur = raw.slice(slashIdx + 1) as Duration
    // Extract optional trailing octave digit (only for non-digit-ending qualities)
    const octaveMatch = nameAndOctave.match(/^([A-G][#b]?(?:maj7|min7|maj|min|dim|aug|sus2|sus4|7))(\d?)$/)
    if (!octaveMatch) throw new Error(`Invalid chord token: ${raw}`)
    const name = octaveMatch[1]
    const octave = octaveMatch[2] ? parseInt(octaveMatch[2], 10) : 4
    return { type: 'chord', name, octave, duration: dur }
  }

  function parseInlineChord(): InlineChordNode {
    consume()  // LBRACKET — we already checked peek().kind === 'LBRACKET'
    const pitches: string[] = []
    while (peek().kind === 'NOTE_PITCH') {
      pitches.push(consume().value)
    }
    expectKind('RBRACKET')               // <-- was bare consume()
    const durTok = expectKind('DURATION')
    return { type: 'inline_chord', pitches, duration: durTok.value as Duration }
  }

  function parseTrack(): TrackNode {
    const kw = consume()   // KEYWORD 'track'
    const name = expectKind('IDENTIFIER').value
    const instrument = expectKind('INSTRUMENT').value as TrackNode['instrument']
    const effects: EffectNode[] = []
    const bars: BarNode[] = []

    while (peek().kind === 'KEYWORD' && peek().value === 'effect') {
      effects.push(parseEffect())
    }
    while (peek().kind === 'BAR_MARKER') {
      bars.push(parseBar())
    }

    return { name, instrument, effects, bars, line: kw.line, filePath }
  }

  function parseSection(): SectionNode {
    const kw = consume()  // KEYWORD 'section'
    const name = expectKind('IDENTIFIER').value
    let tempoOverride: number | null = null
    if (peek().kind === 'AT_TEMPO') {
      consume()
      tempoOverride = parseInt(expectKind('NUMBER').value, 10)
    }
    const tracks: TrackNode[] = []
    while (peek().kind === 'KEYWORD' && peek().value === 'track') {
      tracks.push(parseTrack())
    }
    return { name, tempoOverride, tracks, line: kw.line, filePath }
  }

  function isBarOrTrackOrSectionOrEOF(): boolean {
    const k = peek().kind
    return k === 'BAR_MARKER' || k === 'EOF' ||
      (k === 'KEYWORD' && (peek().value === 'track' || peek().value === 'section'))
  }

  const directives: DirectiveNode[] = []
  const topLevelTracks: TrackNode[] = []
  const sections: SectionNode[] = []

  while (peek().kind !== 'EOF') {
    const t = peek()
    if (t.kind === 'DIRECTIVE') {
      directives.push(parseDirective())
    } else if (t.kind === 'KEYWORD' && t.value === 'section') {
      sections.push(parseSection())
    } else if (t.kind === 'KEYWORD' && t.value === 'track') {
      topLevelTracks.push(parseTrack())
    } else {
      consume()  // skip unexpected
    }
  }

  return { filePath, directives, topLevelTracks, sections }
}

export function mergeFiles(files: FileAST[]): SongAST {
  const directives = files.flatMap(f => f.directives)
  const sections: SectionNode[] = []

  const topLevelTracks = files.flatMap(f => f.topLevelTracks)
  if (topLevelTracks.length > 0) {
    sections.push({
      name: 'default',
      tempoOverride: null,
      tracks: topLevelTracks,
      line: 0,
      filePath: '',
    })
  }

  for (const file of files) {
    sections.push(...file.sections)
  }

  return { directives, sections }
}

export class ParseError extends Error {
  constructor(msg: string, public token: Token) { super(msg) }
}
