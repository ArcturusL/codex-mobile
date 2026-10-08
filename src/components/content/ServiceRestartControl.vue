<template>
  <button class="service-restart-button" type="button" :disabled="disabled || !status?.available || submitting"
    :title="status?.available ? '' : t('Service restart is unavailable for this server. Use its service manager.')" @click="openDialog">
    {{ t(status?.phase === 'restarting' ? 'Restarting…' : 'Restart service') }}
  </button>
  <span v-if="message" class="service-restart-message" role="status">{{ message }}</span>
  <Teleport to="body">
    <dialog ref="dialog" class="service-restart-dialog" :aria-label="t('Restart service')" @cancel.prevent="closeDialog" @pointerdown.stop @click.stop>
      <h3>{{ t(forceConfirmation ? 'Interrupt active conversations and restart?' : 'Restart service?') }}</h3>
      <p v-if="status?.activeThreads">{{ t('Active conversations') }}: {{ status.activeThreads }}</p>
      <p v-if="forceConfirmation">{{ t('Active tasks will be interrupted. Saved conversation history and queued messages will remain.') }}</p>
      <p v-else>{{ t('Wait for active conversations to finish, save pending messages, then restart. New tasks pause until the service returns.') }}</p>
      <p v-if="status?.phase === 'waiting'">{{ t('Waiting for conversations to finish. You can close this dialog or cancel the restart.') }}</p>
      <p v-if="status?.phase === 'restarting'">{{ t('Saving conversations and restarting. Reconnecting automatically…') }}</p>
      <p v-if="error || status?.error" role="alert">{{ t(error || status?.error || '') }}</p>
      <div class="service-restart-dialog-actions">
        <button type="button" autofocus :disabled="submitting" @click="closeDialog">{{ t('Close') }}</button>
        <template v-if="status?.phase !== 'restarting'">
          <button v-if="status?.phase === 'waiting' && !forceConfirmation" type="button" :disabled="submitting" @click="request('cancel')">{{ t('Cancel restart') }}</button>
          <button v-if="!forceConfirmation" type="button" :disabled="submitting || disabled || !status?.available || status.phase === 'waiting'" @click="request('wait')">
            {{ t(status?.activeThreads ? 'Wait and restart' : 'Confirm restart') }}
          </button>
          <button v-if="forceConfirmation" class="service-restart-danger" type="button" :disabled="submitting" @click="request('force')">{{ t('Confirm immediate restart') }}</button>
          <button v-else-if="status?.activeThreads || status?.phase === 'waiting'" class="service-restart-danger" type="button" :disabled="submitting || disabled" @click="forceConfirmation = true">{{ t('Restart immediately…') }}</button>
        </template>
      </div>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import type { ServiceRestartStatus } from '../../shared/serviceRestart'

const props = defineProps<{ disabled: boolean; beforeRestart?: () => Promise<void> }>()
const emit = defineEmits<{ busy: [value: boolean]; restarted: [] }>()
const { t } = useUiLanguage()
const status = ref<ServiceRestartStatus | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
const forceConfirmation = ref(false)
const submitting = ref(false)
const error = ref('')
const completed = ref(false)
const storageKey = 'codex-web-local.pending-service-restart.v1'
let pendingInstance = ''
try { pendingInstance = sessionStorage.getItem(storageKey) || '' } catch { /* private browsing */ }
let timer: ReturnType<typeof setTimeout> | undefined
let inFlight = false
let disposed = false
const message = computed(() => {
  if (error.value) return t(error.value)
  if (status.value?.error) return t(status.value.error)
  if (status.value?.phase === 'waiting') return t('Waiting for conversations to finish…')
  if (status.value?.phase === 'restarting') return t('Saving conversations and restarting. Reconnecting automatically…')
  return completed.value ? t('Service restarted. Conversations can continue.') : ''
})
function remember(instance: string) {
  pendingInstance = instance
  try { if (instance) sessionStorage.setItem(storageKey, instance); else sessionStorage.removeItem(storageKey) } catch { /* private browsing */ }
}
function accept(next: ServiceRestartStatus) {
  if (pendingInstance && next.instanceId !== pendingInstance) {
    completed.value = true
    remember('')
    forceConfirmation.value = false
    emit('restarted')
  } else if (next.phase === 'idle') remember('')
  if (next.phase !== 'idle') remember(next.instanceId)
  status.value = next
  emit('busy', next.phase !== 'idle')
}
function schedule() {
  clearTimeout(timer)
  if (!disposed && (dialog.value?.open || pendingInstance || (status.value && status.value.phase !== 'idle'))) {
    timer = setTimeout(() => { void refresh() }, 1500)
  }
}
async function refresh() {
  if (inFlight) { schedule(); return }
  inFlight = true
  try {
    const response = await fetch('/codex-api/service-restart', { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('Could not read service restart status.')
    accept(await response.json())
    error.value = ''
  } catch (cause) {
    error.value = pendingInstance ? 'Waiting for the service to reconnect…' : (cause instanceof Error ? cause.message : 'Service restart failed.')
  } finally { inFlight = false; schedule() }
}
function openDialog() {
  forceConfirmation.value = false
  dialog.value?.showModal()
  void refresh()
}
function closeDialog() { dialog.value?.close(); forceConfirmation.value = false; schedule() }
async function request(action: 'wait' | 'force' | 'cancel') {
  if (submitting.value) return
  submitting.value = true
  while (inFlight) await new Promise(resolve => setTimeout(resolve, 50))
  inFlight = true
  clearTimeout(timer)
  error.value = ''
  completed.value = false
  try {
    await nextTick() // Persist the composer's existing draft watchers before submitting.
    if (action !== 'cancel') await props.beforeRestart?.()
    if (action !== 'cancel') remember(status.value?.instanceId || '')
    const response = await fetch('/codex-api/service-restart', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Codex-Service-Action': 'restart' },
      body: JSON.stringify({ action, confirmed: true }), signal: AbortSignal.timeout(15_000),
    })
    const next = await response.json()
    if (!response.ok) { remember(''); throw new Error(next.error || 'Service restart failed.') }
    accept(next)
    remember(action === 'cancel' ? '' : next.instanceId)
    forceConfirmation.value = false
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Service restart failed.' }
  finally { inFlight = false; submitting.value = false; schedule() }
}
onMounted(() => { void refresh() })
onUnmounted(() => { disposed = true; clearTimeout(timer) })
</script>
