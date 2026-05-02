import { SongAST, SectionNode, TrackNode, BarNode, EventNode } from '../parser/ast.js'
import {
  SongIR, SongMeta, SectionIR, TrackIR, EffectIR, BarIR, EventIR
} from './types.js'

export function buildIR(ast: SongAST): SongIR {
  const get = (key: string) => ast.directives.find(d => d.key === key)?.value ?? ''
  const meta: SongMeta = {
    song:   get('song'),
    author: get('author'),
    tempo:  parseInt(get('tempo') || '120', 10),
    time:   get('time') || '4/4',
  }

  const sections: SectionIR[] = ast.sections.map(s => buildSection(s, meta.tempo))
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
  }
}
