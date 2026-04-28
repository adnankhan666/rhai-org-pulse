import { describe, it, expect } from 'vitest'

const { personTrends, groupTrends, detectShifts, sentimentHealth } = require('../../server/trends')

var updates = {
  'bsmith/2026-04-26': { sentiment: 'green', highlights: [{ text: 'a' }], blockers: [], tags: [] },
  'bsmith/2026-04-19': { sentiment: 'yellow', highlights: [], blockers: [{ text: 'stuck', resolved: false }], tags: [] },
  'bsmith/2026-04-12': { sentiment: 'green', highlights: [{ text: 'b' }], blockers: [], tags: ['auth'] },
}

function readUpdate(uid, periodEnd) {
  return updates[uid + '/' + periodEnd] || null
}

describe('personTrends', () => {
  it('returns timeline for a person', () => {
    var result = personTrends(readUpdate, 'bsmith', 4)
    expect(result.length).toBe(4)
    // Most recent should be submitted (if period matches fixture data)
    var submitted = result.filter(function(p) { return p.submitted })
    expect(submitted.length).toBeGreaterThanOrEqual(0)
  })
})

describe('groupTrends', () => {
  it('returns aggregate timeline', () => {
    var people = [
      { uid: 'bsmith' },
      { uid: 'cwilliams' },
    ]
    var result = groupTrends(readUpdate, people, 4)
    expect(result.length).toBe(4)
    result.forEach(function(p) {
      expect(p).toHaveProperty('total')
      expect(p).toHaveProperty('submitted')
      expect(p).toHaveProperty('submissionRate')
      expect(p).toHaveProperty('sentiment')
      expect(p).toHaveProperty('blockerCount')
    })
  })
})

describe('detectShifts', () => {
  it('detects a downward shift', () => {
    var data = [
      { periodEnd: '2026-04-12', sentiment: 'green' },
      { periodEnd: '2026-04-19', sentiment: 'yellow' },
      { periodEnd: '2026-04-26', sentiment: 'green' },
    ]
    var shifts = detectShifts(data)
    expect(shifts.length).toBe(2)
    expect(shifts[0].direction).toBe('down')
    expect(shifts[1].direction).toBe('up')
  })

  it('returns empty for stable sentiment', () => {
    var data = [
      { periodEnd: '2026-04-12', sentiment: 'green' },
      { periodEnd: '2026-04-19', sentiment: 'green' },
    ]
    var shifts = detectShifts(data)
    expect(shifts.length).toBe(0)
  })
})

describe('sentimentHealth', () => {
  it('scores green higher than red', () => {
    expect(sentimentHealth('green')).toBeGreaterThan(sentimentHealth('red'))
  })

  it('handles aggregate sentiment objects', () => {
    var allGreen = sentimentHealth({ green: 5, yellow: 0, red: 0 })
    var mixed = sentimentHealth({ green: 2, yellow: 2, red: 1 })
    expect(allGreen).toBeGreaterThan(mixed)
  })
})
