import { describe, it, expect } from 'vitest'

const { getWeekBounds, getCurrentPeriod, listPeriods, isValidPeriodEnd } = require('../../server/periods')

describe('getWeekBounds', () => {
  it('returns Monday–Sunday for a Wednesday', () => {
    const result = getWeekBounds(new Date('2026-04-22T12:00:00Z')) // Wednesday
    expect(result.periodStart).toBe('2026-04-20')
    expect(result.periodEnd).toBe('2026-04-26')
  })

  it('returns same week for a Monday', () => {
    const result = getWeekBounds(new Date('2026-04-20T00:00:00Z')) // Monday
    expect(result.periodStart).toBe('2026-04-20')
    expect(result.periodEnd).toBe('2026-04-26')
  })

  it('returns same week for a Sunday', () => {
    const result = getWeekBounds(new Date('2026-04-26T23:59:00Z')) // Sunday
    expect(result.periodStart).toBe('2026-04-20')
    expect(result.periodEnd).toBe('2026-04-26')
  })
})

describe('getCurrentPeriod', () => {
  it('returns an object with periodStart and periodEnd', () => {
    const result = getCurrentPeriod()
    expect(result).toHaveProperty('periodStart')
    expect(result).toHaveProperty('periodEnd')
    expect(result.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.periodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('listPeriods', () => {
  it('returns the requested number of periods', () => {
    const result = listPeriods(4)
    expect(result).toHaveLength(4)
  })

  it('periods are in reverse chronological order', () => {
    const result = listPeriods(3)
    expect(result[0].periodEnd >= result[1].periodEnd).toBe(true)
    expect(result[1].periodEnd >= result[2].periodEnd).toBe(true)
  })
})

describe('isValidPeriodEnd', () => {
  it('accepts a valid Sunday date', () => {
    expect(isValidPeriodEnd('2026-04-26')).toBe(true)
  })

  it('rejects a non-Sunday date', () => {
    expect(isValidPeriodEnd('2026-04-25')).toBe(false) // Saturday
  })

  it('rejects invalid format', () => {
    expect(isValidPeriodEnd('not-a-date')).toBe(false)
    expect(isValidPeriodEnd('2026/04/26')).toBe(false)
  })
})
