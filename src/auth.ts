/**
 * Local passcode lock. Everything stays in the browser: only a salted PBKDF2 hash of the
 * passcode is stored (never the passcode itself). This gates the UI; it does not encrypt
 * the board data in localStorage.
 */

const KEY = 'backlog.auth'
const SESSION_KEY = 'backlog.unlocked'
const ITERATIONS = 200_000
export const MIN_LENGTH = 4

interface Stored {
  salt: string
  hash: string
  iterations: number
}

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (hex: string): Uint8Array<ArrayBuffer> => new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)))

async function derive(passcode: string, salt: BufferSource, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return toHex(bits)
}

function read(): Stored | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return v && typeof v.salt === 'string' && typeof v.hash === 'string' && typeof v.iterations === 'number' ? v : null
  } catch {
    return null
  }
}

export const hasPasscode = () => read() !== null

export async function setPasscode(passcode: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const stored: Stored = { salt: toHex(salt), hash: await derive(passcode, salt, ITERATIONS), iterations: ITERATIONS }
  localStorage.setItem(KEY, JSON.stringify(stored))
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const stored = read()
  if (!stored) return true
  const hash = await derive(passcode, fromHex(stored.salt), stored.iterations)
  // constant-time-ish comparison
  let diff = hash.length ^ stored.hash.length
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ (stored.hash.charCodeAt(i) || 0)
  return diff === 0
}

export function removePasscode(): void {
  localStorage.removeItem(KEY)
  clearSession()
}

/** The unlocked flag lives in sessionStorage, so a reload keeps you in but a new tab/browser session asks again. */
export const isSessionUnlocked = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}
export const markSessionUnlocked = () => {
  try {
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch {
    /* ignore */
  }
}
export const clearSession = () => {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}
