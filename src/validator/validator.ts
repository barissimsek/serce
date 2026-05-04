// src/validator/validator.ts
import { SongAST, BarNode } from '../parser/ast.js'

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
    err('meta.serce', null, 'meta.serce is required but was not found in this directory')
  }

  // Required directives
  for (const key of ['song', 'author', 'tempo', 'sections'] as const) {
    const found = ast.directives.filter(d => d.key === key)
    if (found.length === 0) {
      err('meta.serce', null, `missing required directive @${key}`)
    } else if (found.length > 1) {
      err(found[1].filePath, found[1].line, `@${key} declared 2 times — must appear exactly once`)
    }
  }

  // Optional directives — at most once
  for (const key of ['time', 'published', 'copyright'] as const) {
    const found = ast.directives.filter(d => d.key === key)
    if (found.length > 1) {
      err(found[1].filePath, found[1].line, `@${key} declared 2 times — must appear exactly once`)
    }
  }

  // Global directives must only appear in meta.serce
  for (const directive of ast.directives) {
    if (directive.filePath !== 'meta.serce') {
      err(directive.filePath, directive.line,
        `directive @${directive.key} must be declared in meta.serce, not ${directive.filePath}`)
    }
  }

  // Parse time signature
  const timeDirValue = ast.directives.find(d => d.key === 'time')?.value ?? '4/4'
  const [beatsPerBar] = timeDirValue.split('/').map(Number)
  if (isNaN(beatsPerBar) || beatsPerBar <= 0) {
    err('meta.serce', null, `invalid @time value "${timeDirValue}" — expected format: 4/4`)
    return errors
  }

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

      // Bar numbers must be sequential starting from 1
      track.bars.forEach((bar, i) => {
        if (bar.index !== i + 1) {
          err(track.filePath, bar.line,
            `bar |${bar.index}| out of order — expected |${i + 1}|`)
        }
      })
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
