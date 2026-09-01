const defaultAllowedOrigins = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
]

function allowedOrigins() {
  const configuredOrigins = Deno.env.get('ALLOWED_ORIGINS')

  if (!configuredOrigins) {
    return defaultAllowedOrigins
  }

  return configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get('origin')
  const origins = allowedOrigins()

  if (origin && !origins.includes(origin)) {
    return null
  }

  return {
    'Access-Control-Allow-Origin': origin ?? origins[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
