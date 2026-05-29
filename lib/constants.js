export const ORIGIN = process.env.VIDUP_ORIGIN || 'https://vidup.to'
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
export const CSRF_HEADERS = {
  'X-Csrf-Token': process.env.VIDUP_CSRF_TOKEN || 'uYGADjqAR7845N819eNINXiOaLhvvXAr',
}
