# Serce Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compiler for the Serce music language that reads `.serce` files from a directory and produces a `.wav` audio file.

**Architecture:** Two-phase pipeline — Phase 1 parses and validates `.serce` files into a Song IR (JSON), Phase 2 renders the IR to audio via Web Audio API. The web playground is out of scope for this plan; all audio synthesis targets Node.js via `node-web-audio-api`.

**Tech Stack:** TypeScript 5, Node.js 20+, `node-web-audio-api`, `commander`, `vitest`

---

## File Map

```
serce/
  package.json
  tsconfig.json
  vitest.config.ts
  .gitignore
  src/
    lexer/
      tokens.ts        token type definitions
      lexer.ts         line-by-line tokenizer
    parser/
      ast.ts           AST node type definitions
      parser.ts        recursive descent parser (single file → FileAST, merge → SongAST)
    validator/
      validator.ts     cross-file validation rules → ValidationError[]
    ir/
      types.ts         Song IR type definitions (matches JSON schema in spec)
      builder.ts       SongAST → SongIR transform
    renderer/
      notes.ts         note-name → frequency table + pitch string parser
      chords.ts        chord quality → interval table, chord → [pitch] resolver
      renderer.ts      SongIR → OfflineAudioContext → AudioBuffer
      wav.ts           AudioBuffer → WAV Buffer (no deps, raw PCM)
    cli/
      index.ts         commander CLI: compile / check commands
  tests/
    lexer/lexer.test.ts
    parser/parser.test.ts
    validator/validator.test.ts
    ir/builder.test.ts
    renderer/notes.test.ts
    renderer/renderer.test.ts
    renderer/wav.test.ts
    e2e/compile.test.ts
```

---

## Task 0: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Initialise git and install dependencies**

```bash
cd /Users/bs/workdir/repos/serce
git init
npm init -y
npm install --save-dev typescript vitest @types/node
npm install node-web-audio-api commander
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Update `package.json` scripts**

```json
{
  "name": "serce",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "serce": "node --experimental-vm-modules dist/cli/index.js"
  }
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
*.wav
*.ir.json
```

- [ ] **Step 6: Verify vitest runs (no tests yet)**

```bash
npm test
```

Expected: `No test files found`

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore package-lock.json
git commit -m "chore: project scaffold"
```

---

## Task 1: Token types

**Files:**
- Create: `src/lexer/tokens.ts`

- [ ] **Step 1: Create token type definitions**

```typescript
// src/lexer/tokens.ts

export type TokenKind =
  | 'DIRECTIVE'    // @song → value: 'song'; @author → value: 'author'
  | 'VALUE'        // rest-of-line after a directive: 'my_song', 'John Doe', '120'
  | 'KEYWORD'      // 'track' | 'section' | 'effect'
  | 'INSTRUMENT'   // 'sine' | 'square' | 'sawtooth' | 'triangle'
  | 'EFFECT_TYPE'  // 'distortion' | 'reverb' | 'delay' | 'chorus'
  | 'IDENTIFIER'   // track/section names
  | 'BAR_MARKER'   // |1|, |2| → value: '1', '2'
  | 'NOTE'         // C4/q, F#3/h, Bb4/e → value: full string
  | 'CHORD'        // Cmaj/h, Amin4/q, G7/e → value: full string
  | 'REST'         // -/q, -/h → value: duration char only: 'q'
  | 'NOTE_PITCH'   // C4, E4 inside [...] inline chords → value: pitch string
  | 'LBRACKET'     // '['
  | 'RBRACKET'     // ']'
  | 'DURATION'     // /q, /h after ']' → value: 'q', 'h'
  | 'PARAM'        // amount:0.8 → value encodes both; use parseParam() to split
  | 'NUMBER'       // standalone integer (section @tempo value)
  | 'AT_TEMPO'     // '@tempo' when appearing inside a section line
  | 'EOF'

export interface Token {
  kind: TokenKind
  value: string
  line: number
  filePath: string
}

export const INSTRUMENTS = new Set(['sine', 'square', 'sawtooth', 'triangle'])
export const EFFECT_TYPES = new Set(['distortion', 'reverb', 'delay', 'chorus'])
export const KEYWORDS = new Set(['track', 'section', 'effect'])
export const DURATIONS = new Set(['w', 'h', 'q', 'e', 's'])

/** Split a PARAM token value into key and numeric value */
export function parseParam(token: Token): { key: string; val: number } {
  const [key, raw] = token.value.split(':')
  return { key, val: parseFloat(raw) }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lexer/tokens.ts
git commit -m "feat: token type definitions"
```

---

## Task 2: Lexer

