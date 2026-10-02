<template>
  <nav class="message-branch-switcher" aria-label="Message versions">
    <button type="button" aria-label="Previous message version" :disabled="disabled || control.selectedIndex <= 0"
      @click="emit('select', control.threadIds[control.selectedIndex - 1]!)">‹</button>
    <span aria-live="polite">{{ control.selectedIndex + 1 }}/{{ control.threadIds.length }}</span>
    <button type="button" aria-label="Next message version" :disabled="disabled || control.selectedIndex >= control.threadIds.length - 1"
      @click="emit('select', control.threadIds[control.selectedIndex + 1]!)">›</button>
  </nav>
</template>

<script setup lang="ts">
import type { MessageBranchControl } from '../../shared/messageBranches'
defineProps<{ control: MessageBranchControl; disabled?: boolean }>()
const emit = defineEmits<{ select: [threadId: string] }>()
</script>

<style scoped>
.message-branch-switcher { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: inherit; }
button { width: 24px; height: 24px; border: 0; border-radius: 4px; background: transparent; color: inherit; font-size: 20px; cursor: pointer; }
button:hover:enabled { background: color-mix(in srgb, currentColor 10%, transparent); }
button:disabled { opacity: 0.3; cursor: default; }
</style>
