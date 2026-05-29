import { decodeString } from './string-decoder.generated.js'

export function buildContentPath({ type = 'movie', id, season, episode } = {}) {
  const contentId = String(id ?? '').trim()
  if (!contentId) throw new Error('id required')
  if (type === 'tv') {
    const s = String(season ?? '').trim()
    const e = String(episode ?? '').trim()
    if (!s || !e) throw new Error('season and episode required for tv')
    return `/tv/${contentId}/${s}/${e}`
  }
  return `/movie/${contentId}`
}

export function buildStreamPath(data) {
  const prefix = decodeString(320)
  const segment = decodeString(953)
  return `${prefix}/${segment}/${data}`.replace(/\/+/g, '/').replace(/^\//, '')
}

export function parseStreamRequest(searchParams) {
  const id = searchParams.get('id')
  if (!id) return { error: 'id required' }
  const season = searchParams.get('season')
  const episode = searchParams.get('episode')
  const explicitType = searchParams.get('type')
  const type = explicitType === 'tv' || explicitType === 'movie'
    ? explicitType
    : season != null && episode != null
      ? 'tv'
      : 'movie'
  if (type === 'tv' && (season == null || season === '' || episode == null || episode === '')) {
    return { error: 'season and episode required for tv' }
  }
  return { type, contentPath: buildContentPath({ type, id, season, episode }) }
}
