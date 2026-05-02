# Effects Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `distortion`, `reverb`, and `delay` effects from the Song IR into the Web Audio node graph so they are applied during rendering.

**Architecture:** A new `effects.ts` module exports `buildEffectChain(ctx, effects)` which builds a per-track Web Audio node chain and returns the entry `GainNode`. `renderer.ts` calls it once per track and passes the returned node down as `destination` instead of using `ctx.destination` directly.

**Tech Stack:** TypeScript, `node-web-audio-api` (Web Audio API), Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/renderer/effects.ts` | Create | Effect node builders + `buildEffectChain` |
| `src/renderer/renderer.ts` | Modify | Thread `destination` node through render pipeline |
| `tests/renderer/effects.test.ts` | Create | Unit + integration tests for all effects |

---

### Task 1: `buildEffectChain` skeleton and empty-chain test

**Files:**
- Create: `src/renderer/effects.ts`
- Create: `tests/renderer/effects.test.ts`

- [ ] **Step 1: Create `src/renderer/effects.ts` skeleton**

```ts
import { OfflineAudioContext } from 'node-web-audio-api'
import { EffectIR } from '../ir/types.js'

interface EffectChain {
  input: AudioNode
  output: AudioNode
}

export function buildEffectChain(ctx: OfflineAudioContext, effects: EffectIR[]): GainNode {
  const trackInputGain = ctx.createGain()

  let current: AudioNode = trackInputGain
  for (const fx of effects) {
    const chain = connectEffect(ctx, fx)
    current.connect(chain.input)
    current = chain.output
  }
  current.connect(ctx.destination)

  return trackInputGain
}

function connectEffect(_ctx: OfflineAudioContext, fx: EffectIR): EffectChain {
  throw new Error(`Effect not yet implemented: ${fx.type}`)
}
```

- [ ] **Step 2: Create `tests/renderer/effects.test.ts` with the empty-chain test**

```ts
import { describe, it, expect } from 'vitest'
import { OfflineAudioContext } from 'node-web-audio-api'
import { buildEffectChain } from '../../src/renderer/effects.js'

