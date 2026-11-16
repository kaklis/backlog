import { Fragment, type ReactNode } from 'react'

// A deliberately small Markdown subset for card notes: paragraphs, "- " / "1." lists, **bold**, *italic*, `code`,
// [links](https://…) and bare URLs. Output is built as React elements (never raw HTML), and only http(s) links are
// made clickable, so notes cannot inject markup or javascript: URLs.

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'b' | 'i'; children: Inline[] }
  | { t: 'code'; text: string }
  | { t: 'a'; href: string; children: Inline[] }
  | { t: 'br' }

export type Block =
  | { t: 'p'; lines: string[] }
  | { t: 'ul' | 'ol'; items: string[] }

const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    const last = blocks[blocks.length - 1]
    if (!line.trim()) {
      blocks.push({ t: 'p', lines: [] }) // blank line ends the current block
    } else if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol'
      const item = (bullet ?? numbered)![1]
      if (last && last.t === kind) last.items.push(item)
      else blocks.push({ t: kind, items: [item] })
    } else if (last && last.t === 'p') {
      last.lines.push(line.trim())
    } else {
      blocks.push({ t: 'p', lines: [line.trim()] })
    }
  }
  return blocks.filter((b) => (b.t === 'p' ? b.lines.length : b.items.length))
}

const TOKEN =
  /(`[^`\n]+`)|(\*\*[^\n]+?\*\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(\*[^*\s][^*\n]*?\*)|(\b_[^_\s][^_\n]*?_\b)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index!
    if (at > last) out.push({ t: 'text', text: text.slice(last, at) })
    const [tok] = m
    if (m[1]) out.push({ t: 'code', text: tok.slice(1, -1) })
    else if (m[2]) out.push({ t: 'b', children: parseInline(tok.slice(2, -2)) })
    else if (m[3]) {
      const close = tok.indexOf('](')
      out.push({ t: 'a', href: tok.slice(close + 2, -1), children: parseInline(tok.slice(1, close)) })
    } else if (m[4]) out.push({ t: 'a', href: tok, children: [{ t: 'text', text: tok }] })
    else out.push({ t: 'i', children: parseInline(tok.slice(1, -1)) })
    last = at + tok.length
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) })
  return out
}

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.text}</Fragment>
      case 'b':
        return <strong key={i}>{renderInline(n.children)}</strong>
      case 'i':
        return <em key={i}>{renderInline(n.children)}</em>
      case 'code':
        return <code key={i}>{n.text}</code>
      case 'br':
        return <br key={i} />
      case 'a':
        return (
          <a
            key={i}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            // links sit on draggable, clickable cards: don't start a drag or open the card
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {renderInline(n.children)}
          </a>
        )
    }
  })
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`md${className ? ` ${className}` : ''}`}>
      {parseBlocks(text).map((b, i) => {
        if (b.t === 'p') {
          return (
            <p key={i}>
              {b.lines.map((line, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {renderInline(parseInline(line))}
                </Fragment>
              ))}
            </p>
          )
        }
        const items = b.items.map((it, j) => <li key={j}>{renderInline(parseInline(it))}</li>)
        return b.t === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>
      })}
    </div>
  )
}
