# Serce Music Language — Design Spec

**Date:** 2026-05-01

## Overview

Serce is a text-based music composition language with a compiler. Musicians write `.serce` files describing tracks, bars, notes, and effects; the compiler produces a `.wav` audio file. The language is designed for musicians, not programmers — syntax is minimal and visually familiar.

---

## 1. Language Syntax

### File extension
`.serce`

### Directives
Directives begin with `@`. All global directives must live in `meta.serce` — the single required manifest file in every song directory. Declaring a global directive in any other file is a compile error. `meta.serce` must not contain track or section declarations — it is metadata only.

```
@song   my_song       ← required
@author John Doe      ← required
@tempo  120           ← required, beats per minute
@time   4/4           ← optional, defaults to 4/4
```

Each required directive must appear exactly once. Declaring the same directive twice is a compile error.

### Project structure
```
my_song/
  meta.serce          ← required manifest
  bass.serce
  melody.serce
  ...
```

One song per directory. `serce compile .` gathers all `.serce` files in the directory and compiles them into `<song_name>.wav`.

### Tracks and bars

Tracks are declared with `track <name> <instrument>`. Bars are indented under their track. Indentation (2 spaces) defines scope — a new `track` or `section` keyword ends the previous block.

```
track bass sine
  |1| C2/q D2/q E2/q G2/q
  |2| G2/h -/q C3/q
```

Bar numbers are written as `|n|`. They must be sequential starting from 1 per track per section. Numbering resets to `|1|` for every track in every section. Gaps are a compile error.

### Notes

Format: `<letter><accidental?><octave>/<duration>`

- Letter: `A`–`G` (uppercase)
- Accidental: `#` (sharp) or `b` (flat), optional
- Octave: integer (middle C is `C4`)
- Duration: `/w` whole · `/h` half · `/q` quarter · `/e` eighth · `/s` sixteenth

Examples: `C4/q` `F#3/h` `Bb4/e`

### Rests

A rest is written as `-/<duration>`, e.g. `-/q` for a quarter rest.

### Chords

Chords are first-class citizens. The lexer distinguishes a chord token from a note by the quality suffix that follows the root — not by letter case (both notes and chords start with an uppercase A–G).

Format: `<Root><accidental?><quality><octave?>/<duration>`

- Root: `A`–`G` (uppercase, required)
- Accidental: `#` or `b`, optional
- Quality: `maj` · `min` · `7` · `maj7` · `min7` · `dim` · `aug` · `sus2` · `sus4`
- Octave: integer, defaults to `4`
- Duration: same as notes

Examples: `Cmaj/h` `Amin4/q` `G7/e` `G73/h` `Cmaj73/w` `Bdim/q`

**Octave parsing:** The octave digit is optional for all quality types. When a quality ends in a digit (`7`, `maj7`, `min7`), the lexer always matches the quality greedily before the octave digit — `G73/h` is parsed as G7 quality at octave 3, not ambiguously. `Cmaj73/w` is Cmaj7 quality at octave 3.

**Built-in chord voicings (intervals from root):**

| Quality | Intervals       |
|---------|-----------------|
| maj     | 1  3  5         |
| min     | 1  b3 5         |
| 7       | 1  3  5  b7     |
| maj7    | 1  3  5  7      |
| min7    | 1  b3 5  b7     |
| dim     | 1  b3 b5        |
| aug     | 1  3  #5        |
| sus2    | 1  2  5         |
| sus4    | 1  4  5         |

12 roots × 9 qualities = 108 named chords. Tokens that don't match a recognised chord pattern are not classified as chords by the lexer.

Inline chord fallback syntax (for custom voicings): `[C4 E4 G4]/h`

### Sections

Sections group tracks and play sequentially. A section may override global tempo.

```
section intro @tempo 90
  track bass sine
    |1| C2/q D2/q E2/q G2/q

  track melody square
    |1| E4/h G4/h

section verse
  track bass sine
    |1| F2/q G2/q A2/q C3/q
```

Track names inside a section are scoped to that section — a `bass` track in `intro` and a `bass` track in `verse` do not conflict.

Top-level tracks (outside any section) belong to an implicit default section named `"default"` in the IR.

### Effects

Effects are declared on a track, before its bars. They chain in declaration order.

```
track guitar sawtooth
  effect distortion amount:0.8
  effect reverb decay:2.0
  |1| E4/q E4/q G4/h
```

**Built-in effects:**

| Effect     | Parameters                          | Web Audio node  |
|------------|-------------------------------------|-----------------|
| distortion | `amount` 0.0–1.0 (default 0.5)      | WaveShaperNode  |
| reverb     | `decay` 0.0–10.0s (default 1.5)     | ConvolverNode   |
| delay      | `time` 0.0–2.0s · `feedback` 0.0–1.0| DelayNode      |
| chorus     | `rate` 0.1–10.0Hz · `depth` 0.0–1.0 | OscillatorNode + DelayNode |