describe('buildEffectChain', () => {
  it('with empty effects array, passes signal through to destination', async () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100)
    const entry = buildEffectChain(ctx, [])
    const osc = ctx.createOscillator()
    osc.frequency.value = 440
    osc.connect(entry)
    osc.start(0)
    osc.stop(0.5)
    const buf = await ctx.startRendering()
    const samples = buf.getChannelData(0)
    const max = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(max).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run the test and verify it passes**

```
npx vitest run tests/renderer/effects.test.ts
```

Expected: `✓ buildEffectChain > with empty effects array, passes signal through to destination`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/effects.ts tests/renderer/effects.test.ts
git commit -m "feat: add effects.ts skeleton with buildEffectChain"
```

---

### Task 2: `distortion` builder

**Files:**
- Modify: `src/renderer/effects.ts`
- Modify: `tests/renderer/effects.test.ts`

- [ ] **Step 1: Add the failing test to `tests/renderer/effects.test.ts`**

Add this import at the top of the file (replace the existing import line):

```ts
import { buildEffectChain, buildDistortion } from '../../src/renderer/effects.js'
```

Add this describe block after the existing one:

```ts
describe('buildDistortion', () => {
  it('sets WaveShaperNode curve of length 256', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const node = buildDistortion(ctx, { amount: 0.8 })
    expect(node.curve).not.toBeNull()
    expect(node.curve!.length).toBe(256)
  })

  it('uses default amount 0.5 when param is omitted', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const node = buildDistortion(ctx, {})
    expect(node.curve).not.toBeNull()
    expect(node.curve!.length).toBe(256)
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```
npx vitest run tests/renderer/effects.test.ts
```

Expected: FAIL — `buildDistortion is not a function` (not yet exported)

- [ ] **Step 3: Implement `buildDistortion` in `src/renderer/effects.ts`**

Add this exported function before `connectEffect`:

```ts
export function buildDistortion(ctx: OfflineAudioContext, params: Record<string, number>): WaveShaperNode {
  const amount = params.amount ?? 0.5
  const samples = 256
  const curve = new Float32Array(samples)
  const k = amount * 100
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x))
  }
  const ws = ctx.createWaveShaper()
  ws.curve = curve
  return ws
}
```

Replace `connectEffect` with:

```ts
function connectEffect(ctx: OfflineAudioContext, fx: EffectIR): EffectChain {
  if (fx.type === 'distortion') {
    const node = buildDistortion(ctx, fx.params)
    return { input: node, output: node }
  }
  throw new Error(`Effect not yet implemented: ${fx.type}`)
}
```

- [ ] **Step 4: Run and verify it passes**

```
npx vitest run tests/renderer/effects.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/effects.ts tests/renderer/effects.test.ts
git commit -m "feat: implement distortion effect builder"
```

---

### Task 3: `reverb` builder

**Files:**
- Modify: `src/renderer/effects.ts`
- Modify: `tests/renderer/effects.test.ts`

- [ ] **Step 1: Add the failing test**

Update the import at the top of `tests/renderer/effects.test.ts`:

```ts
import { buildEffectChain, buildDistortion, buildReverb } from '../../src/renderer/effects.js'
```

Add after the `buildDistortion` describe block:

```ts
describe('buildReverb', () => {
  it('sets ConvolverNode buffer length from decay param', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const node = buildReverb(ctx, { decay: 2.0 })
    expect(node.buffer).not.toBeNull()
    expect(node.buffer!.length).toBe(Math.ceil(2.0 * 44100))
  })

  it('uses default decay 1.5 when param is omitted', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const node = buildReverb(ctx, {})
    expect(node.buffer!.length).toBe(Math.ceil(1.5 * 44100))
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```
npx vitest run tests/renderer/effects.test.ts
```

Expected: FAIL — `buildReverb is not a function`

- [ ] **Step 3: Implement `buildReverb` in `src/renderer/effects.ts`**

Add this constant at the top of the file (after the import lines):

```ts
const SAMPLE_RATE = 44100
```

Add this exported function after `buildDistortion`:

```ts
export function buildReverb(ctx: OfflineAudioContext, params: Record<string, number>): ConvolverNode {
  const decay = params.decay ?? 1.5
  const length = Math.ceil(decay * SAMPLE_RATE)
  const ir = ctx.createBuffer(2, length, SAMPLE_RATE)
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t / decay)
    }
  }
  const convolver = ctx.createConvolver()
  convolver.buffer = ir
  return convolver
}
```

Update `connectEffect` to handle `reverb`:

```ts
function connectEffect(ctx: OfflineAudioContext, fx: EffectIR): EffectChain {
  if (fx.type === 'distortion') {
    const node = buildDistortion(ctx, fx.params)
    return { input: node, output: node }
  }
  if (fx.type === 'reverb') {
    const node = buildReverb(ctx, fx.params)
    return { input: node, output: node }
  }
  throw new Error(`Effect not yet implemented: ${fx.type}`)
}
```

- [ ] **Step 4: Run and verify it passes**

```
npx vitest run tests/renderer/effects.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/effects.ts tests/renderer/effects.test.ts
git commit -m "feat: implement reverb effect builder with algorithmic IR"
```

---

### Task 4: `delay` builder

**Files:**
- Modify: `src/renderer/effects.ts`
- Modify: `tests/renderer/effects.test.ts`

- [ ] **Step 1: Add the failing test**

Update the import at the top of `tests/renderer/effects.test.ts`:

```ts
import { buildEffectChain, buildDistortion, buildReverb, buildDelay } from '../../src/renderer/effects.js'
```

Add after the `buildReverb` describe block:

```ts
describe('buildDelay', () => {
  it('sets DelayNode delayTime from time param', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const { delayNode } = buildDelay(ctx, { time: 0.75, feedback: 0.5 })
    expect(delayNode.delayTime.value).toBeCloseTo(0.75)
  })

  it('uses default time 0.3 when param is omitted', () => {
    const ctx = new OfflineAudioContext(1, 100, 44100)
    const { delayNode } = buildDelay(ctx, {})
    expect(delayNode.delayTime.value).toBeCloseTo(0.3)
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```
npx vitest run tests/renderer/effects.test.ts
```

Expected: FAIL — `buildDelay is not a function`

- [ ] **Step 3: Implement `buildDelay` in `src/renderer/effects.ts`**

Add this interface and exported function after `buildReverb`:

```ts
export interface DelayChain {
  input: GainNode
  output: GainNode
  delayNode: DelayNode
}

export function buildDelay(ctx: OfflineAudioContext, params: Record<string, number>): DelayChain {
  const time = params.time ?? 0.3
  const feedback = params.feedback ?? 0.4

  const input = ctx.createGain()
  const delayNode = ctx.createDelay(2.0)
  const feedbackGain = ctx.createGain()
  const dryGain = ctx.createGain()
  const output = ctx.createGain()

  delayNode.delayTime.value = time
  feedbackGain.gain.value = feedback

  // Dry path: input → dryGain → output
  input.connect(dryGain)
  dryGain.connect(output)

  // Wet path: input → delayNode → output
  input.connect(delayNode)
  delayNode.connect(output)

  // Feedback loop: delayNode → feedbackGain → delayNode
  delayNode.connect(feedbackGain)
  feedbackGain.connect(delayNode)

  return { input, output, delayNode }
}
```

Update `connectEffect` to handle `delay`:

```ts
function connectEffect(ctx: OfflineAudioContext, fx: EffectIR): EffectChain {
  if (fx.type === 'distortion') {
    const node = buildDistortion(ctx, fx.params)
    return { input: node, output: node }
  }
  if (fx.type === 'reverb') {
    const node = buildReverb(ctx, fx.params)
    return { input: node, output: node }
  }
  if (fx.type === 'delay') {
    const { input, output } = buildDelay(ctx, fx.params)
    return { input, output }
  }
  throw new Error(`Unsupported effect: ${fx.type}`)
}
```

- [ ] **Step 4: Run and verify it passes**

```
npx vitest run tests/renderer/effects.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/effects.ts tests/renderer/effects.test.ts
git commit -m "feat: implement delay effect builder with feedback loop"
```

---

### Task 5: Multi-effect chain integration test

**Files:**
- Modify: `tests/renderer/effects.test.ts`

- [ ] **Step 1: Add the two-effect chain test**

First, add the `EffectIR` type import at the top of `tests/renderer/effects.test.ts` alongside the existing imports:

```ts
import type { EffectIR } from '../../src/ir/types.js'
```

Then add this test inside the existing `describe('buildEffectChain', () => { ... })` block, after the empty-array test:

```ts
  it('with two chained effects, passes signal through to destination', async () => {
    const ctx = new OfflineAudioContext(2, 44100 * 4, 44100)
    const effects: EffectIR[] = [
      { type: 'distortion', params: { amount: 0.5 } },
      { type: 'reverb',     params: { decay: 1.0 } },
    ]
    const entry = buildEffectChain(ctx, effects)
    const osc = ctx.createOscillator()
    osc.frequency.value = 440
    osc.connect(entry)
    osc.start(0)
    osc.stop(0.1)
    const buf = await ctx.startRendering()
    const samples = buf.getChannelData(0)
    const max = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(max).toBeGreaterThan(0)
  })
```

- [ ] **Step 2: Run and verify it passes**

```
npx vitest run tests/renderer/effects.test.ts
```

Expected: all tests pass (chain logic was already correct from Task 1)

- [ ] **Step 3: Commit**

```bash
git add tests/renderer/effects.test.ts
git commit -m "test: add multi-effect chain integration test"
```

---

### Task 6: Wire `effects.ts` into `renderer.ts`

**Files:**
- Modify: `src/renderer/renderer.ts:1-5` (imports)
- Modify: `src/renderer/renderer.ts:24-34` (`renderSection`)
- Modify: `src/renderer/renderer.ts:36-66` (`renderBar` and `playFrequency`)

- [ ] **Step 1: Add the import to `src/renderer/renderer.ts`**

Add `buildEffectChain` to the import block at the top of the file. The top of the file currently reads:

```ts
import { OfflineAudioContext } from 'node-web-audio-api'
import { SongIR, SectionIR, EventIR, Instrument } from '../ir/types.js'
import { pitchToFrequency } from './notes.js'
import { chordToFrequencies } from './chords.js'
```

Add one line:

```ts
import { OfflineAudioContext } from 'node-web-audio-api'
import { SongIR, SectionIR, EventIR, Instrument } from '../ir/types.js'
import { pitchToFrequency } from './notes.js'
import { chordToFrequencies } from './chords.js'
import { buildEffectChain } from './effects.js'
```

- [ ] **Step 2: Update `renderSection` to build effect chain per track**

Replace the `renderSection` function body:

```ts
function renderSection(ctx: OfflineAudioContext, section: SectionIR, startTime: number, beatsPerBar: number) {
  const barDuration = (beatsPerBar / section.tempo) * 60  // seconds per bar

  for (const track of section.tracks) {
    const destination = buildEffectChain(ctx, track.effects)
    let barStart = startTime
    for (const bar of track.bars) {
      renderBar(ctx, bar.events, track.instrument, barStart, barDuration, beatsPerBar, destination)
      barStart += barDuration
    }
  }
}
```

- [ ] **Step 3: Update `renderBar` to accept and thread `destination`**

Replace the `renderBar` function:

```ts
function renderBar(
  ctx: OfflineAudioContext,
  events: EventIR[],
  instrument: Instrument,
  barStart: number,
  barDuration: number,
  beatsPerBar: number,
  destination: AudioNode
) {
  const beatDuration = barDuration / beatsPerBar
  let offset = 0

  for (const event of events) {
    const beats = DURATION_BEATS[event.duration] ?? 1
    const duration = beats * beatDuration

    if (event.type === 'note') {
      playFrequency(ctx, pitchToFrequency(event.pitch), instrument, barStart + offset, duration, destination)
    } else if (event.type === 'chord') {
      for (const freq of chordToFrequencies(event.name, event.octave)) {
        playFrequency(ctx, freq, instrument, barStart + offset, duration, destination)
      }
    } else if (event.type === 'inline_chord') {
      for (const pitch of event.pitches) {
        playFrequency(ctx, pitchToFrequency(pitch), instrument, barStart + offset, duration, destination)
      }
    }
    // rest: advance offset without scheduling anything

    offset += duration
  }
}
```

- [ ] **Step 4: Update `playFrequency` to accept and use `destination`**

Replace the `playFrequency` function:

```ts
function playFrequency(
  ctx: OfflineAudioContext,
  freq: number,
  instrument: Instrument,
  startTime: number,
  duration: number,
  destination: AudioNode
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = instrument
  osc.frequency.value = freq

  // Simple amplitude envelope: fast attack, short release to avoid clicks
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.3, startTime + 0.005)
  gain.gain.setValueAtTime(0.3, startTime + duration - 0.01)
  gain.gain.linearRampToValueAtTime(0, startTime + duration)

  osc.connect(gain)
  gain.connect(destination)

  osc.start(startTime)
  osc.stop(startTime + duration)
}
```

- [ ] **Step 5: Run the full test suite to verify no regressions**

```
npx vitest run
```

Expected: all tests in `tests/renderer/effects.test.ts`, `tests/renderer/renderer.test.ts`, and all other test files pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer/renderer.ts
git commit -m "feat: wire effect chain into renderer — distortion, reverb, delay now applied"
```
