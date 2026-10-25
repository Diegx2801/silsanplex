// Explicit node:test entry, kept outside Vitest's *.test.* discovery.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  FiscalEnvironment, assertLabels, commandInvocation, isGitHubHostedLinux, ports, closeFiscalTestResources,
} from './fiscal-integration-environment.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

test('puertos exclusivos sin destinos persistentes', () => {
  assert.deepEqual(Object.values(ports), [59220, 59221, 59222, 5197])
  assert.ok(Object.values(ports).every(p => ![54321, 54322, 58121, 58122].includes(p)))
})
test('GitHub Actions hosted Linux ejecuta directamente solo los comandos locales permitidos', () => {
  const env = {
    GITHUB_ACTIONS: 'true', CI: 'true', RUNNER_OS: 'Linux', RUNNER_ENVIRONMENT: 'github-hosted',
  }
  assert.equal(isGitHubHostedLinux(env), true)
  assert.deepEqual(commandInvocation('docker', ['context', 'inspect'], env), {
    executable: 'docker', args: ['context', 'inspect'],
  })
  assert.deepEqual(commandInvocation('supabase', ['status', '--workdir', '/tmp/owned'], env), {
    executable: 'supabase', args: ['status', '--workdir', '/tmp/owned'],
  })
  assert.throws(() => commandInvocation('psql', ['postgresql://remote'], env), /FISCAL_TEST_COMMAND_NOT_ALLOWED/)
})
test('entornos locales, self-hosted y señales CI incompletas conservan rtk proxy', () => {
  const hosted = {
    GITHUB_ACTIONS: 'true', CI: 'true', RUNNER_OS: 'Linux', RUNNER_ENVIRONMENT: 'github-hosted',
  }
  for (const env of [
    {},
    { ...hosted, RUNNER_ENVIRONMENT: 'self-hosted' },
    { ...hosted, RUNNER_OS: 'Windows' },
    { ...hosted, CI: undefined },
    { ...hosted, DOCKER_HOST: 'tcp://example.invalid:2375' },
    { ...hosted, DOCKER_CONTEXT: 'remote' },
  ]) {
    assert.equal(isGitHubHostedLinux(env), false)
    assert.deepEqual(commandInvocation('docker', ['ps', '-q'], env), {
      executable: 'rtk', args: ['proxy', 'docker', 'ps', '-q'],
    })
  }
})
test('rechaza una etiqueta ausente o perteneciente a backend', () => {
  assert.throws(() => assertLabels({ Config: { Labels: {} } }, 'silsan-fiscal-read-test'))
  assert.throws(() => assertLabels({ Config: { Labels: {
    'com.supabase.cli.project': 'backend', 'com.docker.compose.project': 'backend',
  } } }, 'silsan-fiscal-read-test'))
})
test('exige ambas etiquetas reales del contenedor', () => {
  assert.throws(() => assertLabels({ Config: { Labels: {
    'com.supabase.cli.project': 'test', 'com.docker.compose.project': 'backend',
  } } }, 'test'))
  assertLabels({ Config: { Labels: {
    'com.supabase.cli.project': 'test', 'com.docker.compose.project': 'test',
  } } }, 'test')
})
test('rechaza un volumen de otro proyecto', () => {
  assert.throws(() => assertLabels({ Labels: { 'com.supabase.cli.project': 'silsanplexp2c2' } }, 'test'))
  assertLabels({ Labels: { 'com.supabase.cli.project': 'test' } }, 'test')
})
test('cada instancia deriva una identidad nueva, sin URL configurable', () => {
  const a = new FiscalEnvironment('/unused')
  const b = new FiscalEnvironment('/unused')
  assert.match(a.project, /^silsan-fiscal-read-[a-f0-9]{12}$/)
  assert.notEqual(a.project, b.project)
  assert.equal(a.directory, null)
  assert.equal(a.started, false)
  assert.ok(!a.config().includes('54321'))
  assert.ok(!a.config().includes('58121'))
  assert.ok(a.config().includes('enable_signup = false'))
  assert.ok(a.config().includes('sql_paths = []'))
})
test('el manifiesto fiscal fija las 151 migraciones y las identidades 149/150/151', () => {
  const manifest = new FiscalEnvironment(repositoryRoot).manifest()
  const names = Object.keys(manifest)
  assert.equal(names.length, 151)
  assert.deepEqual(names.slice(-3), [
    '20261023061225_electronic_fiscal_sandbox_persistence.sql',
    '20261023135019_electronic_fiscal_helper_sql_lint.sql',
    '20261025190353_restrict_electronic_document_direct_select.sql',
  ])
})
test('rechaza identidad persistente antes de inspeccionar o limpiar archivos', () => {
  const e = new FiscalEnvironment('/unused')
  e.project = 'backend'
  e.directory = '/unused'
  assert.throws(() => e.assertDirectory())
  assert.throws(() => e.cleanup())
})
test('sin preparación no ejecuta limpieza ni comandos Docker', () => {
  const e = new FiscalEnvironment('/unused')
  e.cleanup()
  assert.equal(e.directory, null)
})
test('propiedad rechaza recursos preexistentes y montajes de host', () => {
  const e = new FiscalEnvironment('/unused')
  const networkName = `supabase_network_${e.project}`
  const network = { Id: 'owned-network', Name: networkName, Labels: {
    'com.supabase.cli.project': e.project, 'com.docker.compose.project': e.project,
  } }
  const c = { Id: 'fixture', Name: `/supabase_db_${e.project}`, Config: { Labels: {
    'com.supabase.cli.project': e.project, 'com.docker.compose.project': e.project,
  } }, Mounts: [], NetworkSettings: { Networks: { [networkName]: {} } } }
  e.inventory = () => ({ containers: [c], volumes: [], networks: [network] })
  e.before = { containers: [c], volumes: [], networks: [network] }
  assert.throws(() => e.owned())
  e.before = { containers: [], volumes: [], networks: [] }
  c.Mounts = [{ Type: 'bind', Destination: '/foreign' }]
  assert.throws(() => e.owned())
  c.Mounts = []
  assert.equal(e.owned().containers.length, 1)
})

