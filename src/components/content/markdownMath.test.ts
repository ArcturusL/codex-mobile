import katex from 'katex'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readDisplayMathBlock, renderMathToHtml, splitMathSegments } from './markdownMath'

afterEach(() => vi.restoreAllMocks())

describe('Markdown math', () => {
  it('splits all four delimiters while preserving surrounding Markdown and raw formulas', () => {
    const text = String.raw`**Result** $x^2$ and \(\frac{a}{b}\).
$$\sum_{i=1}^n i$$
\[
\begin{pmatrix}a & b \\ c & d\end{pmatrix}
\]`
    const segments = splitMathSegments(text)
    expect(segments.filter((segment) => segment.kind === 'math')).toEqual([
      { kind: 'math', value: 'x^2', displayMode: false, raw: '$x^2$' },
      { kind: 'math', value: String.raw`\frac{a}{b}`, displayMode: false, raw: String.raw`\(\frac{a}{b}\)` },
      { kind: 'math', value: String.raw`\sum_{i=1}^n i`, displayMode: true, raw: String.raw`$$\sum_{i=1}^n i$$` },
      { kind: 'math', value: '\n' + String.raw`\begin{pmatrix}a & b \\ c & d\end{pmatrix}` + '\n', displayMode: true,
        raw: String.raw`\[
\begin{pmatrix}a & b \\ c & d\end{pmatrix}
\]` },
    ])
    expect(segments.map((segment) => segment.kind === 'math' ? segment.raw : segment.value).join('')).toBe(text)
  })

  it('preserves prices, escaped delimiters, empty and unfinished formulas', () => {
    for (const text of [String.raw`Cost $5 and $10.`, String.raw`\$x\$ and \\(y\\)`, '$ x $', '$$', '$x +', '$$\nx + $y$', String.raw`\[x +`, String.raw`\(x + $y$`]) {
      expect(splitMathSegments(text)).toEqual([{ kind: 'text', value: text }])
    }
    expect(splitMathSegments('Cost $5 and $10; formula $x$.').filter((segment) => segment.kind === 'math'))
      .toEqual([{ kind: 'math', value: 'x', displayMode: false, raw: '$x$' }])
    expect(splitMathSegments(String.raw`$a\$b$`)).toEqual([
      { kind: 'math', value: String.raw`a\$b`, displayMode: false, raw: String.raw`$a\$b$` },
    ])
  })

  it('does not pair currency dollars with dollars inside code or links, including streaming prefixes', () => {
    const text = String.raw`Literal money: \$5, $10 and $20. Inline code: ` + '`$x^2$`'
    for (let length = 1; length <= text.length; length += 1) {
      const prefix = text.slice(0, length)
      expect(splitMathSegments(prefix)).toEqual([{ kind: 'text', value: prefix }])
    }
    const linked = 'Money $20. [$label$](https://example.com/$target$)'
    expect(splitMathSegments(linked)).toEqual([{ kind: 'text', value: linked }])
    const mixed = text + ' Formula $x^2$; more money $30 and $40. Then \\(y\\).'
    expect(splitMathSegments(mixed).filter((segment) => segment.kind === 'math')).toEqual([
      { kind: 'math', value: 'x^2', displayMode: false, raw: '$x^2$' },
      { kind: 'math', value: 'y', displayMode: false, raw: '\\(y\\)' },
    ])
  })

  it('skips inline code, fenced code, and link labels and targets', () => {
    const text = '`$code$` `` `\\(code\\)` ``\n```tex\n$$code$$\n```\n~~~\n\\[code\\]\n~~~\n'
      + '[$label$](https://example.com/$target$(nested)) ![$alt$](/tmp/$name$.png) [$ref$][key] $x$'
    expect(splitMathSegments(text)).toEqual([
      { kind: 'text', value: text.slice(0, -3) },
      { kind: 'math', value: 'x', displayMode: false, raw: '$x$' },
    ])
    expect(splitMathSegments('```tex\n$x$')).toEqual([{ kind: 'text', value: '```tex\n$x$' }])
    expect(splitMathSegments('[outer [nested $label$](url) $x$')).toEqual([
      { kind: 'text', value: '[outer [nested $label$](url) ' },
      { kind: 'math', value: 'x', displayMode: false, raw: '$x$' },
    ])
    expect(splitMathSegments('['.repeat(30000) + '$x$')).toEqual([
      { kind: 'text', value: '['.repeat(30000) },
      { kind: 'math', value: 'x', displayMode: false, raw: '$x$' },
    ])
  })

  it('reads display blocks without consuming the following paragraph or misreading inline math', () => {
    expect(readDisplayMathBlock(['$$x^2$$', 'following paragraph'], 0)).toEqual({ value: 'x^2', nextIndex: 1 })
    expect(readDisplayMathBlock(['before', '\\[', 'a | b', '\\\\ c & d', '\\]', 'after'], 1))
      .toEqual({ value: '\na | b\n\\\\ c & d\n', nextIndex: 5 })
    expect(readDisplayMathBlock(['  $$', 'x^2', '$$', 'after'], 0)).toEqual({ value: '\nx^2\n', nextIndex: 3 })
    for (const lines of [['$$x$$ trailing text'], ['text $$x$$'], ['    $$x$$'], ['\\[', 'x'], ['\\[', 'x', '\\[', 'y', '\\]']]) {
      expect(readDisplayMathBlock(lines, 0)).toBeNull()
    }
  })

  it('renders accessible inline and display math and contains invalid or untrusted input', () => {
    const inline = renderMathToHtml(String.raw`\frac{1}{2}`, false)
    expect(inline).toContain('class="katex"')
    expect(inline).toContain('<math')
    expect(inline).not.toContain('class="katex-display"')
    expect(renderMathToHtml('x^2', true)).toContain('class="katex-display"')
    expect(renderMathToHtml(String.raw`\frac{<img src=x onerror=alert(1)>`, false)).not.toContain('<img')
    expect(renderMathToHtml(String.raw`\href{javascript:alert(1)}{click}`, false)).not.toContain('<a ')
    expect(renderMathToHtml(String.raw`\includegraphics{https://example.com/a.png}`, false)).not.toContain('<img')
  })

  it('escapes fallback output and caches by formula and display mode within a bounded cache', () => {
    const render = vi.spyOn(katex, 'renderToString').mockImplementation((value) => `<safe>${value}</safe>`)
    renderMathToHtml('cache-check', false)
    renderMathToHtml('cache-check', false)
    renderMathToHtml('cache-check', true)
    expect(render).toHaveBeenCalledTimes(2)
    expect(render).toHaveBeenCalledWith('cache-check', expect.objectContaining({
      trust: false, throwOnError: false, maxSize: 20, maxExpand: 1000,
    }))
    for (let index = 0; index < 250; index += 1) renderMathToHtml(`evict-${index}`, false)
    renderMathToHtml('cache-check', false)
    expect(render).toHaveBeenCalledTimes(253)
    render.mockImplementation(() => { throw new Error('invalid input') })
    expect(renderMathToHtml('<script>"&\'</script>', false))
      .toBe('<span class="katex-error">&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;</span>')
  })
})
