# Effects Rendering — Design Spec

**Date:** 2026-05-01
**Scope:** Implement `distortion`, `reverb`, and `delay` effects in the renderer (v2).

---

## Background

Effects are already fully parsed and stored in the Song IR. A `.serce` track declares effects like:

```
track guitar sawtooth
  effect distortion amount:0.8
  effect reverb decay:2.0
  effect delay time:0.3 feedback:0.4
  |1| E4/q E4/q G4/h
```

The IR carries this as:

```json
"effects": [
  { "type": "distortion", "params": { "amount": 0.8 } },
  { "type": "reverb",     "params": { "decay": 2.0  } },
  { "type": "delay",      "params": { "time": 0.3, "feedback": 0.4 } }
]
```

No language or parser changes are required. The work is entirely in the renderer.

---

## Architecture

### Signal chain (per track)

```
note GainNodes (N) → trackInputGain → [WaveShaperNode?] → [ConvolverNode?] → [Delay+Feedback?] → ctx.destination
```

Effects chain in declaration order. A track with no effects connects `trackInputGain` directly to `ctx.destination`.

### New module: `src/renderer/effects.ts`

Exports one function:

```ts
buildEffectChain(ctx: OfflineAudioContext, effects: EffectIR[]): GainNode
```

- Creates a `trackInputGain` node as the chain entry point
- Iterates `effects`, creates each effect node, connects previous → current
- Connects the last node to `ctx.destination`
- Returns `trackInputGain`

Internal loop:

```ts
let current: AudioNode = trackInputGain
for (const fx of effects) {
  const node = buildEffect(ctx, fx)
  current.connect(node)
  current = node
}
current.connect(ctx.destination)
return trackInputGain
```

### Changes to `renderer.ts`

Three targeted edits only:

1. **`renderSection`** — call `buildEffectChain(ctx, track.effects)` once per track, pass the returned node to `renderBar`
2. **`renderBar`** — add `destination: AudioNode` parameter, thread to `playFrequency`
3. **`playFrequency`** — add `destination: AudioNode` parameter, replace `gain.connect(ctx.destination)` with `gain.connect(destination)`

---

## Effect Implementations

### `distortion` — `WaveShaperNode`

- Parameter: `amount` 0.0–1.0, default `0.5`
- Generates a sigmoid distortion curve over 256 samples:
  ```ts
  const k = amount * 100
  curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x))
  ```
- Higher `amount` = harder clipping
- The `WaveShaperNode` serves as both input and output node

### `reverb` — `ConvolverNode` with algorithmic IR

- Parameter: `decay` 0.0–10.0s, default `1.5`
- Generates a stereo IR buffer of length `decay * 44100` samples:
  ```ts
  sample = (Math.random() * 2 - 1) * Math.exp(-t / decay)
  ```
- White noise × exponential decay envelope approximates a natural room response
- The `ConvolverNode` serves as both input and output node

### `delay` — `DelayNode` + feedback loop + dry blend

- Parameters: `time` 0.0–2.0s (default `0.3`), `feedback` 0.0–1.0 (default `0.4`)
- Three nodes: `DelayNode`, `feedbackGain`, `dryGain`
- Signal splits at the entry point:

```
entry → dryGain  ─────────────────────────┐
entry → delayNode → feedbackGain → delayNode (feedback loop)
entry → delayNode ────────────────────────┤
                                          ↓
                                      outputGain (GainNode)
```

- `dryGain` ensures the original signal passes through alongside the delayed echoes
- `outputGain` is the single output node that both `dryGain` and `delayNode` connect to, and that connects to the next node in the chain

---

## File Layout

```
src/
  renderer/
    effects.ts    ← new
    renderer.ts   ← minor edits (3 signature changes)
    notes.ts      ← unchanged
    chords.ts     ← unchanged
    wav.ts        ← unchanged
tests/
  renderer/
    effects.test.ts   ← new
    renderer.test.ts  ← unchanged
```

---

## Testing

New `tests/renderer/effects.test.ts`:

| Test | Assertion |
|------|-----------|
| `distortion` builder | `WaveShaperNode` curve is set with correct length (256) |
| `reverb` builder | `ConvolverNode` buffer length equals `decay * 44100` |
| `delay` builder | `DelayNode.delayTime.value` equals `time` param |
| `buildEffectChain([])` | Returns a `GainNode`, no effect nodes created |
| `buildEffectChain` with 2 effects | Nodes chained in declaration order |

---

## Out of Scope

- `chorus` effect (deferred to a future pass)
- Dry/wet mix ratio controls per effect
- Effect parameter automation
- Any changes to the lexer, parser, validator, or IR
