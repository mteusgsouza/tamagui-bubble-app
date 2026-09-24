import { getURL } from 'one'

// Server URLs configuration
// Force localhost on client to avoid 0.0.0.0 CORS issues
const rawServerUrl = process.env.ONE_SERVER_URL || 'http://localhost:8081'

export const SERVER_URL = (() => {
  // For production and staging web, we can infer the server URL from location.
  if (typeof location !== 'undefined') {
    return `${location.protocol}//${location.host}`
  }

  // In dev build this will return the dev server URL where the bundle is being served from.
  let url = getURL()

  // FIXME?: [One] prod ONE_SERVER_URL not working in metro
  if (
    url ===
    'http://one-server.example.com' /* Means that this is not running through dev server but is a release build */
  ) {
    // Default to production URL if not set
    url = process.env.VITE_SERVER || 'https://takeout.tamagui.dev'
  }
  return url
})()


export const DEFAULT_HOT_UPDATE_SERVER_URL =
  'https://pckjvzbtdczlpkgujgkb.supabase.co/functions/v1/update-server'

export const API_URL = `${SERVER_URL}/api`
export const AUTH_URL = `${SERVER_URL}/api/auth`
