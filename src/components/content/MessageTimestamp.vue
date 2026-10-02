<template>
  <time v-if="timestamp" class="message-timestamp" :datetime="timestamp" :title="fullTime">{{ label }}</time>
  <span v-else class="message-timestamp" title="No timestamp recorded for this message">Time unknown</span>
</template>

<script lang="ts">
const formatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { toMessageTimestamp } from '../../shared/messageTimestamp'

const props = defineProps<{ value?: string }>()
const timestamp = computed(() => toMessageTimestamp(props.value))
const label = computed(() => timestamp.value ? formatter.format(new Date(timestamp.value)) : '')
const fullTime = computed(() => timestamp.value ? new Date(timestamp.value).toString() : '')
</script>
