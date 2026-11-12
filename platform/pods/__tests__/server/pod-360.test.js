import { describe, it, expect } from 'vitest'
import { buildPod360 } from '../../server/pod-360.js'

function child(overrides) {
  return {
    key: 'X-1',
    summary: 'Child',
    status: 'In Progress',
    statusCategory: 'In Progress',
    assignee: 'Alice Chen',
    updated: '2026-11-10T00:00:00.000+0000',
    resolutionDate: null,
    ...overrides
  }
}

const pod = { id: 'pod_1', name: 'Orbit Pod' }
const members = [{ name: 'Alice Chen' }, { name: 'Bob Smith' }]

function mirrorWith(children) {
  return {
    key: 'RHAISTRAT-2191',
    summary: 'Selector parity',
    status: 'In Progress',
    assignee: 'Alice Chen',
    productManager: 'Jenny Yi',
    colorStatus: 'Green',
    fixVersion: '3.7 EA1 RHOAI RELEASE',
    releaseType: 'GA',
    asOf: '2026-11-10T22:40:19.039+0000',
    milestone: { codeFreezeDate: '2026-12-11' },
    children
  }
}

describe('pod 360', () => {
  it('summarizes the pod feature and its children', () => {
    const { markdown, data } = buildPod360({
      pod,
      members,
      today: '2026-11-12',
      mirror: mirrorWith([
        child({ key: 'A-1', status: 'Done', statusCategory: 'Done', resolutionDate: '2026-11-09T00:00:00.000+0000' }),
        child({ key: 'A-2' }),
        child({ key: 'A-3', status: 'In Review' }),
        child({ key: 'A-4', status: 'To Do', statusCategory: 'To Do', assignee: null, updated: '2026-10-01T00:00:00.000+0000' })
      ])
    })

    expect(data.snapshot).toEqual({
      total: 4,
      inProgress: 2,
      inReview: 1,
      done: 1,
      staleCount: 1,
      completed7d: 1
    })
    expect(data.risks.staleItems).toEqual(['A-4'])
    expect(data.risks.unassigned).toEqual(['A-4'])
    expect(data.stratFeatures).toEqual([{ key: 'RHAISTRAT-2191', summary: 'Selector parity', color: 'Green' }])
    expect(data.capacity).toEqual([
      { person: 'Alice Chen', inProgress: 2, inReview: 1, total: 3 },
      { person: 'Bob Smith', inProgress: 0, inReview: 0, total: 0 }
    ])

    expect(markdown).toContain('# Orbit Pod — 360 — 2026-11-12')
    expect(markdown).toContain('## Snapshot')
    expect(markdown).toContain('| Stale (>14d) | 1 |')
    expect(markdown).toContain('## Capacity')
    expect(markdown).toContain('## Not collected')
  })

  it('flags review bottlenecks and overload', () => {
    const stuck = child({ key: 'B-1', status: 'In Review', updated: '2026-11-01T00:00:00.000+0000' })
    const heavy = [1, 2, 3, 4].map(index => child({ key: `C-${index}` }))

    const { data } = buildPod360({
      pod,
      members,
      today: '2026-11-12',
      mirror: mirrorWith([stuck, ...heavy])
    })

    expect(data.risks.reviewBottlenecks).toEqual(['B-1'])
    expect(data.risks.overloaded).toEqual(['Alice Chen'])
  })

  it('is explicit when no feature is linked', () => {
    const { markdown, data } = buildPod360({ pod, members, today: '2026-11-12', mirror: null })

    expect(data.feature).toBeNull()
    expect(data.snapshot.total).toBe(0)
    expect(markdown).toContain('none linked')
    expect(markdown).toContain('| Child items | 0 |')
  })

  it('records the sections it cannot fill yet', () => {
    const { data } = buildPod360({ pod, members, today: '2026-11-12', mirror: mirrorWith([]) })
    expect(data.activityTypeRatio).toBeNull()
    expect(data.prStatus).toBeNull()
    expect(data.notCollected).toHaveLength(2)
  })

  it('names child owners who are not in the pod', () => {
    const { markdown, data } = buildPod360({
      pod,
      members,
      today: '2026-11-12',
      mirror: mirrorWith([child({ key: 'D-1', assignee: 'Purva Naik' })])
    })

    expect(data.outsideOwners).toEqual(['Purva Naik'])
    expect(markdown).toContain('people outside this pod: Purva Naik')
  })
})
