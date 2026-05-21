import { SongAST, SectionNode, TrackNode, BarNode, EventNode } from '../parser/ast.js'
import {
  SongIR, SongMeta, SectionIR, TrackIR, BarIR, EventIR
} from './types.js'

export function buildIR(ast: SongAST): SongIR {
  const get = (key: string) => ast.directives.find(d => d.key === key)?.value ?? ''
  const meta: SongMeta = {
    song:      get('song'),
    author:    get('author'),
    tempo:     parseInt(get('tempo') || '120', 10),
    time:      get('time') || '4/4',
    ...(get('published')  && { published:  get('published') }),
    ...(get('copyright')  && { copyright:  get('copyright') }),
  }

  const sectionsValue = get('sections')
  const sectionNames = sectionsValue.trim().split(/\s+/).filter(Boolean)
  const byName = new Map(ast.sections.map(s => [s.name, s]))
  for (const name of sectionNames) {
    if (!byName.has(name)) {
      console.warn(`warning  meta.serce               @sections references "${name}" but no such section was found — skipping`)
    }
  }
  const sections: SectionIR[] = sectionNames
    .filter(name => byName.has(name))
    .map(name => buildSection(byName.get(name)!, meta.tempo))
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
    instrumentParams: { ...track.instrumentParams },
    effects: track.effects.map(e => ({ type: e.type, params: { ...e.params } })),
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
    case 'slide':        return { type: 'slide', fromPitch: event.fromPitch, toPitch: event.toPitch, duration: event.duration }
  }
}
