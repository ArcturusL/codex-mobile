import katex from 'katex'

export type MathSegment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; value: string; displayMode: boolean; raw: string }

const renderedMathCache = new Map<string, string>()
const MATH_CACHE_LIMIT = 250

function balancedEnd(text: string, start: number, open: string, close: string, ends: Map<number, number>): number {
  const cached = ends.get(start)
  if (cached !== undefined) return cached
  const starts = [start]
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1
    else if (text[index] === open) starts.push(index)
    else if (text[index] === close) {
      ends.set(starts.pop()!, index + 1)
      if (!starts.length) return index + 1
    }
  }
  for (const unmatched of starts) ends.set(unmatched, -1)
  return -1
}

function markdownLinkEnd(text: string, start: number, bracketEnds: Map<number, number>): number {
  const labelEnd = balancedEnd(text, start, '[', ']', bracketEnds)
  const targetStart = labelEnd < 0 ? '' : text[labelEnd]
  return targetStart === '(' || targetStart === '['
    ? balancedEnd(text, labelEnd, targetStart, targetStart === '(' ? ')' : ']', bracketEnds)
    : -1
}

function codeEnd(text: string, start: number): number {
  const marker = text[start]!
  let length = 1
  while (text[start + length] === marker) length += 1
  const linePrefix = length >= 3 ? text.slice(text.lastIndexOf('\n', start - 1) + 1, start) : null
  if (linePrefix !== null && /^ {0,3}$/u.test(linePrefix)) {
    let lineStart = text.indexOf('\n', start)
    while (lineStart >= 0) {
      lineStart += 1
      const lineEnd = text.indexOf('\n', lineStart)
      const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd)
      const fence = line.match(/^ {0,3}(`{3,}|~{3,})[\t ]*\r?$/u)?.[1]
      if (fence?.[0] === marker && fence.length >= length) {
        return lineEnd < 0 ? text.length : lineEnd + 1
      }
      lineStart = lineEnd
    }
    return text.length
  }
  if (marker !== '`') return start + length
  const delimiter = marker.repeat(length)
  let closing = text.indexOf(delimiter, start + length)
  while (closing >= 0) {
    if (text[closing - 1] !== '`' && text[closing + length] !== '`') return closing + length
    closing = text.indexOf(delimiter, closing + length)
  }
  return text.length
}

function closingDelimiter(text: string, start: number, delimiter: string, bracketEnds?: Map<number, number>): number {
  for (let index = start; index < text.length; index += 1) {
    if (text.startsWith(delimiter, index)) {
      if (delimiter === '$' && (
        index === start || /\s/u.test(text[index - 1]!) || /[\d$]/u.test(text[index + 1] ?? '')
      )) return -1
      return index
    }
    if (delimiter === '$' && (
      text[index] === '`' ||
      (text[index] === '[' && bracketEnds && markdownLinkEnd(text, index, bracketEnds) >= 0)
    )) return -1
    if (text[index] === '\\') index += 1
    if (delimiter === '$' && text[index] === '\n') return -1
  }
  return -1
}

/** Leave Markdown intact so the existing renderer still owns links and code. */
export function splitMathSegments(text: string): MathSegment[] {
  if (!text.includes('$') && !/\\[([]/u.test(text)) return text ? [{ kind: 'text', value: text }] : []
  const segments: MathSegment[] = []
  const bracketEnds = new Map<number, number>()
  let textStart = 0
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === '`' || char === '~') {
      index = codeEnd(text, index)
      continue
    }
    if (char === '[') {
      const linkEnd = markdownLinkEnd(text, index, bracketEnds)
      if (linkEnd >= 0) {
        index = linkEnd
        continue
      }
    }

    const opening = text.startsWith('$$', index) ? '$$'
      : char === '$' ? '$'
      : text.startsWith('\\(', index) ? '\\('
      : text.startsWith('\\[', index) ? '\\['
      : ''
    if (!opening) {
      index += char === '\\' ? 2 : 1
      continue
    }
    const displayMode = opening === '$$' || opening === '\\['
    const closing = opening === '\\(' ? '\\)' : opening === '\\[' ? '\\]' : opening
    const contentStart = index + opening.length
    if (opening === '$' && /\s/u.test(text[contentStart] ?? ' ')) {
      index += 1
      continue
    }
    const end = closingDelimiter(text, contentStart, closing, bracketEnds)
    if (end < 0) {
      // No closing TeX delimiter remains; keep the unfinished formula literal.
      if (opening !== '$') break
      index += opening.length
      continue
    }
    const value = text.slice(contentStart, end)
    const nextIndex = end + closing.length
    if (value.trim()) {
      if (index > textStart) segments.push({ kind: 'text', value: text.slice(textStart, index) })
      segments.push({ kind: 'math', value, displayMode, raw: text.slice(index, nextIndex) })
      textStart = nextIndex
    }
    index = nextIndex
  }
  if (textStart < text.length) segments.push({ kind: 'text', value: text.slice(textStart) })
  return segments
}

export function readDisplayMathBlock(
  lines: string[],
  startIndex: number,
): { value: string; nextIndex: number } | null {
  const opening = lines[startIndex]?.match(/^ {0,3}(\$\$|\\\[)/u)
  if (!opening) return null
  const delimiter = opening[1] === '$$' ? '$$' : '\\]'
  const content: string[] = []
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index]!
    if (index > startIndex && delimiter === '\\]' && /^ {0,3}\\\[/u.test(line)) return null
    const start = index === startIndex ? opening[0].length : 0
    const end = closingDelimiter(line, start, delimiter)
    if (end >= 0) {
      if (line.slice(end + delimiter.length).trim()) return null
      content.push(line.slice(start, end))
      const value = content.join('\n')
      return value.trim() ? { value, nextIndex: index + 1 } : null
    }
    content.push(line.slice(start))
  }
  return null
}

export function renderMathToHtml(value: string, displayMode: boolean): string {
  const key = `${displayMode ? 'display' : 'inline'}:${value}`
  const cached = renderedMathCache.get(key)
  if (cached !== undefined) {
    renderedMathCache.delete(key)
    renderedMathCache.set(key, cached)
    return cached
  }
  let html: string
  try {
    html = katex.renderToString(value, {
      displayMode,
      trust: false,
      throwOnError: false,
      maxSize: 20,
      maxExpand: 1000,
    })
  } catch {
    const escaped = value.replace(/[&<>"']/gu, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]!)
    html = `<span class="katex-error">${escaped}</span>`
  }
  renderedMathCache.set(key, html)
  if (renderedMathCache.size > MATH_CACHE_LIMIT) {
    renderedMathCache.delete(renderedMathCache.keys().next().value!)
  }
  return html
}
