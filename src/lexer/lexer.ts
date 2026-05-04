import { Token, TokenKind, INSTRUMENTS, EFFECT_TYPES, KEYWORDS, DURATIONS } from './tokens.js'

const NOTE_RE   = /^[A-G][#b]?\d\/[whqes]$/
const CHORD_RE  = /^[A-G][#b]?(maj7|min7|maj|min|dim|aug|sus2|sus4|7)\d?\/[whqes]$/
const REST_RE   = /^-\/([whqes])$/
const PITCH_RE  = /^[A-G][#b]?\d$/   // pitch only, no duration — used inside [...]
const PARAM_RE  = /^\w+:-?\d+(\.\d+)?$/
const BAR_RE    = /^\|(\d+)\|$/

function classifyWord(word: string, insideBracket: boolean): TokenKind {
  if (insideBracket && PITCH_RE.test(word)) return 'NOTE_PITCH'
  if (REST_RE.test(word)) return 'REST'
  if (CHORD_RE.test(word)) return 'CHORD'   // must come before NOTE_RE
  if (NOTE_RE.test(word)) return 'NOTE'
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
      const spaceIdx = line.indexOf(' ')
      if (spaceIdx === -1) {
        tokens.push(tok('DIRECTIVE', line.slice(1)))
        continue
      }
      const keyword = line.slice(1, spaceIdx)
      const rest = line.slice(spaceIdx + 1).trim()
      tokens.push(tok('DIRECTIVE', keyword))
      tokens.push(tok('VALUE', rest))
      continue
    }

    // Section line may contain @tempo mid-line: "section intro @tempo 90"
    // Handle by splitting on @tempo
    const atTempoIdx = line.indexOf(' @tempo ')
    if (line.startsWith('section') && atTempoIdx !== -1) {
      const before = line.slice(0, atTempoIdx).trim()
      const after  = line.slice(atTempoIdx + ' @tempo '.length).trim().split(/\s+/)[0]
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
