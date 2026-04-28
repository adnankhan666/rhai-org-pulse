import { describe, it, expect } from 'vitest'

const { aggregate } = require('../../server/aggregation')

var testPeople = [
  { uid: 'bsmith', name: 'Bob Smith', managerUid: 'achen', orgRoot: 'achen', _teamGrouping: 'Platform', status: 'active' },
  { uid: 'gkim', name: 'Grace Kim', managerUid: 'fjohnson', orgRoot: 'fjohnson', _teamGrouping: 'ML Platform', status: 'active' },
]

var testUpdates = {
  'bsmith/2026-04-27': {
    uid: 'bsmith', personName: 'Bob Smith', sentiment: 'yellow',
    highlights: [{ text: 'Auth work' }],
    blockers: [{ text: 'Staging down', severity: 'high', resolved: false }],
    plans: [], tags: ['auth-migration']
  },
  'gkim/2026-04-27': {
    uid: 'gkim', personName: 'Grace Kim', sentiment: 'red',
    highlights: [],
    blockers: [{ text: 'Waiting on Platform API contract', severity: 'high', resolved: false }],
    plans: [], tags: ['auth-migration']
  }
}

function readUpdate(uid, periodEnd) {
  return testUpdates[uid + '/' + periodEnd] || null
}

function makeHelpers() {
  return {
    getPeopleByTeam: function() { return [] },
    getDirectReports: function(uid) {
      return testPeople.filter(function(p) { return p.managerUid === uid })
    },
    getPeopleByOrg: function() { return [] }
  }
}

describe('tag axis aggregation', () => {
  it('aggregates people who used a specific tag', () => {
    var result = aggregate({
      axis: 'tag',
      value: 'auth-migration',
      periodEnd: '2026-04-27',
      readUpdate: readUpdate,
      registryHelpers: makeHelpers(),
      tagPeople: testPeople
    })
    expect(result.total).toBe(2)
    expect(result.submitted).toBe(2)
    expect(result.sentiment.yellow).toBe(1)
    expect(result.sentiment.red).toBe(1)
    expect(result.unresolvedBlockers).toHaveLength(2)
  })

  it('groups tag results by team when groupBy=team', () => {
    var result = aggregate({
      axis: 'tag',
      value: 'auth-migration',
      periodEnd: '2026-04-27',
      groupBy: 'team',
      readUpdate: readUpdate,
      registryHelpers: makeHelpers(),
      tagPeople: testPeople
    })
    expect(result.groups).toBeDefined()
    expect(result.groups).toHaveLength(2)
    var platformGroup = result.groups.find(function(g) { return g.team === 'Platform' })
    expect(platformGroup.total).toBe(1)
    var mlGroup = result.groups.find(function(g) { return g.team === 'ML Platform' })
    expect(mlGroup.total).toBe(1)
  })

  it('collects cross-team blockers', () => {
    var result = aggregate({
      axis: 'tag',
      value: 'auth-migration',
      periodEnd: '2026-04-27',
      readUpdate: readUpdate,
      registryHelpers: makeHelpers(),
      tagPeople: testPeople
    })
    var persons = result.unresolvedBlockers.map(function(b) { return b.person })
    expect(persons).toContain('Bob Smith')
    expect(persons).toContain('Grace Kim')
  })
})