**Files:**
- Create: `src/lexer/lexer.ts`
- Create: `tests/lexer/lexer.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lexer/lexer.test.ts
import { describe, it, expect } from 'vitest'
import { tokenize } from '../../src/lexer/lexer.js'

describe('tokenize', () => {
  it('tokenizes a directive line', () => {
    const tokens = tokenize('@song my_song\n', 'meta.serce')
    expect(tokens).toMatchObject([
      { kind: 'DIRECTIVE', value: 'song' },
      { kind: 'VALUE', value: 'my_song' },
    ])
  })

  it('tokenizes a multi-word directive value', () => {
    const tokens = tokenize('@author John Doe\n', 'meta.serce')
    expect(tokens).toMatchObject([
      { kind: 'DIRECTIVE', value: 'author' },
      { kind: 'VALUE', value: 'John Doe' },
    ])
  })

  it('tokenizes a track declaration', () => {
    const tokens = tokenize('track bass sine\n', 'bass.serce')
    expect(tokens).toMatchObject([
      { kind: 'KEYWORD', value: 'track' },
      { kind: 'IDENTIFIER', value: 'bass' },
      { kind: 'INSTRUMENT', value: 'sine' },
    ])
  })

  it('tokenizes a bar line with note, chord, and rest', () => {
    const tokens = tokenize('  |1| C4/q Cmaj/h -/q\n', 'bass.serce')
    expect(tokens).toMatchObject([
      { kind: 'BAR_MARKER', value: '1' },
      { kind: 'NOTE', value: 'C4/q' },
      { kind: 'CHORD', value: 'Cmaj/h' },
      { kind: 'REST', value: 'q' },
    ])
  })

  it('tokenizes an inline chord', () => {
    const tokens = tokenize('  |1| [C4 E4 G4]/h\n', 'bass.serce')
    expect(tokens).toMatchObject([
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
    const tokens = tokenize('  effect distortion amount:0.8\n', 'bass.serce')
    expect(tokens).toMatchObject([
      { kind: 'KEYWORD', value: 'effect' },
      { kind: 'EFFECT_TYPE', value: 'distortion' },
      { kind: 'PARAM', value: 'amount:0.8' },
    ])
  })

  it('tokenizes a section line with tempo override', () => {
    const tokens = tokenize('section intro @tempo 90\n', 'song.serce')
    expect(tokens).toMatchObject([
      { kind: 'KEYWORD', value: 'section' },
      { kind: 'IDENTIFIER', value: 'intro' },
      { kind: 'AT_TEMPO' },
      { kind: 'NUMBER', value: '90' },
    ])
  })

  it('tokenizes a sharp note', () => {
    const tokens = tokenize('  |1| F#3/h\n', 'bass.serce')
    expect(tokens).toMatchObject([
      { kind: 'BAR_MARKER', value: '1' },
      { kind: 'NOTE', value: 'F#3/h' },
    ])
  })

  it('tokenizes a flat note', () => {
    const tokens = tokenize('  |1| Bb4/e\n', 'bass.serce')
    expect(tokens).toMatchObject([
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
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/lexer/lexer.test.ts
```

Expected: `Cannot find module '../../src/lexer/lexer.js'`

- [ ] **Step 3: Implement the lexer**

```typescript
// src/lexer/lexer.ts
import { Token, TokenKind, INSTRUMENTS, EFFECT_TYPES, KEYWORDS, DURATIONS } from './tokens.js'

const NOTE_RE   = /^[A-G][#b]?\d\/[whqes]$/
const CHORD_RE  = /^[A-G][#b]?(maj7|min7|maj|min|dim|aug|sus2|sus4|7)\d?\/[whqes]$/
const REST_RE   = /^-\/([whqes])$/
const PITCH_RE  = /^[A-G][#b]?\d$/   // pitch only, no duration — used inside [...]
const PARAM_RE  = /^\w+:\d+(\.\d+)?$/
const BAR_RE    = /^\|(\d+)\|$/

function classifyWord(word: string, insideBracket: boolean): TokenKind {
  if (insideBracket && PITCH_RE.test(word)) return 'NOTE_PITCH'
  if (REST_RE.test(word)) return 'REST'
  if (NOTE_RE.test(word)) return 'NOTE'
  if (CHORD_RE.test(word)) return 'CHORD'
  if (BAR_RE.test(word)) return 'BAR_MARKER'
  if (PARAM_RE.test(word)) return 'PARAM'
  if (KEYWORDS.has(word)) return 'KEYWORD'
  if (INSTRUMENTS.has(word)) return 'INSTRUMENT'
  if (EFFECT_TYPES.has(word)) return 'EFFECT_TYPE'
  if (/^\d+$/.test(word)) return 'NUMBER'
  return 'IDENTIFIER'
}

export function tokenize(source: string, filePath: string): Token[] {
  const tokens: Token[] = []
  const lines = source.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const line = lines[i].trim()
    if (!line) continue

    const tok = (kind: TokenKind, value: string): Token =>
      ({ kind, value, line: lineNum, filePath })

    // Directive line: @keyword rest-of-line
    if (line.startsWith('@')) {
      if (line.startsWith('@tempo') && !line.startsWith('@tempo ')) {
        // standalone @tempo without a value — shouldn't happen but guard
      }
      const spaceIdx = line.indexOf(' ')
      if (spaceIdx === -1) {
        tokens.push(tok('DIRECTIVE', line.slice(1)))
        continue
      }
      const keyword = line.slice(1, spaceIdx)
      const rest = line.slice(spaceIdx + 1).trim()
      if (keyword === 'tempo') {
        tokens.push(tok('AT_TEMPO', keyword))
        tokens.push(tok('NUMBER', rest))
      } else {
        tokens.push(tok('DIRECTIVE', keyword))
        tokens.push(tok('VALUE', rest))
      }
      continue
    }

    // Section line may contain @tempo mid-line: "section intro @tempo 90"
    // Handle by splitting on @tempo
    const atTempoIdx = line.indexOf(' @tempo ')
    if (line.startsWith('section') && atTempoIdx !== -1) {
      const before = line.slice(0, atTempoIdx).trim()
      const after  = line.slice(atTempoIdx + ' @tempo '.length).trim()
      for (const word of before.split(/\s+/)) {
        tokens.push(tok(classifyWord(word, false), word))
      }
      tokens.push(tok('AT_TEMPO', 'tempo'))
      tokens.push(tok('NUMBER', after))
      continue
    }

    // All other lines: tokenize word by word, with bracket tracking
    let insideBracket = false
    const words = splitLineIntoWords(line)
    for (const word of words) {
      if (word === '[') {
        insideBracket = true
        tokens.push(tok('LBRACKET', '['))
        continue
      }
      if (word === ']') {
        insideBracket = false
        tokens.push(tok('RBRACKET', ']'))
        continue
      }
      // Duration after closing bracket: /q
      if (word.startsWith('/') && DURATIONS.has(word.slice(1))) {
        tokens.push(tok('DURATION', word.slice(1)))
        continue
      }
      // Bar marker |n|
      const barMatch = word.match(BAR_RE)
      if (barMatch) {
        tokens.push(tok('BAR_MARKER', barMatch[1]))
        continue
      }
      // Rest -/q → emit REST with duration value only
      const restMatch = word.match(REST_RE)
      if (restMatch) {
        tokens.push(tok('REST', restMatch[1]))
        continue
      }
      const kind = classifyWord(word, insideBracket)
      tokens.push(tok(kind, word))
    }
  }

  tokens.push({ kind: 'EOF', value: '', line: lines.length, filePath })
  return tokens
}

/** Split a line into words, treating [ and ] as standalone tokens and
 *  keeping inline-chord suffix /q attached to ] as a separate token. */
function splitLineIntoWords(line: string): string[] {
  // Insert spaces around [ and ], then split
  // But keep ]/h together as two tokens: ] and /h
  const spaced = line
    .replace(/\[/g, ' [ ')
    .replace(/\]\/([whqes])/g, ' ] /$1 ')
    .replace(/\]/g, ' ] ')
  return spaced.split(/\s+/).filter(Boolean)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- tests/lexer/lexer.test.ts
```

