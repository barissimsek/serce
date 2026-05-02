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
