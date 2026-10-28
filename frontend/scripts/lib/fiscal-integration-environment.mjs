import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { randomBytes, createHash } from 'node:crypto'

export const ports = Object.freeze({ shadow: 59220, api: 59221, db: 59222, web: 5197 })
export const api = `http://127.0.0.1:${ports.api}`
const digest = value => createHash('sha256').update(value).digest('hex')
const candidateHashes = {
  '20261023061225_electronic_fiscal_sandbox_persistence.sql': 'df0c339852499b2717a5cfd00d822b06128ff970610fb0f74db08a15c242de01',
  '20261023135019_electronic_fiscal_helper_sql_lint.sql': 'ff0d192543f389de8391a72507de5f217407287e60a4b8295fae4606f9bcb670',
}
const allowedCommands = new Set(['docker', 'supabase'])

export function isGitHubHostedLinux(env = process.env) {
  return env.GITHUB_ACTIONS === 'true'
    && env.CI === 'true'
    && env.RUNNER_OS === 'Linux'
    && env.RUNNER_ENVIRONMENT === 'github-hosted'
    && env.DOCKER_HOST === undefined
    && env.DOCKER_CONTEXT === undefined
}

export function commandInvocation(executable, args, env = process.env) {
  assert.ok(allowedCommands.has(executable), 'FISCAL_TEST_COMMAND_NOT_ALLOWED')
  if (isGitHubHostedLinux(env)) return { executable, args: [...args] }
  return { executable: 'rtk', args: ['proxy', executable, ...args] }
}

// Output of start/status can include local secrets: never forward it or attach it
// to exceptions. No destination argument or DB URL is accepted by this runner.
export function command(executable, args, input) {
  const invocation = commandInvocation(executable, args)
  try {
    return execFileSync(invocation.executable, invocation.args, {
      input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 900_000,
      maxBuffer: 32 * 1024 * 1024,
    }).trim()
  } catch {
    throw new Error(`FISCAL_TEST_COMMAND_FAILED:${executable}:${args[0]}`)
  }
}
const docker = (...args) => command('docker', args)
const inspect = (...args) => JSON.parse(docker(...args))
const list = (...args) => docker(...args).split(/\r?\n/).filter(Boolean)

export function assertLabels(item, project) {
  const labels = item.Config?.Labels ?? item.Labels ?? {}
  assert.equal(labels['com.supabase.cli.project'], project, 'FISCAL_TEST_PROJECT_LABEL')
  if (item.Config) assert.equal(labels['com.docker.compose.project'], project)
}

// Independent best-effort closes: a failed browser/server/session close must not
// skip the guarded environment cleanup. Return stage names, never secret errors.
export async function closeFiscalTestResources({ clients = [], browser, server, environment }) {
  const failures = []
  for (const client of clients) {
    try {
      const result = await client.auth.signOut()
      if (result?.error) failures.push('session')
    } catch { failures.push('session') }
  }
  try { await browser?.close() } catch { failures.push('browser') }
  try { await server?.close() } catch { failures.push('server') }
  try { environment.cleanup() } catch { failures.push('environment') }
  return failures
}