Expected: all green

- [ ] **Step 5: Commit**

```bash
git add src/lexer/ tests/lexer/
git commit -m "feat: lexer"
```

---

## Task 3: AST types and Parser

**Files:**
- Create: `src/parser/ast.ts`
- Create: `src/parser/parser.ts`
- Create: `tests/parser/parser.test.ts`

- [ ] **Step 1: Define AST types**

```typescript
// src/parser/ast.ts

export type Duration = 'w' | 'h' | 'q' | 'e' | 's'

export interface FileAST {
  filePath: string
  directives: DirectiveNode[]
  topLevelTracks: TrackNode[]  // tracks not inside a section
  sections: SectionNode[]
}

export interface DirectiveNode {
  key: 'song' | 'author' | 'tempo' | 'time'
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
  instrument: 'sine' | 'square' | 'sawtooth' | 'triangle'
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
  name: string       // full chord name without duration: 'Cmaj', 'Amin4', 'G7'
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
```

- [ ] **Step 2: Write the failing tests**

```typescript
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
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npm test -- tests/parser/parser.test.ts
```

Expected: `Cannot find module '../../src/parser/parser.js'`

- [ ] **Step 4: Implement the parser**

```typescript
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
  const expect = (kind: string) => {
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
    const typeTok = expect('EFFECT_TYPE')
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
        const [pitch, dur] = raw.split('/')
        events.push({ type: 'note', pitch, duration: dur as Duration } satisfies NoteNode)
      } else if (peek().kind === 'CHORD') {
        const raw = consume().value   // e.g. 'Cmaj/h' or 'Amin3/q'
        events.push(parseChordToken(raw))
      } else if (peek().kind === 'REST') {
        const dur = consume().value as Duration
        events.push({ type: 'rest', duration: dur } satisfies RestNode)
      } else if (peek().kind === 'LBRACKET') {
        events.push(parseInlineChord())
      } else {
        break
      }
    }

    return { index, events, line: parseInt(marker.line.toString()) }
  }

  function parseChordToken(raw: string): ChordNode {
    // raw: 'Cmaj/h', 'Amin3/q', 'G7/e'
    const [nameAndOctave, dur] = raw.split('/')
    // Extract optional trailing octave digit (only for non-digit-ending qualities)
    const octaveMatch = nameAndOctave.match(/^([A-G][#b]?(?:maj7|min7|maj|min|dim|aug|sus2|sus4|7))(\d?)$/)
    if (!octaveMatch) throw new Error(`Invalid chord token: ${raw}`)
    const name = octaveMatch[1]
    const octave = octaveMatch[2] ? parseInt(octaveMatch[2], 10) : 4
    return { type: 'chord', name, octave, duration: dur as Duration }
  }

  function parseInlineChord(): InlineChordNode {
    consume()  // LBRACKET
    const pitches: string[] = []
    while (peek().kind === 'NOTE_PITCH') {
      pitches.push(consume().value)
    }
    consume()  // RBRACKET
    const durTok = expect('DURATION')
    return { type: 'inline_chord', pitches, duration: durTok.value as Duration }
  }

  function parseTrack(): TrackNode {
    const kw = consume()   // KEYWORD 'track'
    const name = expect('IDENTIFIER').value
    const instrument = expect('INSTRUMENT').value as TrackNode['instrument']
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
    const name = expect('IDENTIFIER').value
    let tempoOverride: number | null = null
    if (peek().kind === 'AT_TEMPO') {
      consume()
      tempoOverride = parseInt(expect('NUMBER').value, 10)
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

class ParseError extends Error {
  constructor(msg: string, public token: Token) { super(msg) }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- tests/parser/parser.test.ts
```

Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/parser/ tests/parser/
git commit -m "feat: AST types and parser"
```

---

## Task 4: Validator

**Files:**
- Create: `src/validator/validator.ts`
- Create: `tests/validator/validator.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/validator/validator.test.ts
import { describe, it, expect } from 'vitest'
import { validate } from '../../src/validator/validator.js'
import { parseFile, mergeFiles } from '../../src/parser/parser.js'

