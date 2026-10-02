import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { getManagedCodexRoot, resolveCodexCommand } from '../commandResolution'
import { getSpawnInvocation } from '../utils/commandInvocation'
import type { CodexUpdateStatus } from '../shared/codexUpdate'

const exec = promisify(execFile)
const CHECK_INTERVAL = 6 * 60 * 60 * 1000
const REGISTRY = 'https://registry.npmjs.org'
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function isNewerCodexVersion(latest: string, current: string): boolean {
  if (!STABLE_VERSION.test(latest)) return false
  const match = /^(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?(?:\+[\w.-]+)?$/.exec(current)
  if (!match) return false
  const next = latest.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const difference = next[i]! - Number(match[i + 1])
    if (difference !== 0) return difference > 0
  }
  return Boolean(match[4])
}

async function readVersion(command: string): Promise<string> {
  const invocation = getSpawnInvocation(command, ['--version'])
  const { stdout } = await exec(invocation.command, invocation.args, { timeout: 10_000, maxBuffer: 4096, windowsHide: true })
  const match = /^codex-cli\s+(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)\s*$/.exec(stdout.trim())
  if (!match) throw new Error('Could not read the Codex CLI version.')
  return match[1]!
}

// ponytail: one updater per server; use a filesystem lock if multiple servers ever share CODEX_HOME.
export function createCodexUpdater() {
  const status: CodexUpdateStatus = {
    currentVersion: null, latestVersion: null, checkedAt: null,
    checking: false, updating: false, updateAvailable: false, restartRequired: false, error: null,
  }
  let command: string | null = null
  let lastAttempt = 0
  let checking: Promise<void> | null = null

  function check(force = false): Promise<void> {
    if (checking) return checking
    if (status.updating || Date.now() - lastAttempt < (force ? 60_000 : CHECK_INTERVAL)) return Promise.resolve()
    lastAttempt = Date.now()
    status.checking = true
    status.error = null
    checking = (async () => {
      try {
        command ??= resolveCodexCommand()
        if (!command) throw new Error('Codex CLI is not installed.')
        if (!status.restartRequired) status.currentVersion = await readVersion(command)
        const response = await fetch(`${REGISTRY}/@openai%2fcodex/latest`, { signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw new Error('Could not check for Codex updates. Try again later.')
        const data = await response.json() as { version?: unknown }
        if (typeof data.version !== 'string' || !STABLE_VERSION.test(data.version)) {
          throw new Error('The update server returned an invalid version.')
        }
        status.latestVersion = data.version
        status.checkedAt = new Date().toISOString()
        status.updateAvailable = Boolean(status.currentVersion && isNewerCodexVersion(data.version, status.currentVersion))
      } catch (error) {
        status.error = error instanceof Error ? error.message : 'Could not check for Codex updates. Try again later.'
      } finally {
        status.checking = false
        checking = null
      }
    })()
    return checking
  }

  async function install(): Promise<void> {
    let staging: string | undefined
    try {
      const version = status.latestVersion!
      const root = getManagedCodexRoot()
      await mkdir(root, { recursive: true, mode: 0o700 })
      staging = await mkdtemp(join(root, 'install-'))
      const invocation = getSpawnInvocation('npm', [
        'install', '--prefix', staging, '--registry', REGISTRY, '--ignore-scripts',
        '--no-audit', '--no-fund', '--package-lock=false', '--save-exact', `@openai/codex@${version}`,
      ])
      try {
        await exec(invocation.command, invocation.args, { timeout: 300_000, maxBuffer: 1024 * 1024, windowsHide: true })
      } catch {
        throw new Error('Codex update failed. Check npm, network access, disk space and directory permissions, then retry.')
      }
      const installedCommand = join(staging, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
      if (await readVersion(installedCommand) !== version) throw new Error('Installed Codex version did not match. The previous version is unchanged.')
      // Activate only after validation; keep the previous installation for rollback.
      const pending = join(root, 'current.json.tmp')
      await writeFile(pending, JSON.stringify({ directory: basename(staging) }), { mode: 0o600 })
      await rename(pending, join(root, 'current.json'))
      staging = undefined
      status.currentVersion = version
      status.updateAvailable = false
      status.restartRequired = true
    } catch (error) {
      status.error = error instanceof Error ? error.message : 'Codex update failed.'
    } finally {
      if (staging) await rm(staging, { recursive: true, force: true }).catch(() => {})
      status.updating = false
    }
  }

  const timer = setInterval(() => { void check(true) }, CHECK_INTERVAL)
  timer.unref()
  // Defer the initial probe so startup does not wait for the registry.
  const initial = setTimeout(() => { void check() }, 1000)
  initial.unref()

  return {
    dispose() { clearInterval(timer); clearTimeout(initial) },
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname !== '/codex-api/cli-update') return false
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      if (req.method !== 'GET' && req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Allow', 'GET, POST')
        res.end(JSON.stringify({ error: 'Method not allowed.' }))
        return true
      }
      if (req.method === 'POST') {
        // Authentication is upstream; the custom header blocks cross-origin form submissions.
        if (req.headers['x-codex-cli-action'] !== 'update' || req.headers['sec-fetch-site'] === 'cross-site') {
          res.statusCode = 403
          res.end(JSON.stringify({ error: 'Codex updates require a same-origin request.' }))
          return true
        }
        if (!status.updating) {
          await check()
          if (!status.updateAvailable || !status.latestVersion) {
            res.statusCode = 409
            res.end(JSON.stringify({ error: status.error || 'No Codex update is available.' }))
            return true
          }
          // Recheck after awaiting: simultaneous clicks must start only one installation.
          if (!status.updating) {
            status.updating = true
            status.error = null
            void install()
          }
        }
        res.statusCode = 202
      } else {
        await check(url.searchParams.get('check') === '1')
      }
      res.end(JSON.stringify(status))
      return true
    },
  }
}
