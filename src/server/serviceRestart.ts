import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { ServiceRestartStatus } from '../shared/serviceRestart'

// Exit only when systemd supervises this exact process and will restart a nonzero exit.
// Development servers and unsupported supervisors remain explicitly unavailable.
export async function canRestartService(): Promise<boolean> {
  if (process.platform !== 'linux') return false
  try {
    const cgroup = await readFile('/proc/self/cgroup', 'utf8')
    const unit = [...cgroup.matchAll(/\/([^/\n]+\.service)(?=\/|\n|$)/g)].at(-1)?.[1]
    if (!unit) return false
    const { stdout } = await promisify(execFile)('systemctl', [
      ...(cgroup.includes('/user.slice/') ? ['--user'] : []), 'show', unit,
      '-p', 'MainPID', '-p', 'Restart', '-p', 'SuccessExitStatus', '-p', 'RestartPreventExitStatus',
    ], { timeout: 3000, maxBuffer: 4096 })
    const properties = Object.fromEntries(stdout.trim().split('\n').map(line => line.split('=')))
    return properties.MainPID === String(process.pid)
      && ['always', 'on-failure'].includes(properties.Restart ?? '')
      && !/\b(75|TEMPFAIL)\b/.test(`${properties.SuccessExitStatus} ${properties.RestartPreventExitStatus}`)
  } catch { return false }
}

export function createServiceRestarter(options: {
  restart?: () => void
  activity: () => { activeThreads: number; busyRequests: number }
  updating: () => boolean
  drain: (value: boolean) => void
  interrupt: () => Promise<void>
  flush: () => Promise<void>
}) {
  const instanceId = randomUUID()
  let phase: ServiceRestartStatus['phase'] = 'idle'
  let error: string | null = null
  let force = false
  let interrupted = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let ticking = false
  let disposed = false
  let deadline = 0
  const status = (): ServiceRestartStatus => ({ available: Boolean(options.restart), instanceId, phase, ...options.activity(), error })
  function reset() {
    clearTimeout(timer)
    phase = 'idle'
    force = false
    interrupted = false
    options.drain(false)
  }
  async function tick() {
    if (disposed || ticking || phase === 'idle') return
    ticking = true
    try {
      if (force && !interrupted) {
        interrupted = true
        await options.interrupt()
      }
      const activity = options.activity()
      if (activity.activeThreads || activity.busyRequests) {
        if (force && Date.now() > deadline) throw new Error('Could not finish saving active conversations. Restart cancelled; please retry.')
        return
      }
      phase = 'restarting'
      await options.flush()
      if (!disposed) options.restart!()
      disposed = true
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Service restart failed.'
      reset()
    } finally {
      ticking = false
      if (!disposed && status().phase !== 'idle') timer = setTimeout(() => { void tick() }, 500)
    }
  }
  return {
    status,
    request(action: 'wait' | 'force' | 'cancel', confirmed: boolean) {
      if (!options.restart) throw new Error('Service restart is unavailable for this server. Use its service manager.')
      if (!confirmed) throw new Error('Confirm the service restart first.')
      if (action === 'cancel') {
        if (phase === 'restarting') throw new Error('The service is already restarting.')
        reset()
        return status()
      }
      if (options.updating()) throw new Error('Wait for the Codex update to finish before restarting.')
      if (phase === 'restarting') return status()
      error = null
      force = action === 'force'
      phase = force ? 'restarting' : 'waiting'
      deadline = Date.now() + 30_000
      options.drain(true)
      clearTimeout(timer)
      // Let the confirmation response reach the browser before interrupting/restarting.
      timer = setTimeout(() => { void tick() }, 500)
      return status()
    },
    dispose() { disposed = true; clearTimeout(timer) },
  }
}