function song(...sources: [string, string][]) {
  return mergeFiles(sources.map(([src, path]) => parseFile(src, path)))
}

describe('validate', () => {
  it('passes a valid single-file song', () => {
    const ast = song(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['track bass sine\n  |1| C4/q D4/q E4/q G4/q\n', 'bass.serce']
    )
    expect(validate(ast, ['meta.serce', 'bass.serce'])).toHaveLength(0)
  })

  it('errors when meta.serce is missing', () => {
    const ast = song(['track bass sine\n  |1| C4/w\n', 'bass.serce'])
    const errors = validate(ast, ['bass.serce'])
    expect(errors.some(e => e.message.includes('meta.serce'))).toBe(true)
  })

  it('errors when @author is missing', () => {
    const ast = song(['@song x\n@tempo 120\n', 'meta.serce'])
    const errors = validate(ast, ['meta.serce'])
    expect(errors.some(e => e.message.includes('@author'))).toBe(true)
  })

  it('errors when @song is missing', () => {
    const ast = song(['@author y\n@tempo 120\n', 'meta.serce'])
    const errors = validate(ast, ['meta.serce'])
    expect(errors.some(e => e.message.includes('@song'))).toBe(true)
  })

  it('errors when @tempo is missing', () => {
    const ast = song(['@song x\n@author y\n', 'meta.serce'])
    const errors = validate(ast, ['meta.serce'])
    expect(errors.some(e => e.message.includes('@tempo'))).toBe(true)
  })

  it('errors on duplicate track names within the same section', () => {
    const ast = song(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['track bass sine\n  |1| C4/w\n', 'a.serce'],
      ['track bass sine\n  |1| G4/w\n', 'b.serce']
    )
    const errors = validate(ast, ['meta.serce', 'a.serce', 'b.serce'])
    expect(errors.some(e => e.message.includes('bass'))).toBe(true)
  })

  it('errors when bar durations do not sum to time signature', () => {
    // 4/4 expects 4 beats; two quarter notes = 2 beats
    const ast = song(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['track bass sine\n  |1| C4/q D4/q\n', 'bass.serce']
    )
    const errors = validate(ast, ['meta.serce', 'bass.serce'])
    expect(errors.some(e => e.message.includes('duration'))).toBe(true)
  })

  it('errors on unknown chord name', () => {
    const ast = song(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['track bass sine\n  |1| Cblue/w\n', 'bass.serce']
    )
    const errors = validate(ast, ['meta.serce', 'bass.serce'])
    expect(errors.some(e => e.message.includes('Cblue'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/validator/validator.test.ts
```

Expected: `Cannot find module '../../src/validator/validator.js'`

- [ ] **Step 3: Implement the validator**

```typescript
// src/validator/validator.ts
import { SongAST, BarNode, EventNode } from '../parser/ast.js'

export interface ValidationError {
  file: string
  line: number | null
  message: string
}

const CHORD_QUALITIES = new Set(['maj7','min7','maj','min','dim','aug','sus2','sus4','7'])
const DURATION_BEATS: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 }

export function validate(ast: SongAST, filePaths: string[]): ValidationError[] {
  const errors: ValidationError[] = []
  const err = (file: string, line: number | null, message: string) =>
    errors.push({ file, line, message })

  // meta.serce must be present
  if (!filePaths.includes('meta.serce')) {
    err('', null, 'meta.serce is required but was not found in this directory')
  }

  // Required directives
  for (const key of ['song', 'author', 'tempo'] as const) {
    const found = ast.directives.filter(d => d.key === key)
    if (found.length === 0) {
      err('meta.serce', null, `missing required directive @${key}`)
    }
  }

  // Parse time signature
  const timeDirValue = ast.directives.find(d => d.key === 'time')?.value ?? '4/4'
  const [beatsPerBar] = timeDirValue.split('/').map(Number)

  for (const section of ast.sections) {
    // Duplicate track names within a section
    const seen = new Map<string, { file: string; line: number }>()
    for (const track of section.tracks) {
      if (seen.has(track.name)) {
        const prev = seen.get(track.name)!
        err(track.filePath, track.line,
          `track name "${track.name}" already declared in ${prev.file}:${prev.line}`)
      } else {
        seen.set(track.name, { file: track.filePath, line: track.line })
      }

      for (const bar of track.bars) {
        validateBarDuration(bar, beatsPerBar, track.filePath, err)
        for (const event of bar.events) {
          if (event.type === 'chord') validateChordName(event.name, bar, track.filePath, err)
        }
      }
    }
  }

  return errors
}

function validateBarDuration(
  bar: BarNode,
  beatsPerBar: number,
  file: string,
  err: (f: string, l: number | null, m: string) => void
) {
  const total = bar.events.reduce((sum, e) => {
    if (e.type === 'inline_chord') return sum + (DURATION_BEATS[e.duration] ?? 0)
    return sum + (DURATION_BEATS[e.duration] ?? 0)
  }, 0)
  if (Math.abs(total - beatsPerBar) > 0.001) {
    err(file, bar.line, `bar |${bar.index}| duration is ${total} beats, expected ${beatsPerBar}`)
  }
}

function validateChordName(
  name: string,
  bar: BarNode,
  file: string,
  err: (f: string, l: number | null, m: string) => void
) {
  // name: 'Cmaj', 'G7', 'Amin' (octave already stripped by parser)
  const quality = name.slice(1).replace(/^[#b]/, '')  // strip root and accidental
  if (!CHORD_QUALITIES.has(quality)) {
    err(file, bar.line, `unknown chord "${name}" — valid qualities: ${[...CHORD_QUALITIES].join(', ')}`)
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- tests/validator/validator.test.ts
```

Expected: all green

- [ ] **Step 5: Commit**

```bash
git add src/validator/ tests/validator/
git commit -m "feat: validator"
```

---

## Task 5: IR types and builder

**Files:**
- Create: `src/ir/types.ts`
- Create: `src/ir/builder.ts`
- Create: `tests/ir/builder.test.ts`

- [ ] **Step 1: Define IR types**

```typescript
// src/ir/types.ts

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
```

- [ ] **Step 2: Write the failing tests**

```typescript
// tests/ir/builder.test.ts
import { describe, it, expect } from 'vitest'
import { buildIR } from '../../src/ir/builder.js'
import { parseFile, mergeFiles } from '../../src/parser/parser.js'

function makeAST(...sources: [string, string][]) {
  return mergeFiles(sources.map(([src, path]) => parseFile(src, path)))
}

describe('buildIR', () => {
  it('builds meta from directives', () => {
    const ast = makeAST(['@song hello\n@author Ada\n@tempo 120\n@time 3/4\n', 'meta.serce'])
    const ir = buildIR(ast)
    expect(ir.meta).toEqual({ song: 'hello', author: 'Ada', tempo: 120, time: '3/4' })
  })

  it('defaults time to 4/4', () => {
    const ast = makeAST(['@song x\n@author y\n@tempo 90\n', 'meta.serce'])
    const ir = buildIR(ast)
    expect(ir.meta.time).toBe('4/4')
  })

  it('puts top-level tracks in default section', () => {
    const ast = makeAST(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['track bass sine\n  |1| C4/q D4/q E4/q G4/q\n', 'bass.serce']
    )
    const ir = buildIR(ast)
    expect(ir.sections[0].name).toBe('default')
    expect(ir.sections[0].tracks[0].name).toBe('bass')
  })

  it('resolves section tempo override', () => {
    const ast = makeAST(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['section slow @tempo 60\n  track bass sine\n    |1| C4/w\n', 'song.serce']
    )
    const ir = buildIR(ast)
    expect(ir.sections[0].tempo).toBe(60)
  })

  it('inherits global tempo when section has no override', () => {
    const ast = makeAST(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['section verse\n  track bass sine\n    |1| C4/w\n', 'song.serce']
    )
    const ir = buildIR(ast)
    expect(ir.sections[0].tempo).toBe(120)
  })

  it('builds note events correctly', () => {
    const ast = makeAST(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['track bass sine\n  |1| F#3/h -/h\n', 'bass.serce']
    )
    const ir = buildIR(ast)
    const bar = ir.sections[0].tracks[0].bars[0]
    expect(bar.events[0]).toEqual({ type: 'note', pitch: 'F#3', duration: 'h' })
    expect(bar.events[1]).toEqual({ type: 'rest', duration: 'h' })
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npm test -- tests/ir/builder.test.ts
```

Expected: `Cannot find module '../../src/ir/builder.js'`

- [ ] **Step 4: Implement the IR builder**

```typescript
// src/ir/builder.ts
import { SongAST, SectionNode, TrackNode, BarNode, EventNode } from '../parser/ast.js'
import {
  SongIR, SongMeta, SectionIR, TrackIR, EffectIR, BarIR, EventIR
} from './types.js'

export function buildIR(ast: SongAST): SongIR {
  const get = (key: string) => ast.directives.find(d => d.key === key)?.value ?? ''
  const meta: SongMeta = {
    song:   get('song'),
    author: get('author'),
    tempo:  parseInt(get('tempo') || '120', 10),
    time:   get('time') || '4/4',
  }

  const sections: SectionIR[] = ast.sections.map(s => buildSection(s, meta.tempo))
  return { meta, sections }
}

function buildSection(section: SectionNode, globalTempo: number): SectionIR {
  return {
    name: section.name,
    tempo: section.tempoOverride ?? globalTempo,
    tracks: section.tracks.map(buildTrack),
  }
}

function buildTrack(track: TrackNode): TrackIR {
  return {
    name: track.name,
    instrument: track.instrument,
    effects: track.effects.map(e => ({ type: e.type, params: { ...e.params } } satisfies EffectIR)),
    bars: track.bars.map(buildBar),
  }
}

function buildBar(bar: BarNode): BarIR {
  return {
    index: bar.index,
    events: bar.events.map(buildEvent),
  }
}

function buildEvent(event: EventNode): EventIR {
  switch (event.type) {
    case 'note':         return { type: 'note', pitch: event.pitch, duration: event.duration }
    case 'chord':        return { type: 'chord', name: event.name, octave: event.octave, duration: event.duration }
    case 'rest':         return { type: 'rest', duration: event.duration }
    case 'inline_chord': return { type: 'inline_chord', pitches: event.pitches, duration: event.duration }
  }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- tests/ir/builder.test.ts
```

Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/ir/ tests/ir/
git commit -m "feat: IR types and builder"
```

---

## Task 6: Note frequencies and chord voicings

**Files:**
- Create: `src/renderer/notes.ts`
- Create: `src/renderer/chords.ts`
- Create: `tests/renderer/notes.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/renderer/notes.test.ts
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

  it('Amin at octave 3 returns A3, C4, E4 frequencies', () => {
    const freqs = chordToFrequencies('Amin', 3)
    expect(freqs[0]).toBeCloseTo(pitchToFrequency('A3'), 1)
  })

  it('G7 at default octave 4 returns 4 notes', () => {
    const freqs = chordToFrequencies('G7', 4)
    expect(freqs).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/renderer/notes.test.ts
```

Expected: `Cannot find module '../../src/renderer/notes.js'`

- [ ] **Step 3: Implement `src/renderer/notes.ts`**

```typescript
// src/renderer/notes.ts

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
```

- [ ] **Step 4: Implement `src/renderer/chords.ts`**

```typescript
// src/renderer/chords.ts
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

  const rootPitch = root + accidental  // e.g. 'C', 'F#'
  const rootNormalized = accidental === 'b'
    ? sharpEquivalent(root, accidental)
    : rootPitch
  const rootIndex = NOTE_ORDER.indexOf(rootNormalized)
  if (rootIndex === -1) throw new Error(`Unknown root: ${rootPitch}`)

  return intervals.map(interval => {
    const noteIndex = (rootIndex + interval) % 12
    const noteOctave = octave + Math.floor((rootIndex + interval) / 12)
    const noteName = NOTE_ORDER[noteIndex]
    // Convert to pitch string with octave
    const pitch = noteName.length === 2
      ? `${noteName[0]}#${noteOctave}`
      : `${noteName}${noteOctave}`
    return pitchToFrequency(pitch)
  })
}

function sharpEquivalent(note: string, accidental: string): string {
  const FLAT_TO_SHARP: Record<string, string> = {
    'Bb': 'A#', 'Eb': 'D#', 'Ab': 'G#', 'Db': 'C#', 'Gb': 'F#'
  }
  return FLAT_TO_SHARP[note + accidental] ?? note + accidental
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- tests/renderer/notes.test.ts
```

Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/renderer/notes.ts src/renderer/chords.ts tests/renderer/notes.test.ts
git commit -m "feat: note frequencies and chord voicings"
```

---

## Task 7: Renderer

**Files:**
- Create: `src/renderer/renderer.ts`
- Create: `tests/renderer/renderer.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/renderer/renderer.test.ts
import { describe, it, expect } from 'vitest'
import { render } from '../../src/renderer/renderer.js'
import { buildIR } from '../../src/ir/builder.js'
import { parseFile, mergeFiles } from '../../src/parser/parser.js'

function irFrom(...sources: [string, string][]) {
  return buildIR(mergeFiles(sources.map(([src, path]) => parseFile(src, path))))
}

describe('render', () => {
  it('returns an AudioBuffer', async () => {
    const ir = irFrom(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['track bass sine\n  |1| C4/q D4/q E4/q G4/q\n', 'bass.serce']
    )
    const buf = await render(ir)
    expect(buf.numberOfChannels).toBe(2)
    expect(buf.sampleRate).toBe(44100)
    expect(buf.length).toBeGreaterThan(0)
  })

  it('produces non-silent output for a note', async () => {
    const ir = irFrom(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['track bass sine\n  |1| A4/w\n', 'bass.serce']
    )
    const buf = await render(ir)
    const data = buf.getChannelData(0)
    const max = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(max).toBeGreaterThan(0)
  })

  it('produces silence for a rest', async () => {
    const ir = irFrom(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['track bass sine\n  |1| -/w\n', 'bass.serce']
    )
    const buf = await render(ir)
    const data = buf.getChannelData(0)
    const max = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(max).toBe(0)
  })

  it('duration matches tempo: 1 bar of 4/4 at 120bpm = 2 seconds', async () => {
    const ir = irFrom(
      ['@song x\n@author y\n@tempo 120\n', 'meta.serce'],
      ['track bass sine\n  |1| C4/w\n', 'bass.serce']
    )
    const buf = await render(ir)
    expect(buf.duration).toBeCloseTo(2.0, 1)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/renderer/renderer.test.ts
```

Expected: `Cannot find module '../../src/renderer/renderer.js'`

- [ ] **Step 3: Implement the renderer**

```typescript
// src/renderer/renderer.ts
import { OfflineAudioContext } from 'node-web-audio-api'
import { SongIR, SectionIR, TrackIR, EventIR } from '../ir/types.js'
import { pitchToFrequency } from './notes.js'
import { chordToFrequencies } from './chords.js'

const SAMPLE_RATE = 44100
const DURATION_BEATS: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 }

export async function render(ir: SongIR): Promise<AudioBuffer> {
  const beatsPerBar = parseInt(ir.meta.time.split('/')[0], 10)
  const totalDuration = calcTotalDuration(ir, beatsPerBar)
  const ctx = new OfflineAudioContext(2, Math.ceil(SAMPLE_RATE * totalDuration), SAMPLE_RATE)

  let sectionStart = 0
  for (const section of ir.sections) {
    const sectionDuration = calcSectionDuration(section, beatsPerBar)
    renderSection(ctx, section, sectionStart, beatsPerBar)
    sectionStart += sectionDuration
  }

  return ctx.startRendering()
}

function renderSection(ctx: OfflineAudioContext, section: SectionIR, startTime: number, beatsPerBar: number) {
  const barDuration = (beatsPerBar / section.tempo) * 60  // seconds per bar

  for (const track of section.tracks) {
    let barStart = startTime
    for (const bar of track.bars) {
      renderBar(ctx, bar.events, track.instrument, barStart, barDuration, beatsPerBar)
      barStart += barDuration
    }
  }
}

function renderBar(
  ctx: OfflineAudioContext,
  events: EventIR[],
  instrument: string,
  barStart: number,
  barDuration: number,
  beatsPerBar: number
) {
  const beatDuration = barDuration / beatsPerBar
  let offset = 0

  for (const event of events) {
    const beats = DURATION_BEATS[event.duration] ?? 1
    const duration = beats * beatDuration

    if (event.type === 'note') {
      playFrequency(ctx, pitchToFrequency(event.pitch), instrument, barStart + offset, duration)
    } else if (event.type === 'chord') {
      for (const freq of chordToFrequencies(event.name, event.octave)) {
        playFrequency(ctx, freq, instrument, barStart + offset, duration)
      }
    } else if (event.type === 'inline_chord') {
      for (const pitch of event.pitches) {
        playFrequency(ctx, pitchToFrequency(pitch), instrument, barStart + offset, duration)
      }
    }
    // rest: advance offset without scheduling anything

    offset += duration
  }
}

function playFrequency(
  ctx: OfflineAudioContext,
  freq: number,
  type: string,
  startTime: number,
  duration: number
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  ;(osc as any).type = type
  osc.frequency.value = freq

  // Simple amplitude envelope: fast attack, short release to avoid clicks
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.3, startTime + 0.005)
  gain.gain.setValueAtTime(0.3, startTime + duration - 0.01)
  gain.gain.linearRampToValueAtTime(0, startTime + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(startTime)
  osc.stop(startTime + duration)
}

function calcTotalDuration(ir: SongIR, beatsPerBar: number): number {
  return ir.sections.reduce((sum, s) => sum + calcSectionDuration(s, beatsPerBar), 0)
}

function calcSectionDuration(section: SectionIR, beatsPerBar: number): number {
  const barDuration = (beatsPerBar / section.tempo) * 60
  const trackLengths = section.tracks.map(t => t.bars.length * barDuration)
  return Math.max(0, ...trackLengths)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- tests/renderer/renderer.test.ts
```

Expected: all green

- [ ] **Step 5: Commit**

```bash
git add src/renderer/renderer.ts tests/renderer/renderer.test.ts
git commit -m "feat: renderer"
```

---

## Task 8: WAV exporter

**Files:**
- Create: `src/renderer/wav.ts`
- Create: `tests/renderer/wav.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/renderer/wav.test.ts
import { describe, it, expect } from 'vitest'
import { audioBufferToWav } from '../../src/renderer/wav.js'
import { render } from '../../src/renderer/renderer.js'
import { buildIR } from '../../src/ir/builder.js'
import { parseFile, mergeFiles } from '../../src/parser/parser.js'

async function renderSimple() {
  const ir = buildIR(mergeFiles([
    parseFile('@song x\n@author y\n@tempo 120\n', 'meta.serce'),
    parseFile('track bass sine\n  |1| C4/w\n', 'bass.serce'),
  ]))
  return render(ir)
}

describe('audioBufferToWav', () => {
  it('starts with RIFF header', async () => {
    const buf = await renderSimple()
    const wav = audioBufferToWav(buf)
    expect(wav.subarray(0, 4).toString()).toBe('RIFF')
  })

  it('contains WAVE marker at offset 8', async () => {
    const buf = await renderSimple()
    const wav = audioBufferToWav(buf)
    expect(wav.subarray(8, 12).toString()).toBe('WAVE')
  })

  it('has correct sample rate in header (44100 = 0x0000AC44)', async () => {
    const buf = await renderSimple()
    const wav = audioBufferToWav(buf)
    expect(wav.readUInt32LE(24)).toBe(44100)
  })

  it('total size matches buffer length', async () => {
    const buf = await renderSimple()
    const wav = audioBufferToWav(buf)
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8)
  })

  it('data section contains non-zero samples', async () => {
    const buf = await renderSimple()
    const wav = audioBufferToWav(buf)
    // samples start at offset 44
    const hasNonZero = Array.from(wav.subarray(44, 144)).some(b => b !== 0)
    expect(hasNonZero).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/renderer/wav.test.ts
```

Expected: `Cannot find module '../../src/renderer/wav.js'`

- [ ] **Step 3: Implement the WAV exporter**

```typescript
// src/renderer/wav.ts

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
  wav.writeUInt32LE(16, 16)                                        // PCM chunk size
  wav.writeUInt16LE(1, 20)                                         // PCM format
  wav.writeUInt16LE(numChannels, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28) // byte rate
  wav.writeUInt16LE(numChannels * bytesPerSample, 32)              // block align
  wav.writeUInt16LE(16, 34)                                        // bits per sample
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- tests/renderer/wav.test.ts
```

Expected: all green

- [ ] **Step 5: Commit**

```bash
git add src/renderer/wav.ts tests/renderer/wav.test.ts
git commit -m "feat: WAV exporter"
```

---

## Task 9: CLI and end-to-end

**Files:**
- Create: `src/cli/index.ts`
- Create: `tests/e2e/compile.test.ts`

- [ ] **Step 1: Write the failing end-to-end test**

```typescript
// tests/e2e/compile.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { compile, check } from '../../src/cli/index.js'

const TMP = '/tmp/serce-e2e-test'

function writeProject(files: Record<string, string>) {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(TMP, name), content)
  }
}

describe('compile', () => {
  afterAll(() => rmSync(TMP, { recursive: true, force: true }))

  it('compiles a valid project to a WAV file', async () => {
    writeProject({
      'meta.serce': '@song hello\n@author Test\n@tempo 120\n',
      'bass.serce': 'track bass sine\n  |1| C4/q D4/q E4/q G4/q\n',
    })
    await compile(TMP)
    expect(existsSync(join(TMP, 'hello.wav'))).toBe(true)
  })

  it('returns errors for an invalid project', async () => {
    writeProject({
      'bass.serce': 'track bass sine\n  |1| C4/q\n',  // missing meta.serce, bar too short
    })
    const errors = await compile(TMP)
    expect(errors.length).toBeGreaterThan(0)
  })
})

describe('check', () => {
  it('returns no errors for a valid project', async () => {
    writeProject({
      'meta.serce': '@song x\n@author y\n@tempo 90\n',
      'track.serce': 'track piano square\n  |1| E4/w\n',
    })
    const errors = await check(TMP)
    expect(errors).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/e2e/compile.test.ts
```

Expected: `Cannot find module '../../src/cli/index.js'`

- [ ] **Step 3: Implement the CLI**

```typescript
// src/cli/index.ts
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { Command } from 'commander'
import { parseFile, mergeFiles } from '../parser/parser.js'
import { validate, ValidationError } from '../validator/validator.js'
import { buildIR } from '../ir/builder.js'
import { render } from '../renderer/renderer.js'
import { audioBufferToWav } from '../renderer/wav.js'

export async function compile(dir: string): Promise<ValidationError[]> {
  const { ast, filePaths } = loadSong(dir)
  const errors = validate(ast, filePaths)
  if (errors.length) {
    printErrors(errors)
    return errors
  }

  const ir = buildIR(ast)
  const audioBuffer = await render(ir)
  const wav = audioBufferToWav(audioBuffer)
  const outPath = join(dir, `${ir.meta.song}.wav`)
  writeFileSync(outPath, wav)
  console.log(`→ ${outPath}`)
  return []
}

export async function check(dir: string): Promise<ValidationError[]> {
  const { ast, filePaths } = loadSong(dir)
  const errors = validate(ast, filePaths)
  if (errors.length) printErrors(errors)
  else console.log('✓ no errors')
  return errors
}

export async function compileIR(dir: string): Promise<ValidationError[]> {
  const { ast, filePaths } = loadSong(dir)
  const errors = validate(ast, filePaths)
  if (errors.length) { printErrors(errors); return errors }
  const ir = buildIR(ast)
  const outPath = join(dir, `${ir.meta.song}.ir.json`)
  writeFileSync(outPath, JSON.stringify(ir, null, 2))
  console.log(`→ ${outPath}`)
  return []
}

function loadSong(dir: string) {
  const filePaths = readdirSync(dir)
    .filter(f => f.endsWith('.serce'))
    .sort((a, b) => (a === 'meta.serce' ? -1 : b === 'meta.serce' ? 1 : 0))

  const fileASTs = filePaths.map(name => {
    const content = readFileSync(join(dir, name), 'utf8')
    return parseFile(content, name)
  })

  return { ast: mergeFiles(fileASTs), filePaths }
}

function printErrors(errors: ValidationError[]) {
  for (const e of errors) {
    const loc = e.line ? `${e.file}:${e.line}` : e.file || 'unknown'
    console.error(`error  ${loc.padEnd(24)} ${e.message}`)
  }
}

// CLI entry point
const program = new Command()
program
  .name('serce')
  .description('Serce music language compiler')

program
  .command('compile <dir>')
  .description('Compile .serce files in <dir> to a WAV file')
  .option('--ir', 'Emit IR JSON instead of audio')
  .action(async (dir: string, opts: { ir?: boolean }) => {
    const errors = opts.ir ? await compileIR(dir) : await compile(dir)
    if (errors.length) process.exit(1)
  })

program
  .command('check <dir>')
  .description('Validate .serce files without producing output')
  .action(async (dir: string) => {
    const errors = await check(dir)
    if (errors.length) process.exit(1)
  })

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  program.parse()
}
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all tests green

- [ ] **Step 5: Build and smoke-test manually**

```bash
npm run build

# Create a minimal test song
mkdir -p /tmp/test-song
cat > /tmp/test-song/meta.serce <<'EOF'
@song test
@author Me
@tempo 120
EOF
cat > /tmp/test-song/bass.serce <<'EOF'
track bass sine
  |1| C4/q E4/q G4/q C5/q
  |2| A3/q C4/q E4/q A4/q
EOF

node dist/cli/index.js compile /tmp/test-song
# Expected: → /tmp/test-song/test.wav
```

- [ ] **Step 6: Commit**

```bash
git add src/cli/ tests/e2e/
git commit -m "feat: CLI and end-to-end compile"
```

---

## Post-MVP follow-up plans (separate)

- **Web playground** — browser-based editor with live preview using the same IR + Web Audio API directly
- **Effects rendering** — wire up `WaveShaperNode`, `ConvolverNode`, `DelayNode` in the renderer (effects are parsed and validated but not yet applied in the renderer above)
- **Time signature enforcement** — the renderer currently hardcodes 4/4 beat math; extract `beatsPerBar` from `ir.meta.time`
