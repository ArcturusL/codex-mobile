export type ServiceRestartStatus = {
  available: boolean
  instanceId: string
  phase: 'idle' | 'waiting' | 'restarting'
  activeThreads: number
  busyRequests: number
  error: string | null
}
