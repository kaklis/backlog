import { describe, expect, it } from 'vitest'
import { dueStatus, formatDue, matchesDue, nextDue, todayString, toDateString, weekRange } from './dates'

// local-time constructors, so the tests do not depend on the machine's time zone
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h)

describe('toDateString / todayString', () => {
  it('formats local dates with zero padding', () => {
    expect(toDateString(day(2031, 3, 4))).toBe('2031-03-04')
    expect(todayString(day(2031, 12, 31, 23))).toBe('2031-12-31')
  })
})

describe('weekRange (Monday to Sunday)', () => {
  it('returns the week around a midweek day', () => {
    expect(weekRange(day(2031, 1, 15))).toEqual(['2031-01-13', '2031-01-19']) // Wed
  })
  it('starts on Monday', () => {
    expect(weekRange(day(2031, 1, 13))).toEqual(['2031-01-13', '2031-01-19'])
  })
  it('treats Sunday as the last day of the week, not the first', () => {
    expect(weekRange(day(2031, 1, 19))).toEqual(['2031-01-13', '2031-01-19'])
  })
  it('crosses month and year boundaries', () => {
    expect(weekRange(day(2031, 12, 31))).toEqual(['2031-12-29', '2032-01-04'])
  })
})

describe('matchesDue', () => {
  const now = day(2031, 1, 15) // Wednesday; week ends Sunday 2031-01-19

  it('"any" matches everything, including no date', () => {
    expect(matchesDue('any', undefined, now)).toBe(true)
    expect(matchesDue('any', '1999-01-01', now)).toBe(true)
  })

  it('"none" matches only cards without a due date', () => {
    expect(matchesDue('none', undefined, now)).toBe(true)
    expect(matchesDue('none', '2031-01-15', now)).toBe(false)
  })

  it('"overdue" is strictly before today', () => {
    expect(matchesDue('overdue', '2031-01-14', now)).toBe(true)
    expect(matchesDue('overdue', '2031-01-15', now)).toBe(false)
    expect(matchesDue('overdue', undefined, now)).toBe(false)
  })

  it('"today" matches only today', () => {
    expect(matchesDue('today', '2031-01-15', now)).toBe(true)
    expect(matchesDue('today', '2031-01-16', now)).toBe(false)
  })

  it('"week" runs from today to Sunday and excludes overdue and next week', () => {
    expect(matchesDue('week', '2031-01-15', now)).toBe(true)
    expect(matchesDue('week', '2031-01-19', now)).toBe(true)
    expect(matchesDue('week', '2031-01-14', now)).toBe(false) // earlier this week = overdue
    expect(matchesDue('week', '2031-01-20', now)).toBe(false) // next Monday
    expect(matchesDue('week', undefined, now)).toBe(false)
  })

  it('"week" on a Sunday is just that day', () => {
    const sunday = day(2031, 1, 19)
    expect(matchesDue('week', '2031-01-19', sunday)).toBe(true)
    expect(matchesDue('week', '2031-01-20', sunday)).toBe(false)
  })
})

describe('nextDue (recurring cards)', () => {
  const now = day(2031, 1, 15)

  it('daily and weekly advance from the due date', () => {
    expect(nextDue('2031-01-15', 'daily', now)).toBe('2031-01-16')
    expect(nextDue('2031-01-15', 'weekly', now)).toBe('2031-01-22')
    expect(nextDue('2031-01-20', 'weekly', now)).toBe('2031-01-27')
  })

  it('monthly keeps the day of the month', () => {
    expect(nextDue('2031-01-20', 'monthly', now)).toBe('2031-02-20')
    expect(nextDue('2031-12-20', 'monthly', day(2031, 12, 1))).toBe('2032-01-20')
  })

  it('monthly clamps to the end of shorter months without drifting', () => {
    expect(nextDue('2031-01-31', 'monthly', day(2031, 1, 31))).toBe('2031-02-28')
    // a long-overdue Jan 31 card skips ahead; the anchor stays the 31st, so March gets the 31st again
    expect(nextDue('2031-01-31', 'monthly', day(2031, 3, 1))).toBe('2031-03-31')
    expect(nextDue('2032-01-31', 'monthly', day(2032, 1, 31))).toBe('2032-02-29') // leap year
  })

  it('skips occurrences that would already be in the past', () => {
    expect(nextDue('2031-01-01', 'daily', now)).toBe('2031-01-15')
    expect(nextDue('2031-01-01', 'weekly', now)).toBe('2031-01-15')
    expect(nextDue('2030-06-10', 'monthly', now)).toBe('2031-02-10') // Jan 10 is already past
  })

  it('without a due date counts from today', () => {
    expect(nextDue(undefined, 'daily', now)).toBe('2031-01-16')
    expect(nextDue(undefined, 'weekly', now)).toBe('2031-01-22')
  })
})

describe('dueStatus / formatDue', () => {
  const now = day(2031, 1, 15)
  it('classifies dates relative to today', () => {
    expect(dueStatus('2031-01-14', now)).toBe('overdue')
    expect(dueStatus('2031-01-15', now)).toBe('today')
    expect(dueStatus('2031-01-16', now)).toBe('tomorrow')
    expect(dueStatus('2031-01-17', now)).toBe('later')
  })
  it('knows tomorrow across a month end', () => {
    expect(dueStatus('2031-02-01', day(2031, 1, 31))).toBe('tomorrow')
  })
  it('labels imminent dates in words', () => {
    expect(formatDue('2031-01-15', now)).toBe('Today')
    expect(formatDue('2031-01-16', now)).toBe('Tomorrow')
    // other dates use the viewer's locale
    expect(formatDue('2031-01-20', now)).toBe(new Date(2031, 0, 20).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
  })
})
