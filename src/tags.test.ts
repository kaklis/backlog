import { describe, expect, it } from 'vitest'
import { cleanTag, tagHue } from './tags'

describe('tags', () => {
  it('derives a stable hue from the name, ignoring case', () => {
    expect(tagHue('bug')).toBe(tagHue('bug'))
    expect(tagHue('Bug')).toBe(tagHue('bug'))
    expect(tagHue('bug')).toBeGreaterThanOrEqual(0)
    expect(tagHue('bug')).toBeLessThan(360)
  })

  it('gives different tags different hues (usually)', () => {
    expect(tagHue('bug')).not.toBe(tagHue('feature'))
  })

  it('cleans user input', () => {
    expect(cleanTag('  bug ')).toBe('bug')
    expect(cleanTag('##urgent')).toBe('urgent')
    expect(cleanTag('  # ')).toBe('')
  })
})
