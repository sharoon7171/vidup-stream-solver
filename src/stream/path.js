import { decodeString } from '../../vendor/extracts/decoder.js'

export function buildContentPath({ type = 'movie', id, season, episode } = {}) {
  const contentId = String(id ?? '').trim()
  if (!contentId) throw new Error('id required')
  if (type === 'tv') {
    const s = String(season ?? '').trim(), e = String(episode ?? '').trim()
    if (!s || !e) throw new Error('season and episode required for tv')
    return `/tv/${contentId}/${s}/${e}`
  }
  return `/movie/${contentId}`
}

export function buildStreamPath(data) {
  return `${decodeString(320)}/${decodeString(953)}/${data}`.replace(/\/+/g, '/').replace(/^\//, '')
}

export function parseStreamRequest(searchParams) {
  const id = searchParams.get('id')
  if (!id) return { error: 'id required' }
  const season = searchParams.get('season'), episode = searchParams.get('episode'), typeParam = searchParams.get('type')
  const type = typeParam === 'tv' || typeParam === 'movie' ? typeParam : season != null && episode != null ? 'tv' : 'movie'
  if (type === 'tv' && (season == null || season === '' || episode == null || episode === '')) return { error: 'season and episode required for tv' }
  return { type, contentPath: buildContentPath({ type, id, season, episode }) }
}
