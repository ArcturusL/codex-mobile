export const PERMISSION_MODES = [
  { value: 'read-only', label: 'Read only' },
  { value: 'default', label: 'Default permissions' },
  { value: 'auto-review', label: 'Auto-review' },
  { value: 'full-access', label: 'Full access' },
] as const

export type PermissionMode = typeof PERMISSION_MODES[number]['value']

export function normalizePermissionMode(value: unknown): PermissionMode | undefined {
  return PERMISSION_MODES.some((mode) => mode.value === value) ? value as PermissionMode : undefined
}

// Shared by direct turns and the persisted backend queue.
export function permissionModeParams(mode?: PermissionMode): Record<string, unknown> {
  if (!mode) return {}
  if (!normalizePermissionMode(mode)) throw new Error('Invalid permission mode')
  return {
    approvalPolicy: mode === 'full-access' ? 'never' : 'on-request',
    approvalsReviewer: mode === 'auto-review' ? 'auto_review' : 'user',
    sandboxPolicy: mode === 'full-access'
      ? { type: 'dangerFullAccess' }
      : mode === 'read-only'
        ? { type: 'readOnly', networkAccess: false }
        : {
            type: 'workspaceWrite', writableRoots: [], networkAccess: false,
            excludeTmpdirEnvVar: false, excludeSlashTmp: false,
          },
  }
}
