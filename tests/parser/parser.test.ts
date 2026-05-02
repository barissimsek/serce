// tests/parser/parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseFile, mergeFiles } from '../../src/parser/parser.js'

describe('parseFile', () => {
  it('parses directives', () => {
    const ast = parseFile('@song my_song\n@author Ada\n@tempo 120\n', 'meta.serce')
    expect(ast.directives).toMatchObject([
      { key: 'song',   value: 'my_song' },
      { key: 'author', value: 'Ada' },
      { key: 'tempo',  value: '120' },
    ])
  })

  it('parses a top-level track with one bar', () => {
    const ast = parseFile('track bass sine\n  |1| C4/q D4/q E4/q G4/q\n', 'bass.serce')
    expect(ast.topLevelTracks).toHaveLength(1)
    const track = ast.topLevelTracks[0]
    expect(track.name).toBe('bass')
    expect(track.instrument).toBe('sine')
    expect(track.bars[0].events).toMatchObject([
      { type: 'note', pitch: 'C4', duration: 'q' },
      { type: 'note', pitch: 'D4', duration: 'q' },
      { type: 'note', pitch: 'E4', duration: 'q' },
      { type: 'note', pitch: 'G4', duration: 'q' },
    ])
  })

  it('parses a named chord in a bar', () => {
    const ast = parseFile('track piano sine\n  |1| Cmaj/w\n', 'piano.serce')
    const event = ast.topLevelTracks[0].bars[0].events[0]
    expect(event).toMatchObject({ type: 'chord', name: 'Cmaj', octave: 4, duration: 'w' })
  })

  it('parses a chord with explicit octave', () => {
    const ast = parseFile('track piano sine\n  |1| Amin3/h\n', 'piano.serce')
    const event = ast.topLevelTracks[0].bars[0].events[0]
    expect(event).toMatchObject({ type: 'chord', name: 'Amin', octave: 3, duration: 'h' })
  })

  it('parses a rest', () => {
    const ast = parseFile('track bass sine\n  |1| C4/h -/h\n', 'bass.serce')
    expect(ast.topLevelTracks[0].bars[0].events[1]).toMatchObject({ type: 'rest', duration: 'h' })
  })

  it('parses an inline chord', () => {
    const ast = parseFile('track piano sine\n  |1| [C4 E4 G4]/h\n', 'piano.serce')
    const event = ast.topLevelTracks[0].bars[0].events[0]
    expect(event).toMatchObject({ type: 'inline_chord', pitches: ['C4', 'E4', 'G4'], duration: 'h' })
  })

  it('parses a track with an effect', () => {
    const ast = parseFile('track guitar sawtooth\n  effect distortion amount:0.8\n  |1| E4/w\n', 'g.serce')
    const track = ast.topLevelTracks[0]
    expect(track.effects).toMatchObject([{ type: 'distortion', params: { amount: 0.8 } }])
  })

  it('parses a section with tempo override', () => {
    const src = 'section intro @tempo 90\n  track bass sine\n    |1| C4/w\n'
    const ast = parseFile(src, 'song.serce')
    expect(ast.sections[0]).toMatchObject({ name: 'intro', tempoOverride: 90 })
    expect(ast.sections[0].tracks[0].name).toBe('bass')
  })
})

describe('mergeFiles', () => {
  it('wraps top-level tracks in a default section', () => {
    const f1 = parseFile('track bass sine\n  |1| C4/w\n', 'bass.serce')
    const song = mergeFiles([f1])
    expect(song.sections).toHaveLength(1)
    expect(song.sections[0].name).toBe('default')
    expect(song.sections[0].tracks[0].name).toBe('bass')
  })

  it('preserves named sections', () => {
    const f1 = parseFile('section verse\n  track bass sine\n    |1| C4/w\n', 's.serce')
    const song = mergeFiles([f1])
    expect(song.sections[0].name).toBe('verse')
  })

  it('merges directives from multiple files', () => {
    const f1 = parseFile('@song x\n@author y\n@tempo 120\n', 'meta.serce')
    const f2 = parseFile('track bass sine\n  |1| C4/w\n', 'bass.serce')
    const song = mergeFiles([f1, f2])
    expect(song.directives).toHaveLength(3)
  })
})
