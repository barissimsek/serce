import { describe, it, expect, afterAll } from 'vitest'
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
      'meta.serce': '@song hello\n@author Test\n@tempo 120\n@sections default\n',
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
      'meta.serce': '@song x\n@author y\n@tempo 90\n@sections default\n',
      'track.serce': 'track keys square\n  |1| E4/w\n',
    })
    const errors = await check(TMP)
    expect(errors).toHaveLength(0)
  })
})
