<template>
  <section class="codex-update-settings" aria-label="Codex CLI">
    <div class="codex-update-heading">
      <strong>Codex CLI</strong>
      <span>{{ status?.currentVersion ? `v${status.currentVersion}` : t('Version unknown') }}</span>
    </div>
    <p v-if="status?.latestVersion">{{ t('Latest stable version') }}: v{{ status.latestVersion }}</p>
    <p>{{ t('Automatically checks every 6 hours') }}</p>
    <p v-if="status?.checkedAt">{{ t('Last checked') }}: {{ new Date(status.checkedAt).toLocaleString() }}</p>
    <p v-if="status?.restartRequired" role="status">{{ t('Updated. Restart the WebUI service to use the new version in all sessions.') }}</p>
    <p v-else-if="status?.latestVersion && !status.updateAvailable && !status.error">{{ t('No newer stable version available') }}</p>
    <p v-if="error || status?.error" class="codex-update-error" role="alert">{{ t(error || status?.error || '') }}</p>
    <div class="codex-update-actions">
      <button type="button" :disabled="busy || status?.updating || status?.checking" @click="request('check')">
        {{ busy || status?.checking ? t('Checking…') : t('Check for updates') }}
      </button>
      <button type="button" :disabled="busy || !status?.updateAvailable || status?.updating || status?.checking" @click="request('update')">
        {{ status?.updating ? t('Updating…') : t('Update now') }}
      </button>
    </div>
    <p v-if="status?.updating" role="status">{{ t('Downloading and verifying Codex. You can close settings.') }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import type { CodexUpdateStatus } from '../../shared/codexUpdate'

const { t } = useUiLanguage()
const status = ref<CodexUpdateStatus | null>(null)
const busy = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false

async function request(action: 'status' | 'check' | 'update' = 'status') {
  if (busy.value) return
  clearTimeout(timer)
  busy.value = true
  error.value = ''
  try {
    const response = await fetch(`/codex-api/cli-update${action === 'check' ? '?check=1' : ''}`, {
      method: action === 'update' ? 'POST' : 'GET',
      headers: action === 'update' ? { 'X-Codex-CLI-Action': 'update' } : undefined,
      signal: AbortSignal.timeout(30_000),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not load Codex update status.')
    status.value = data
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load Codex update status.'
  } finally {
    busy.value = false
    if (!disposed) timer = setTimeout(() => { void request() }, status.value?.updating ? 1500 : 60_000)
  }
}
onMounted(() => { void request() })
onUnmounted(() => { disposed = true; clearTimeout(timer) })
</script>

<style scoped>
.codex-update-settings { padding: 12px; border-top: 1px solid #e4e4e7; color: #52525b; font-size: 12px; }
.codex-update-heading, .codex-update-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.codex-update-heading { font-size: 13px; color: #27272a; }
.codex-update-settings p { margin: 6px 0; overflow-wrap: anywhere; }
.codex-update-actions { justify-content: flex-start; margin-top: 10px; }
.codex-update-actions button { border: 1px solid #d4d4d8; border-radius: 6px; padding: 5px 9px; background: #fff; color: inherit; cursor: pointer; }
.codex-update-actions button:disabled { opacity: .5; cursor: default; }
.codex-update-actions button:focus-visible { outline: 2px solid #71717a; outline-offset: 2px; }
.codex-update-error { color: #be123c; }
</style>
