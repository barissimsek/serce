import { OfflineAudioContext } from 'node-web-audio-api'
import { SongIR, SectionIR, EventIR, Instrument } from '../ir/types.js'
import { pitchToFrequency } from './notes.js'
import { chordToFrequencies } from './chords.js'
import { buildEffectChain } from './effects.js'

const SAMPLE_RATE = 44100
const DURATION_BEATS: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 }

export async function render(ir: SongIR, onSection?: (name: string) => void): Promise<AudioBuffer> {
  const beatsPerBar = parseInt(ir.meta.time.split('/')[0], 10)
  const totalDuration = calcTotalDuration(ir, beatsPerBar)
  const ctx = new OfflineAudioContext(2, Math.ceil(SAMPLE_RATE * totalDuration), SAMPLE_RATE)

  let sectionStart = 0
  for (const section of ir.sections) {
    onSection?.(section.name)
    const sectionDuration = calcSectionDuration(section, beatsPerBar)
    renderSection(ctx, section, sectionStart, beatsPerBar)
    sectionStart += sectionDuration
  }

  return ctx.startRendering()
}

export function sectionStartTimes(ir: SongIR): Array<{ name: string; startSeconds: number }> {
  const beatsPerBar = parseInt(ir.meta.time.split('/')[0], 10)
  const result: Array<{ name: string; startSeconds: number }> = []
  let t = 0
  for (const section of ir.sections) {
    result.push({ name: section.name, startSeconds: t })
    t += calcSectionDuration(section, beatsPerBar)
  }
  return result
}

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

function calcTotalDuration(ir: SongIR, beatsPerBar: number): number {
  return ir.sections.reduce((sum, s) => sum + calcSectionDuration(s, beatsPerBar), 0)
}

function calcSectionDuration(section: SectionIR, beatsPerBar: number): number {
  const barDuration = (beatsPerBar / section.tempo) * 60
  const trackLengths = section.tracks.map(t => t.bars.length * barDuration)
  return Math.max(0, ...trackLengths)
}