export class FiscalEnvironment {
  constructor(root) {
    this.root = root
    this.project = `silsan-fiscal-read-${randomBytes(6).toString('hex')}`
    this.directory = null
    this.started = false
  }
  config() {
    return `project_id = "${this.project}"
[api]
enabled = true
port = ${ports.api}
[db]
port = ${ports.db}
shadow_port = ${ports.shadow}
major_version = 17
[db.seed]
enabled = false
sql_paths = []
[studio]
enabled = false
[local_smtp]
enabled = false
[realtime]
enabled = false
[analytics]
enabled = false
[edge_runtime]
enabled = false
[auth]
site_url = "http://127.0.0.1:${ports.web}"
enable_signup = false
[auth.email]
enable_confirmations = false
`
  }
  manifest() {
    const base = path.join(this.root, 'backend/supabase/migrations')
    const names = fs.readdirSync(base).filter(n => n.endsWith('.sql')).sort()
    const candidateNames = Object.keys(candidateHashes)
    const firstCandidate = names.indexOf(candidateNames[0])
    assert.ok(firstCandidate >= 0, 'FISCAL_TEST_CANDIDATES_MISSING')
    assert.deepEqual(names.slice(firstCandidate, firstCandidate + candidateNames.length), candidateNames,
      'FISCAL_TEST_CANDIDATE_ORDER')
    assert.equal(names.filter(name => candidateNames.includes(name)).length, candidateNames.length,
      'FISCAL_TEST_CANDIDATE_DUPLICATE')
    const result = Object.fromEntries(names.map(n => [n, digest(fs.readFileSync(path.join(base, n)))]))
    for (const [name, hash] of Object.entries(candidateHashes)) assert.equal(result[name], hash)
    return result
  }
  inventory() {
    const ids = list('ps', '-aq')
    const containers = ids.length ? inspect('inspect', ...ids) : []
    const names = list('volume', 'ls', '-q')
    const volumes = names.length ? inspect('volume', 'inspect', ...names) : []
    return { containers, volumes }
  }
  async prepare() {
    assert.equal(process.env.DOCKER_HOST, undefined, 'FISCAL_TEST_NO_DOCKER_OVERRIDE')
    assert.equal(process.env.DOCKER_CONTEXT, undefined, 'FISCAL_TEST_NO_DOCKER_CONTEXT_OVERRIDE')
    const endpoint = inspect('context', 'inspect')[0].Endpoints.docker.Host
    assert.ok(['npipe:////./pipe/dockerDesktopLinuxEngine', 'unix:///var/run/docker.sock'].includes(endpoint))
    this.before = this.inventory()
    assert.ok(!this.before.containers.some(c => c.Name.includes(this.project)))
    assert.ok(!this.before.volumes.some(v => v.Name.includes(this.project)))
    for (const port of Object.values(ports)) {
      await new Promise((resolve, reject) => {
        const probe = net.createServer()
        probe.once('error', reject)
        probe.listen(port, '0.0.0.0', () => probe.close(resolve))
      })
    }
    this.sourceManifest = this.manifest()
    this.directory = fs.mkdtempSync(path.join(os.tmpdir(), `${this.project}-`))
    fs.mkdirSync(path.join(this.directory, 'supabase/migrations'), { recursive: true })
    fs.writeFileSync(path.join(this.directory, 'owner.json'), JSON.stringify({ project: this.project }))
    fs.writeFileSync(path.join(this.directory, 'supabase/config.toml'), this.config())
    this.assertDirectory()
    // Start a fresh empty volume, verify physical identity, then install only the
    // exact migration copy. Never run reset, seed, repair or a remote command.
    this.started = true
    command('supabase', ['start', '--workdir', this.directory, '--exclude',
      'studio,inbucket,realtime,analytics,vector,edge-runtime,imgproxy,meta'])
    this.verify()
    for (const name of Object.keys(this.sourceManifest)) {
      fs.copyFileSync(path.join(this.root, 'backend/supabase/migrations', name),
        path.join(this.directory, 'supabase/migrations', name))
    }
    command('supabase', ['migration', 'up', '--local', '--workdir', this.directory])
    this.verify()
    const history = JSON.parse(this.sql('select json_agg(version order by version) from supabase_migrations.schema_migrations'))
    assert.deepEqual(history, Object.keys(this.sourceManifest).map(n => n.split('_')[0]))
    this.status = JSON.parse(command('supabase', ['status', '--workdir', this.directory, '-o', 'json']))
    assert.equal(this.status.API_URL, api)
    assert.equal(new URL(this.status.DB_URL).port, String(ports.db))
    assert.equal(new URL(this.status.DB_URL).hostname, '127.0.0.1')
  }
  assertDirectory() {
    assert.match(this.project, /^silsan-fiscal-read-[a-f0-9]{12}$/)
    assert.equal(path.dirname(this.directory), path.resolve(os.tmpdir()))
    assert.ok(path.basename(this.directory).startsWith(`${this.project}-`))
    assert.ok(!fs.lstatSync(this.directory).isSymbolicLink())
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(this.directory, 'owner.json'))), { project: this.project })
    assert.equal(fs.readFileSync(path.join(this.directory, 'supabase/config.toml'), 'utf8'), this.config())
    assert.ok(!fs.existsSync(path.join(this.directory, 'supabase/.temp/project-ref')))
  }
  owned() {
    const inventory = this.inventory()
    const containers = inventory.containers.filter(c => c.Name.endsWith(`_${this.project}`)
      || c.Config.Labels?.['com.supabase.cli.project'] === this.project)
    const volumes = inventory.volumes.filter(v => v.Name.endsWith(`_${this.project}`)
      || v.Labels?.['com.supabase.cli.project'] === this.project)
    for (const c of containers) {
      assertLabels(c, this.project)
      assert.ok(c.Name.endsWith(`_${this.project}`))
      assert.ok(c.Mounts.every(m => m.Type === 'volume' || m.Type === 'tmpfs'), 'FISCAL_TEST_NO_HOST_BINDS')
      assert.ok(!this.before.containers.some(b => b.Id === c.Id))
    }
    for (const v of volumes) {
      assertLabels(v, this.project)
      assert.ok(v.Name.endsWith(`_${this.project}`))
      assert.ok(!this.before.volumes.some(b => b.Name === v.Name))
    }
    return { containers, volumes }
  }
  verify() {
    this.assertDirectory()
    assert.deepEqual(this.manifest(), this.sourceManifest)
    const { containers, volumes } = this.owned()
    for (const [kind, internal, port] of [['db', '5432/tcp', ports.db], ['kong', '8000/tcp', ports.api]]) {
      const c = containers.find(c => c.Name === `/supabase_${kind}_${this.project}`)
      assert.ok(c?.State.Running)
      assert.ok(c.NetworkSettings.Ports[internal]?.some(p => p.HostPort === String(port)))
      if (kind === 'db') assert.ok(c.Mounts.some(m => m.Type === 'volume'
        && m.Name === `supabase_db_${this.project}` && m.Destination === '/var/lib/postgresql/data'))
    }
    assert.ok(volumes.some(v => v.Name === `supabase_db_${this.project}`))
  }
  sql(query) {
    this.verify()
    return docker('exec', '-i', `supabase_db_${this.project}`, 'psql', '-X', '-qAt',
      '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', query)
  }
  cleanup() {
    if (!this.directory) return
    this.assertDirectory()
    if (this.started) {
      this.owned()
      command('supabase', ['stop', '--project-id', this.project, '--workdir', this.directory, '--no-backup'])
      const remaining = this.owned()
      assert.equal(remaining.containers.length + remaining.volumes.length, 0)
    }
    const after = this.inventory()
    for (const c of this.before.containers) {
      const current = after.containers.find(x => x.Id === c.Id)
      assert.ok(current, 'FISCAL_TEST_FOREIGN_CONTAINER_MISSING')
      // Docker does not promise ordering of Mounts across inspect calls.
      const mounts = value => [...value].sort((a, b) => a.Destination.localeCompare(b.Destination))
      assert.deepEqual(mounts(current.Mounts), mounts(c.Mounts))
    }
    for (const v of this.before.volumes) assert.deepEqual(after.volumes.find(x => x.Name === v.Name), v)
    this.assertDirectory()
    fs.rmSync(this.directory, { recursive: true })
    assert.ok(!fs.existsSync(this.directory))
  }
}
