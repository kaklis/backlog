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
