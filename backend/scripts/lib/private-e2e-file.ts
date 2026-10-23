import { execFileSync } from 'node:child_process'
import { chmodSync, lstatSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assertRegularFileIfPresent(target: string) {
  try {
    const stat = lstatSync(target)
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('E2E target must be a regular file with one link.')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function windowsOperation(target: string, action: 'secure' | 'write', contents?: string) {
  assertRegularFileIfPresent(target)
  try {
    execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-File', resolve(__dirname, 'private-e2e-file.ps1'),
      '-Target', resolve(target), '-Action', action,
    ], { input: contents ?? '', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  } catch {
    // Do not forward process inputs or a child-process error containing them.
    throw new Error('No se pudo proteger el archivo E2E; no continuar con una escritura sin ACL privada.')
  }
}

export function restrictPrivateE2eFile(target: string) {
  assertRegularFileIfPresent(target)
  if (process.platform === 'win32') windowsOperation(target, 'secure')
  else chmodSync(target, 0o600)
}

export function writePrivateE2eFile(target: string, contents: string) {
  assertRegularFileIfPresent(target)
  if (process.platform === 'win32') windowsOperation(target, 'write', contents)
  else {
    try { chmodSync(target, 0o600) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    writeFileSync(target, contents, { encoding: 'utf8', mode: 0o600 })
  }
}
