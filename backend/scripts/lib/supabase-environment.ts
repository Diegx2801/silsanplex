import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { config } from 'dotenv'

export type SupabaseEnvironment = {
  url: string
  secretKey: string
}

export function loadSupabaseEnvironment(): SupabaseEnvironment {
  config({ path: '.env.local', quiet: true })

  const configuredUrl = process.env.SUPABASE_URL?.trim()
  const configuredSecret =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (configuredUrl && configuredSecret) {
    return { url: configuredUrl, secretKey: configuredSecret }
  }

  const cliPath = resolve(process.cwd(), 'node_modules', 'supabase', 'dist', 'supabase.js')

  let values: Record<string, string> = {}
  try {
    const output = execFileSync(process.execPath, [cliPath, 'status', '-o', 'env'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    values = Object.fromEntries(
      output
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => [
          match[1],
          match[2].trim().replace(/^(["'])(.*)\1$/, '$2'),
        ]),
    )
  } catch {
    // El mensaje de configuración inferior explica cómo resolverlo.
  }

  const url = configuredUrl || values.API_URL
  const secretKey =
    configuredSecret || values.SERVICE_ROLE_KEY || values.SECRET_KEY

  if (!url || !secretKey) {
    throw new Error(
      'No se encontraron las credenciales privadas. Inicia Supabase local o configura SUPABASE_URL y SUPABASE_SECRET_KEY en backend/.env.local.',
    )
  }

  return { url, secretKey }
}
