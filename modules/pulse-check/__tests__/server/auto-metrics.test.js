import { describe, it, expect } from 'vitest'

const { getAutoMetrics } = require('../../server/auto-metrics')

function makeStorage(files) {
  return {
    readFromStorage(key) {
      return files[key] || null
    }
  }
}

describe('getAutoMetrics', () => {
  it('returns jira metrics filtered by period', () => {
    const storage = makeStorage({
      'people/alice_chen.json': {
        resolved: {
          count: 3,
          issues: [
            { key: 'TEST-1', summary: 'Fix bug', storyPoints: 3, resolutionDate: '2026-04-21T10:00:00+00:00' },
            { key: 'TEST-2', summary: 'Add feature', storyPoints: 5, resolutionDate: '2026-04-23T10:00:00+00:00' },
            { key: 'TEST-3', summary: 'Old fix', storyPoints: 2, resolutionDate: '2026-04-10T10:00:00+00:00' },
          ]
        },
        inProgress: { count: 2 }
      }
    })

    const person = { name: 'Alice Chen', github: { username: 'alicechen' }, gitlab: null }
    const result = getAutoMetrics(storage, person, '2026-04-20', '2026-04-26')

    expect(result.jira.resolvedCount).toBe(2)
    expect(result.jira.storyPoints).toBe(8)
    expect(result.jira.inProgressCount).toBe(2)
    expect(result.jira.topIssues).toHaveLength(2)
  })

  it('returns github contributions when username exists', () => {
    const storage = makeStorage({
      'github-contributions.json': {
        users: { alicechen: { totalContributions: 42 } }
      }
    })

    const person = { name: 'Test', github: { username: 'alicechen' }, gitlab: null }
    const result = getAutoMetrics(storage, person, '2026-04-20', '2026-04-26')

    expect(result.github.contributions).toBe(42)
  })

  it('returns gitlab contributions when username exists', () => {
    const storage = makeStorage({
      'gitlab-contributions.json': {
        users: { alicegl: { totalContributions: 15 } }
      }
    })

    const person = { name: 'Test', github: null, gitlab: { username: 'alicegl' } }
    const result = getAutoMetrics(storage, person, '2026-04-20', '2026-04-26')

    expect(result.gitlab.contributions).toBe(15)
  })

  it('returns nulls when no data exists', () => {
    const storage = makeStorage({})
    const person = { name: 'Nobody', github: null, gitlab: null }
    const result = getAutoMetrics(storage, person, '2026-04-20', '2026-04-26')

    expect(result.jira).toBeNull()
    expect(result.github).toBeNull()
    expect(result.gitlab).toBeNull()
  })
})
