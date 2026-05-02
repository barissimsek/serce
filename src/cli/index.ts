#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
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
  let audioBuffer: Awaited<ReturnType<typeof render>>
  try {
    audioBuffer = await render(ir)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    printErrors([{ file: 'renderer', line: null, message }])
    return [{ file: 'renderer', line: null, message }]
  }
  const wav = audioBufferToWav(audioBuffer)
  const outPath = join(dir, `${ir.meta.song}.wav`)
  writeFileSync(outPath, wav)
  console.log(`→ ${outPath}`)
  return []
}

export async function run(dir: string): Promise<ValidationError[]> {
  const { ast, filePaths } = loadSong(dir)
  const errors = validate(ast, filePaths)
  if (errors.length) {
    printErrors(errors)
    return errors
  }

  const ir = buildIR(ast)
  let audioBuffer: Awaited<ReturnType<typeof render>>
  try {
    audioBuffer = await render(ir)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    printErrors([{ file: 'renderer', line: null, message }])
    return [{ file: 'renderer', line: null, message }]
  }
  const wav = audioBufferToWav(audioBuffer)
  const tmpPath = join(tmpdir(), `${ir.meta.song}.wav`)
  writeFileSync(tmpPath, wav)

  const cleanup = () => { try { unlinkSync(tmpPath) } catch {} }
  process.once('SIGINT', () => { cleanup(); process.exit(130) })

  console.log(`♪ playing ${ir.meta.song}`)
  try {
    playWav(tmpPath)
  } finally {
    cleanup()
    process.removeAllListeners('SIGINT')
  }
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
  if (errors.length) {
    printErrors(errors)
    return errors
  }
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

function playWav(path: string): void {
  switch (process.platform) {
    case 'darwin': execFileSync('afplay', [path]); break
    case 'linux':  execFileSync('aplay', [path]); break
    case 'win32':  execFileSync('powershell', ['-c', `(New-Object Media.SoundPlayer '${path}').PlaySync()`]); break
    default: throw new Error(`No audio player available for platform: ${process.platform}`)
  }
}

function printErrors(errors: ValidationError[]) {
  for (const e of errors) {
    const loc = e.line ? `${e.file}:${e.line}` : e.file || 'unknown'
    console.error(`error  ${loc.padEnd(24)} ${e.message}`)
  }
}

// Guard: commander reads process.argv and calls process.exit on --help / errors,
// so only parse when this module is the process entry point.
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
  .command('run <dir>')
  .description('Compile and play .serce files in <dir>')
  .action(async (dir: string) => {
    const errors = await run(dir)
    if (errors.length) process.exit(1)
  })

program
  .command('check <dir>')
  .description('Validate .serce files without producing output')
  .action(async (dir: string) => {
    const errors = await check(dir)
    if (errors.length) process.exit(1)
  })

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  program.parse()
}
