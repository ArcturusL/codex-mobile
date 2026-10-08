// Accept ISO strings and the seconds/milliseconds used by app-server events.
export function toMessageTimestamp(value: unknown): string | undefined {
  const milliseconds = typeof value === 'number'
    ? (value < 1e12 ? value * 1000 : value)
    : typeof value === 'string' && value.trim() ? Date.parse(value) : NaN
  const date = new Date(milliseconds)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}
