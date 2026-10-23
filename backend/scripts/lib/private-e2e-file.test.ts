import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { restrictPrivateE2eFile, writePrivateE2eFile } from './private-e2e-file.ts'

function fixture(t: { after: (fn: () => void) => void }) {
  const directory = mkdtempSync(join(tmpdir(), 'silsan private acl-'))
  t.after(() => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      assert.equal(dirname(path), resolve(directory))
      if (entry.isDirectory()) rmdirSync(path)
      else unlinkSync(path)
    }
    rmdirSync(directory)
  })
  return join(directory, 'sample.env')
}

function privateAcl(target: string) {
  if (process.platform !== 'win32') return
  const metadata = execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-File', resolve(__dirname, 'private-e2e-file.ps1'),
    '-Target', target, '-Action', 'inspect',
  ], { encoding: 'utf8' }).trim().split(/\r?\n/)
  const [owner, protectedAcl, ...rules] = metadata
  assert.equal(protectedAcl, 'True')
  assert.deepEqual(rules.map((r) => r.split('|')[0]).sort(), [...new Set([owner, 'S-1-5-18', 'S-1-5-32-544'])].sort())
  for (const rule of rules) assert.equal(rule.split('|').slice(1).join('|'), 'FullControl|Allow|False')
  return owner
}

test('new and regenerated files have a private ACL and preserve UTF-8 content', (t) => {
  const target = fixture(t)
  writePrivateE2eFile(target, 'sample=solo prueba á漢\n')
  const owner = privateAcl(target)
  assert.equal(readFileSync(target, 'utf8'), 'sample=solo prueba á漢\n')
  writePrivateE2eFile(target, 'sample=recreated\n')
  assert.equal(privateAcl(target), owner)
  assert.equal(readFileSync(target, 'utf8'), 'sample=recreated\n')
})

test('tightening an existing broad ACL preserves content and is repeatable', (t) => {
  const target = fixture(t)
  writeFileSync(target, 'non-secret fixture\n')
  if (process.platform === 'win32') {
    execFileSync('icacls.exe', [target, '/grant', '*S-1-5-11:(M)', '*S-1-5-32-545:(RX)'], { stdio: 'pipe' })
  }
  restrictPrivateE2eFile(target)
  const owner = privateAcl(target)
  restrictPrivateE2eFile(target)
  assert.equal(privateAcl(target), owner)
  assert.equal(readFileSync(target, 'utf8'), 'non-secret fixture\n')
  writePrivateE2eFile(target, 'updated fixture\n')
  privateAcl(target)
})

test('deleting and recreating through the preparer writer remains private', (t) => {
  const target = fixture(t)
  writePrivateE2eFile(target, 'first')
  unlinkSync(target)
  writePrivateE2eFile(target, 'second')
  privateAcl(target)
  assert.equal(readFileSync(target, 'utf8'), 'second')
})

test('directories and hard links are rejected without modifying their contents', (t) => {
  const target = fixture(t)
  mkdirSync(target)
  assert.throws(() => writePrivateE2eFile(target, 'must not write'))
  rmdirSync(target)
  writeFileSync(target, 'original fixture')
  const link = join(dirname(target), 'hardlink')
  linkSync(target, link)
  assert.throws(() => writePrivateE2eFile(target, 'must not replace'))
  assert.throws(() => restrictPrivateE2eFile(target))
  assert.equal(readFileSync(target, 'utf8'), 'original fixture')
})
