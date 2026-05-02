import { describe, it, expect } from 'vitest'
import { tokenize } from '../../src/lexer/lexer.js'

// Strip EOF sentinel before array assertions — EOF is tested implicitly via the parser
const noEOF = (tokens: ReturnType<typeof tokenize>) =>
  tokens.filter(t => t.kind !== 'EOF')

describe('tokenize', () => {
  it('tokenizes a directive line', () => {
    expect(noEOF(tokenize('@song my_song\n', 'meta.serce'))).toMatchObject([
      { kind: 'DIRECTIVE', value: 'song' },
      { kind: 'VALUE', value: 'my_song' },
    ])
  })

  it('tokenizes a multi-word directive value', () => {
    expect(noEOF(tokenize('@author John Doe\n', 'meta.serce'))).toMatchObject([
      { kind: 'DIRECTIVE', value: 'author' },
      { kind: 'VALUE', value: 'John Doe' },
    ])
  })

  it('tokenizes @tempo as a directive at top level', () => {
    expect(noEOF(tokenize('@tempo 120\n', 'meta.serce'))).toMatchObject([
      { kind: 'DIRECTIVE', value: 'tempo' },
      { kind: 'VALUE', value: '120' },
    ])
  })

  it('tokenizes a track declaration', () => {
    expect(noEOF(tokenize('track bass sine\n', 'bass.serce'))).toMatchObject([
      { kind: 'KEYWORD', value: 'track' },
      { kind: 'IDENTIFIER', value: 'bass' },
      { kind: 'INSTRUMENT', value: 'sine' },
    ])
  })

  it('tokenizes a bar line with note, chord, and rest', () => {
    expect(noEOF(tokenize('  |1| C4/q Cmaj/h -/q\n', 'bass.serce'))).toMatchObject([
      { kind: 'BAR_MARKER', value: '1' },
      { kind: 'NOTE', value: 'C4/q' },
      { kind: 'CHORD', value: 'Cmaj/h' },
      { kind: 'REST', value: 'q' },
    ])
  })

  it('tokenizes an inline chord', () => {
    expect(noEOF(tokenize('  |1| [C4 E4 G4]/h\n', 'bass.serce'))).toMatchObject([
      { kind: 'BAR_MARKER', value: '1' },
      { kind: 'LBRACKET' },
      { kind: 'NOTE_PITCH', value: 'C4' },
      { kind: 'NOTE_PITCH', value: 'E4' },
      { kind: 'NOTE_PITCH', value: 'G4' },
      { kind: 'RBRACKET' },
      { kind: 'DURATION', value: 'h' },
    ])
  })

  it('tokenizes an effect line', () => {
    expect(noEOF(tokenize('  effect distortion amount:0.8\n', 'bass.serce'))).toMatchObject([
      { kind: 'KEYWORD', value: 'effect' },
      { kind: 'EFFECT_TYPE', value: 'distortion' },
      { kind: 'PARAM', value: 'amount:0.8' },
    ])
  })

  it('tokenizes a section line with tempo override', () => {
    expect(noEOF(tokenize('section intro @tempo 90\n', 'song.serce'))).toMatchObject([
      { kind: 'KEYWORD', value: 'section' },
      { kind: 'IDENTIFIER', value: 'intro' },
      { kind: 'AT_TEMPO' },
      { kind: 'NUMBER', value: '90' },
    ])
  })

  it('tokenizes a sharp note', () => {
    expect(noEOF(tokenize('  |1| F#3/h\n', 'bass.serce'))).toMatchObject([
      { kind: 'BAR_MARKER', value: '1' },
      { kind: 'NOTE', value: 'F#3/h' },
    ])
  })

  it('tokenizes a flat note', () => {
    expect(noEOF(tokenize('  |1| Bb4/e\n', 'bass.serce'))).toMatchObject([
      { kind: 'BAR_MARKER', value: '1' },
      { kind: 'NOTE', value: 'Bb4/e' },
    ])
  })

  it('ignores blank lines', () => {
    const tokens = tokenize('\n\n', 'bass.serce')
    expect(tokens.filter(t => t.kind !== 'EOF')).toHaveLength(0)
  })

  it('attaches line numbers', () => {
    const tokens = tokenize('@song x\ntrack bass sine\n', 'f.serce')
    expect(tokens.find(t => t.kind === 'KEYWORD')?.line).toBe(2)
  })

  it('appends EOF token', () => {
    const tokens = tokenize('@song x\n', 'meta.serce')
    expect(tokens[tokens.length - 1].kind).toBe('EOF')
  })

  it('tokenizes a dominant-7th chord (G7) as CHORD not NOTE', () => {
    expect(noEOF(tokenize('  |1| G7/e\n', 'bass.serce'))).toMatchObject([
      { kind: 'BAR_MARKER', value: '1' },
      { kind: 'CHORD', value: 'G7/e' },
    ])
  })
})
