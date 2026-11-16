// Tags are plain strings; their color is derived from the name so no tag registry is needed.
export function tagHue(tag: string): number {
  let h = 0
  for (const ch of tag.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

/** Normalizes user input into a tag (trimmed, no leading #), or '' if empty. */
export const cleanTag = (raw: string) => raw.trim().replace(/^#+/, '').trim()
