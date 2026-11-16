import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Markdown, parseBlocks, parseInline } from './markdown'

describe('parseBlocks', () => {
  it('splits paragraphs on blank lines and keeps single line breaks within one', () => {
    expect(parseBlocks('one\ntwo\n\nthree')).toEqual([
      { t: 'p', lines: ['one', 'two'] },
      { t: 'p', lines: ['three'] },
    ])
  })

  it('reads bullet and numbered lists', () => {
    expect(parseBlocks('- a\n* b\n+ c')).toEqual([{ t: 'ul', items: ['a', 'b', 'c'] }])
    expect(parseBlocks('1. a\n2) b')).toEqual([{ t: 'ol', items: ['a', 'b'] }])
  })

  it('handles a list right after a paragraph, and text right after a list', () => {
    expect(parseBlocks('intro\n- a\n- b\noutro')).toEqual([
      { t: 'p', lines: ['intro'] },
      { t: 'ul', items: ['a', 'b'] },
      { t: 'p', lines: ['outro'] },
    ])
  })

  it('treats a blank line as the end of a list', () => {
    expect(parseBlocks('- a\n\n- b')).toEqual([
      { t: 'ul', items: ['a'] },
      { t: 'ul', items: ['b'] },
    ])
  })

  it('copes with empty input and windows line endings', () => {
    expect(parseBlocks('')).toEqual([])
    expect(parseBlocks('   \n\n')).toEqual([])
    expect(parseBlocks('a\r\nb')).toEqual([{ t: 'p', lines: ['a', 'b'] }])
  })
})

describe('parseInline', () => {
  const text = (t: string) => ({ t: 'text', text: t })

  it('parses bold, italic and code', () => {
    expect(parseInline('a **b** c')).toEqual([text('a '), { t: 'b', children: [text('b')] }, text(' c')])
    expect(parseInline('a *b* c')).toEqual([text('a '), { t: 'i', children: [text('b')] }, text(' c')])
    expect(parseInline('run `npm test` now')).toEqual([text('run '), { t: 'code', text: 'npm test' }, text(' now')])
  })

  it('does not format inside code', () => {
    expect(parseInline('`**x**`')).toEqual([{ t: 'code', text: '**x**' }])
  })

  it('parses markdown links and bare urls', () => {
    expect(parseInline('[docs](https://example.com/a?b=1)')).toEqual([
      { t: 'a', href: 'https://example.com/a?b=1', children: [text('docs')] },
    ])
    expect(parseInline('see https://example.com.')).toEqual([
      text('see '),
      { t: 'a', href: 'https://example.com', children: [text('https://example.com')] },
      text('.'),
    ])
  })

  it('does not turn javascript: or other schemes into links', () => {
    expect(parseInline('[x](javascript:alert(1))').some((n) => n.t === 'a')).toBe(false)
    expect(parseInline('[x](data:text/html,hi)').some((n) => n.t === 'a')).toBe(false)
  })

  it('leaves stray asterisks and underscores in words alone', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([text('2 * 3 = 6')])
    expect(parseInline('snake_case_name')).toEqual([text('snake_case_name')])
  })
})

describe('<Markdown>', () => {
  it('renders structure', () => {
    const { container } = render(<Markdown text={'Hello **world**\n\n- one\n- two'} />)
    expect(container.querySelector('strong')).toHaveTextContent('world')
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  it('opens links safely in a new tab', () => {
    render(<Markdown text="[docs](https://example.com)" />)
    const link = screen.getByRole('link', { name: 'docs' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('never renders raw HTML from notes', () => {
    const { container } = render(<Markdown text={'<img src=x onerror=alert(1)> <script>alert(1)</script>'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>')
  })
})
