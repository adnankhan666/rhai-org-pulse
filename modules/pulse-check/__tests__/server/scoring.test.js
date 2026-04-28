import { describe, it, expect } from 'vitest'

const { scoreUpdate, rankItems, splitByAttentionBudget } = require('../../server/scoring')

describe('scoreUpdate', () => {
  it('scores a missing submission', () => {
    var result = scoreUpdate(null, {})
    expect(result.score).toBeGreaterThanOrEqual(5)
    expect(result.reasons).toContain('missing')
  })

  it('adds bonus for missing manager', () => {
    var base = scoreUpdate(null, {})
    var manager = scoreUpdate(null, { isManager: true })
    expect(manager.score).toBeGreaterThan(base.score)
    expect(manager.reasons).toContain('missing-manager')
  })

  it('scores red sentiment high', () => {
    var result = scoreUpdate({ sentiment: 'red', blockers: [] }, {})
    expect(result.score).toBeGreaterThanOrEqual(10)
    expect(result.reasons).toContain('red')
  })

  it('scores green sentiment as zero', () => {
    var result = scoreUpdate({ sentiment: 'green', blockers: [] }, {})
    expect(result.score).toBe(0)
  })

  it('scores yellow sentiment low', () => {
    var result = scoreUpdate({ sentiment: 'yellow', blockers: [] }, {})
    expect(result.score).toBeGreaterThanOrEqual(2)
    expect(result.reasons).toContain('yellow')
  })

  it('adds bonus when yellow shifted from green', () => {
    var base = scoreUpdate({ sentiment: 'yellow', blockers: [] }, {})
    var shifted = scoreUpdate({ sentiment: 'yellow', blockers: [] }, { previousSentiment: 'green' })
    expect(shifted.score).toBeGreaterThan(base.score)
    expect(shifted.reasons).toContain('shifted-from-green')
  })

  it('scores unresolved blockers', () => {
    var result = scoreUpdate({
      sentiment: 'green',
      blockers: [{ text: 'stuck', resolved: false }]
    }, {})
    expect(result.score).toBeGreaterThanOrEqual(4)
    expect(result.reasons).toContain('blocker')
  })

  it('ignores resolved blockers', () => {
    var result = scoreUpdate({
      sentiment: 'green',
      blockers: [{ text: 'was stuck', resolved: true }]
    }, {})
    expect(result.score).toBe(0)
  })

  it('adds age bonus for old blockers', () => {
    var fresh = scoreUpdate({
      sentiment: 'green',
      blockers: [{ text: 'stuck', resolved: false, ageWeeks: 0 }]
    }, {})
    var old = scoreUpdate({
      sentiment: 'green',
      blockers: [{ text: 'stuck', resolved: false, ageWeeks: 3 }]
    }, {})
    expect(old.score).toBeGreaterThan(fresh.score)
  })

  it('adds bonus for high severity blocker', () => {
    var medium = scoreUpdate({
      sentiment: 'green',
      blockers: [{ text: 'stuck', resolved: false, severity: 'medium' }]
    }, {})
    var high = scoreUpdate({
      sentiment: 'green',
      blockers: [{ text: 'stuck', resolved: false, severity: 'high' }]
    }, {})
    expect(high.score).toBeGreaterThan(medium.score)
  })
})

describe('rankItems', () => {
  it('ranks red above green', () => {
    var items = [
      { uid: 'a', name: 'A', update: { sentiment: 'green', blockers: [] } },
      { uid: 'b', name: 'B', update: { sentiment: 'red', blockers: [] } },
    ]
    var ranked = rankItems(items)
    expect(ranked[0].uid).toBe('b')
  })

  it('ranks missing above green', () => {
    var items = [
      { uid: 'a', name: 'A', update: { sentiment: 'green', blockers: [] } },
      { uid: 'b', name: 'B', update: null },
    ]
    var ranked = rankItems(items)
    expect(ranked[0].uid).toBe('b')
    expect(ranked[0].isMissing).toBe(true)
  })
})

describe('splitByAttentionBudget', () => {
  it('splits into expanded and collapsed', () => {
    var items = [
      { uid: 'a', score: 12 },
      { uid: 'b', score: 8 },
      { uid: 'c', score: 5 },
      { uid: 'd', score: 2 },
      { uid: 'e', score: 1 },
      { uid: 'f', score: 0 },
      { uid: 'g', score: 0 },
    ]
    var result = splitByAttentionBudget(items, 3)
    expect(result.expanded.length).toBeGreaterThanOrEqual(3)
    // Items with score >= 3 should also be expanded
    expect(result.expanded.some(function(i) { return i.uid === 'c' })).toBe(true)
    expect(result.collapsed.length).toBeGreaterThan(0)
  })
})
