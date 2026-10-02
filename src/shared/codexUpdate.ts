export type CodexUpdateStatus = {
  currentVersion: string | null
  latestVersion: string | null
  checkedAt: string | null
  checking: boolean
  updating: boolean
  updateAvailable: boolean
  restartRequired: boolean
  error: string | null
}
