import { describe, it, expect } from 'vitest'

const { aggregate, defaultDetail } = require('../../server/aggregation')

function makeHelpers(people) {
  return {
    getPeopleByTeam: function(team) {
      return people.filter(function(p) {
        var g = p._teamGrouping || ''
        return g.split(',').map(function(t) { return t.trim() }).indexOf(team) >= 0
      })
    },
    getDirectReports: function(uid) {
      return people.filter(function(p) { return p.managerUid === uid })
    },
    getPeopleByOrg: function(orgRoot) {
      return people.filter(function(p) { return p.orgRoot === orgRoot })
    }
  }
}

var testPeople = [
  { uid: 'bsmith', name: 'Bob Smith', managerUid: 'achen', orgRoot: 'achen', _teamGrouping: 'Platform', status: 'active' },
  { uid: 'cwilliams', name: 'Carol Williams', managerUid: 'achen', orgRoot: 'achen', _teamGrouping: 'Platform', status: 'active' },
  { uid: 'dlee', name: 'David Lee', managerUid: 'achen', orgRoot: 'achen', _teamGrouping: 'Infrastructure', status: 'active' },
]

var testUpdates = {
  'bsmith/2026-04-27': {
    uid: 'bsmith', personName: 'Bob Smith', sentiment: 'yellow',
    highlights: [{ text: 'Shipped auth' }],
    blockers: [{ text: 'Staging down', severity: 'high', resolved: false }],
    plans: [], tags: []
  },
  'cwilliams/2026-04-27': {
    uid: 'cwilliams', personName: 'Carol Williams', sentiment: 'green',
    highlights: [{ text: 'Rate limiting design' }],
    blockers: [], plans: [], tags: []
  }
}

function readUpdate(uid, periodEnd) {
  return testUpdates[uid + '/' + periodEnd] || null
}

describe('defaultDetail', () => {
  it('returns full for small groups', () => { expect(defaultDetail(5)).toBe('full') })
  it('returns summary for medium groups', () => { expect(defaultDetail(15)).toBe('summary') })
  it('returns stats for large groups', () => { expect(defaultDetail(30)).toBe('stats') })
})

describe('aggregate', () => {
  it('aggregates by team axis', () => {
    var result = aggregate({
      axis: 'team', value: 'Platform', periodEnd: '2026-04-27',
      readUpdate: readUpdate,
      registryHelpers: makeHelpers(testPeople)
    })
    expect(result.total).toBe(2)
    expect(result.submitted).toBe(2)
    expect(result.sentiment.green).toBe(1)
    expect(result.sentiment.yellow).toBe(1)
  })

  it('aggregates by management axis', () => {
    var result = aggregate({
      axis: 'management', value: 'achen', periodEnd: '2026-04-27',
      readUpdate: readUpdate,
      registryHelpers: makeHelpers(testPeople)
    })
    expect(result.total).toBe(3)
    expect(result.submitted).toBe(2)
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0].uid).toBe('dlee')
  })

  it('collects unresolved blockers', () => {
    var result = aggregate({
      axis: 'management', value: 'achen', periodEnd: '2026-04-27',
      readUpdate: readUpdate,
      registryHelpers: makeHelpers(testPeople)
    })
    expect(result.unresolvedBlockers).toHaveLength(1)
    expect(result.unresolvedBlockers[0].person).toBe('Bob Smith')
  })

  it('supports summary detail with expanded/collapsed', () => {
    var result = aggregate({
      axis: 'management', value: 'achen', periodEnd: '2026-04-27',
      detail: 'summary',
      readUpdate: readUpdate,
      registryHelpers: makeHelpers(testPeople)
    })
    expect(result.detail).toBe('summary')
    expect(result.expanded).toBeDefined()
    expect(result.collapsedCount).toBeDefined()
    // Bob (yellow + blocker) and dlee (missing) should rank higher than Carol (green)
    expect(result.expanded[0].uid).not.toBe('cwilliams')
  })

  it('supports stats detail with topSignals', () => {
    var result = aggregate({
      axis: 'management', value: 'achen', periodEnd: '2026-04-27',
      detail: 'stats',
      readUpdate: readUpdate,
      registryHelpers: makeHelpers(testPeople)
    })
    expect(result.detail).toBe('stats')
    expect(result.topSignals).toBeDefined()
    expect(result.topSignals.length).toBeLessThanOrEqual(3)
    expect(result.updates).toBeUndefined()
  })

  it('supports groupBy=team', () => {
    var result = aggregate({
      axis: 'management', value: 'achen', periodEnd: '2026-04-27',
      groupBy: 'team',
      readUpdate: readUpdate,
      registryHelpers: makeHelpers(testPeople)
    })
    expect(result.groups).toBeDefined()
    expect(result.groups.length).toBe(2)
    var platformGroup = result.groups.find(function(g) { return g.team === 'Platform' })
    expect(platformGroup.total).toBe(2)
    var infraGroup = result.groups.find(function(g) { return g.team === 'Infrastructure' })
    expect(infraGroup.total).toBe(1)
  })

  it('supports org axis', () => {
    var result = aggregate({
      axis: 'org', value: 'achen', periodEnd: '2026-04-27',
      readUpdate: readUpdate,
      registryHelpers: makeHelpers(testPeople)
    })
    expect(result.total).toBe(3)
  })
})