All parameters are optional and fall back to defaults. Effects are parsed and stored in the IR but are not yet applied by the v1 renderer — audio output is dry.

---

## 2. Compiler Architecture

### Two-phase pipeline

```
.serce files → Lexer → Parser → Validator → Song IR (JSON) → Renderer → .wav
```

The Song IR is the architectural boundary. Phase 1 is language parsing; Phase 2 is audio synthesis.

### Phase 1 — Parse & Validate

- **Lexer:** tokenises each `.serce` file into a flat token stream
- **Parser:** builds an AST per file, then merges all files into one song AST
- **Validator:** runs cross-file checks after merge:
  - `meta.serce` exists
  - `@song`, `@author`, `@tempo` each declared exactly once (across all files)
  - All directives live in `meta.serce`
  - No duplicate track names at the same scope level
  - Bar numbers are sequential starting from 1 per track per section
  - Bar durations sum to the declared time signature
  - All errors collected before exiting (no stop-on-first-error)

### Song IR schema

```json
{
  "meta": {
    "song": "my_song",
    "author": "John Doe",
    "tempo": 120,
    "time": "4/4"
  },
  "sections": [
    {
      "name": "intro",
      "tempo": 90,
      "tracks": [
        {
          "name": "bass",
          "instrument": "sine",
          "effects": [
            { "type": "distortion", "params": { "amount": 0.8 } }
          ],
          "bars": [
            {
              "index": 1,
              "events": [
                { "type": "note",  "pitch": "C2",  "duration": "q" },
                { "type": "chord", "name": "Cmaj", "octave": 4, "duration": "h" },
                { "type": "rest",                  "duration": "q" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

`serce compile . --ir` emits the IR as `<song_name>.ir.json` without producing audio.

### Phase 2 — Render

- **CLI renderer:** `node-web-audio-api` → `OfflineAudioContext` → PCM buffer → WAV file

Sections play sequentially. Tracks within a section play in parallel. Each track: `OscillatorNode` (instrument) → `GainNode` (amplitude envelope) → destination.

### Project layout

```
serce/
  src/
    lexer/       token definitions + tokeniser
    parser/      AST types + recursive descent parser
    validator/   cross-file validation rules
    ir/          AST → Song IR transform + IR type definitions
    renderer/    IR → Web Audio API (shared core)
    cli/         Node.js entry point (node-web-audio-api, WAV export)
  tests/
```

---

## 3. Audio Output

### WAV specification

| Property    | Value         |
|-------------|---------------|
| Sample rate | 44,100 Hz     |
| Bit depth   | 16-bit PCM    |
| Channels    | Stereo (L and R carry identical signal; panning is a future addition) |
| Filename    | `<@song>.wav` |

### Built-in instruments

| Name      | Character          | Web Audio type |
|-----------|--------------------|----------------|
| sine      | Smooth, pure       | sine           |
| square    | Buzzy, retro       | square         |
| sawtooth  | Bright, string-like| sawtooth       |
| triangle  | Soft, flute-like   | triangle       |

Sampled instruments (piano, guitar, drums) are a future addition.

---

## 4. CLI Interface

```
serce compile <dir>          → <song_name>.wav
serce compile <dir> --ir     → <song_name>.ir.json  (skip audio rendering)
serce run <dir>              → compile and play immediately (no file written)
serce check <dir>            → validate only, no output
```

`serce run` renders the song to a temporary WAV file, plays it via the system audio player (`afplay` on macOS, `aplay` on Linux, PowerShell on Windows), then deletes the temp file. Ctrl+C stops playback and also cleans up the temp file.

**Running from source:**
```bash
npm run build
node dist/cli/index.js compile /path/to/song
node dist/cli/index.js run /path/to/song
```

---

## 5. Error Format

```
error  meta.serce               missing required directive @author
error  bass.serce:7             bar |3| duration is 3 beats, expected 4
error  melody.serce:2           track name "bass" already declared in bass.serce:1
error  bass.serce:4             bar |2| out of order — expected |1|
error  meta.serce               @tempo declared 2 times — must appear exactly once
```

Format: `error  <file>:<line>  <message>`. All errors are reported before exiting.

---

## 6. Out of Scope (v1)

- Effect rendering (effects are parsed and stored in IR, but not applied to audio)
- Sampled/realistic instruments
- MIDI output
- Panning / stereo positioning
- Tempo automation (gradual BPM changes within a bar)
- Custom chord definitions
- Imports between song directories
- Web / browser renderer
- VS Code extension / language server
