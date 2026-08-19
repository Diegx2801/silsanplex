import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function readLocalSupabaseEnvironment() {
  const supabaseCliPath = resolve(
    process.cwd(),
    'node_modules',
    'supabase',
    'dist',
    'supabase.js',
  )
  const output = execFileSync(
    process.execPath,
    [supabaseCliPath, 'status', '-o', 'env'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => {
        const value = match[2].trim().replace(/^(["'])(.*)\1$/, '$2')
        return [match[1], value]
      }),
  )
}

async function configureLocalFrontend() {
  const localEnvironment = readLocalSupabaseEnvironment()
  const supabaseUrl = localEnvironment.API_URL
  const publishableKey =
    localEnvironment.PUBLISHABLE_KEY || localEnvironment.ANON_KEY

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      'Supabase local no devolvió API_URL ni una clave pública. Verifica que esté iniciado.',
    )
  }

  const frontendEnvironmentPath = resolve(
    process.cwd(),
    '..',
    'frontend',
    '.env.local',
  )
  const contents = [
    `VITE_SUPABASE_URL=${supabaseUrl}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
    '',
  ].join('\n')

  await writeFile(frontendEnvironmentPath, contents, {
    encoding: 'utf8',
    mode: 0o600,
  })

  console.info('frontend/.env.local configurado con los datos públicos de Supabase local.')
}

configureLocalFrontend().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Error desconocido'
  console.error(`No se pudo configurar el frontend local: ${message}`)
  process.exitCode = 1
})