test('la red fiscal usa etiquetas propias y ningún contenedor se une a redes existentes', () => {
  const e = new FiscalEnvironment('/unused')
  const networkName = `supabase_network_${e.project}`
  const network = { Id: 'new-network', Name: networkName, Labels: {
    'com.supabase.cli.project': e.project, 'com.docker.compose.project': e.project,
  } }
  const container = { Id: 'new-container', Name: `/supabase_db_${e.project}`, Config: { Labels: {
    'com.supabase.cli.project': e.project, 'com.docker.compose.project': e.project,
  } }, Mounts: [{ Type: 'volume' }], NetworkSettings: { Networks: { [networkName]: {} } } }
  e.before = { containers: [], volumes: [], networks: [] }
  e.inventory = () => ({ containers: [container], volumes: [], networks: [network] })
  assert.equal(e.owned().networks[0].Id, 'new-network')
  container.NetworkSettings.Networks = { supabase_network_backend: {} }
  assert.throws(() => e.owned(), /FISCAL_TEST_NO_FOREIGN_NETWORKS/)
  container.NetworkSettings.Networks = { [networkName]: {} }
  network.Labels['com.docker.compose.project'] = 'backend'
  assert.throws(() => e.owned(), /FISCAL_TEST_NETWORK_PROJECT/)
})

test('detiene el proyecto propio si start dejó un contenedor sin red', () => {
  const e = new FiscalEnvironment('/unused')
  e.directory = fs.mkdtempSync(path.join(os.tmpdir(), `${e.project}-`))
  fs.mkdirSync(path.join(e.directory, 'supabase'), { recursive: true })
  fs.writeFileSync(path.join(e.directory, 'owner.json'), JSON.stringify({ project: e.project }))
  fs.writeFileSync(path.join(e.directory, 'supabase/config.toml'), e.config())
  e.before = { containers: [], volumes: [], networks: [] }
  const partial = { Id: 'partial-container', Name: `/supabase_db_${e.project}`, Config: { Labels: {
    'com.supabase.cli.project': e.project, 'com.docker.compose.project': e.project,
  } }, Mounts: [], NetworkSettings: { Networks: {} } }
  let stopped = false
  e.started = true
  e.inventory = () => stopped
    ? { containers: [], volumes: [], networks: [] }
    : { containers: [partial], volumes: [], networks: [] }
  e.stop = () => { stopped = true }
  try {
    e.cleanup()
    assert.equal(stopped, true)
    assert.equal(fs.existsSync(e.directory), false)
  } finally {
    if (e.directory && fs.existsSync(e.directory)) fs.rmSync(e.directory, { recursive: true })
  }
})

for (const failing of ['browser', 'server', 'session']) {
  test(`intenta todos los cierres y limpieza aunque falle ${failing}`, async () => {
    const calls = []
    const close = name => async () => {
      calls.push(name)
      if (name === failing) throw Error('SECRET_ERROR_MUST_NOT_BE_RETURNED')
    }
    const failures = await closeFiscalTestResources({
      clients: [{ auth: { signOut: close('session') } }],
      browser: { close: close('browser') }, server: { close: close('server') },
      environment: { cleanup: () => calls.push('environment') },
    })
    assert.deepEqual(calls, ['session', 'browser', 'server', 'environment'])
    assert.deepEqual(failures, [failing])
  })
}

test('conserva la ruta de cierre satisfactorio y detecta fallo de limpieza', async () => {
  const calls = []
  const resources = {
    clients: [{ auth: { signOut: async () => { calls.push('session'); return { error: null } } } }],
    browser: { close: async () => calls.push('browser') },
    server: { close: async () => calls.push('server') },
    environment: { cleanup: () => calls.push('environment') },
  }
  assert.deepEqual(await closeFiscalTestResources(resources), [])
  assert.deepEqual(calls, ['session', 'browser', 'server', 'environment'])
  resources.environment.cleanup = () => { throw Error('SECRET_ERROR') }
  assert.deepEqual(await closeFiscalTestResources(resources), ['environment'])
})

test('un error devuelto por signOut no se interpreta como cierre satisfactorio', async () => {
  let cleaned = false
  const failures = await closeFiscalTestResources({
    clients: [{ auth: { signOut: async () => ({ error: { message: 'SECRET_ERROR' } }) } }],
    environment: { cleanup: () => { cleaned = true } },
  })
  assert.deepEqual(failures, ['session'])
  assert.equal(cleaned, true)
})
