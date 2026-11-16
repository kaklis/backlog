// Due dates are plain local calendar dates stored as "YYYY-MM-DD", so they compare correctly as strings.

export type DueFilter = 'any' | 'overdue' | 'today' | 'week' | 'none'

const pad = (n: number) => String(n).padStart(2, '0')

export const toDateString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const todayString = (now: Date = new Date()) => toDateString(now)

/** Monday-to-Sunday calendar week containing `now`, as [start, end] date strings. */
export function weekRange(now: Date = new Date()): [string, string] {
  const daysSinceMonday = (now.getDay() + 6) % 7
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  return [toDateString(start), toDateString(end)]
}

/** Does a card's due date pass the filter? */
export function matchesDue(filter: DueFilter, due: string | undefined, now: Date = new Date()): boolean {
  switch (filter) {
    case 'any':
      return true
    case 'none':
      return !due
    case 'overdue':
      return !!due && due < todayString(now)
    case 'today':
      return due === todayString(now)
    case 'week':
      // today through Sunday: earlier days of this week are already overdue
      return !!due && due >= todayString(now) && due <= weekRange(now)[1]
  }
}

export type Recurrence = 'daily' | 'weekly' | 'monthly'
export const RECURRENCES: Recurrence[] = ['daily', 'weekly', 'monthly']

const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// k months after `base`, clamping to the end of shorter months (Jan 31 + 1 month = Feb 28/29)
function addMonths(base: Date, k: number): Date {
  const target = new Date(base.getFullYear(), base.getMonth() + k, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return new Date(target.getFullYear(), target.getMonth(), Math.min(base.getDate(), lastDay))
}

/**
 * The next due date of a recurring card: the first occurrence after `due` (or today, without one) that is not in
 * the past. Occurrences are counted from the original date, so month-end clamping never drifts.
 */
export function nextDue(due: string | undefined, recurrence: Recurrence, now: Date = new Date()): string {
  const base = due ? parseDate(due) : new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const today = todayString(now)
  for (let k = 1; k <= 2000; k++) {
    const occurrence =
      recurrence === 'monthly'
        ? addMonths(base, k)
        : new Date(base.getFullYear(), base.getMonth(), base.getDate() + k * (recurrence === 'weekly' ? 7 : 1))
    const s = toDateString(occurrence)
    if (s >= today) return s
  }
  return todayString(now)
}

export type DueStatus = 'overdue' | 'today' | 'tomorrow' | 'later'

export function dueStatus(due: string, now: Date = new Date()): DueStatus {
  const today = todayString(now)
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  const tomorrow = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  return due === tomorrow ? 'tomorrow' : 'later'
}

/** "Today" / "Tomorrow" for imminent dates, otherwise a short date such as "Jan 15". */
export function formatDue(due: string, now: Date = new Date()): string {
  const status = dueStatus(due, now)
  if (status === 'today') return 'Today'
  if (status === 'tomorrow') return 'Tomorrow'
  return parseDate(due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
