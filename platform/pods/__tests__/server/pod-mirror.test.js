import { describe, it, expect } from 'vitest'
import {
  primaryFocusKey,
  deriveProgress,
  computeAttention,
  parseVersionName,
  resolveMilestone,
  buildMirrors,
  validateFeatureKeys,
  BEHIND_THRESHOLD_PCT
} from '../../server/pod-mirror.js'

function child(category) {
  return { key: 'X-1', fields: { status: { name: category, statusCategory: { name: category } } } }
}

describe('pod work mirror', () => {
  describe('primaryFocusKey', () => {
    it('picks the first key that looks like a Jira issue key', () => {
      expect(primaryFocusKey({ focusKeys: ['notes', 'RHAISTRAT-2191'] })).toBe('RHAISTRAT-2191')
    })

    it('returns null when no focus key is a Jira key', () => {
      expect(primaryFocusKey({ focusKeys: ['something else'] })).toBeNull()
      expect(primaryFocusKey({})).toBeNull()
    })
  })

  describe('deriveProgress', () => {
    it('rolls children up by status category', () => {
      const progress = deriveProgress([
        child('Done'), child('Done'), child('Done'), child('Done'),
        child('In Progress'), child('In Progress'),
        child('To Do')
      ])
      expect(progress).toEqual({
        done: 4,
        inProgress: 2,
        todo: 1,
        other: 0,
        total: 7,
        pct: 57
      })
    })

    it('returns a null percentage when there is no child work', () => {
      expect(deriveProgress([]).pct).toBeNull()
      expect(deriveProgress(undefined).total).toBe(0)
    })
  })

  describe('computeAttention', () => {
    const base = { startDate: '2026-10-23', codeFreezeDate: '2026-12-11', today: '2026-11-12' }

    it('flags work as behind when delivery lags elapsed time', () => {
      // 20 of 49 days elapsed is ~41%; 10% done is well past the threshold.
      const result = computeAttention({ ...base, progressPct: 10 })
      expect(result.elapsedPct).toBe(41)
      expect(result.deltaPct).toBe(-31)
      expect(result.state).toBe('behind')
      expect(result.daysToFreeze).toBe(29)
    })

    it('treats a small lag as on track', () => {
      const result = computeAttention({ ...base, progressPct: 41 - (BEHIND_THRESHOLD_PCT - 1) })
      expect(result.state).toBe('on_track')
    })

    it('reports delivered once everything is done', () => {
      expect(computeAttention({ ...base, progressPct: 100 }).state).toBe('delivered')
    })

    it('reports overdue past the code freeze', () => {
      const result = computeAttention({
        startDate: '2026-10-23',
        codeFreezeDate: '2026-12-11',
        today: '2026-12-20',
        progressPct: 80
      })
      expect(result.daysToFreeze).toBe(-9)
      expect(result.state).toBe('overdue')
    })

    it('stays unknown without a code freeze date', () => {
      const result = computeAttention({
        startDate: '2026-10-23',
        codeFreezeDate: null,
        today: '2026-11-12',
        progressPct: 44
      })
      expect(result.state).toBe('unknown')
      expect(result.deltaPct).toBeNull()
    })
  })

  describe('parseVersionName', () => {
    it('extracts version and phase from Jira version names', () => {
      expect(parseVersionName('3.7 EA1 RHOAI RELEASE')).toEqual({ version: '3.7', phase: 'EA1' })
      expect(parseVersionName('3.7 GA RHOAI RELEASE')).toEqual({ version: '3.7', phase: 'GA' })
      expect(parseVersionName('rhai-3.7.EA1')).toEqual({ version: '3.7', phase: 'EA1' })
    })

    it('returns null when no version is present', () => {
      expect(parseVersionName('rhai-3.7')).toEqual({ version: '3.7', phase: null })
      expect(parseVersionName('backlog')).toBeNull()
      expect(parseVersionName(null)).toBeNull()
    })
  })

  describe('resolveMilestone', () => {
    const releases = [
      { productName: 'rhoai', releaseNumber: 'rhoai-3.6.EA1', dueDate: '2026-09-17', codeFreezeDate: null },
      { productName: 'rhai', releaseNumber: 'rhai-3.7.EA1', dueDate: '2027-01-20', codeFreezeDate: '2026-12-11', planningFreezeDate: '2026-11-11' },
      { productName: 'rhai', releaseNumber: 'rhai-3.7.EA2', dueDate: '2027-01-13', codeFreezeDate: null }
    ]

    it('matches on version and phase, not on the full string', () => {
      const match = resolveMilestone(releases, '3.7 EA1 RHOAI RELEASE')
      expect(match.releaseNumber).toBe('rhai-3.7.EA1')
      expect(match.codeFreezeDate).toBe('2026-12-11')
      expect(match.dueDate).toBe('2027-01-20')
    })

    it('prefers the entry that carries a code freeze date', () => {
      const duplicates = [
        { productName: 'rhai', releaseNumber: 'rhai-3.7.EA2', dueDate: '2027-01-13', codeFreezeDate: '2026-12-04' },
        { productName: 'rhoai', releaseNumber: 'rhoai-3.7.EA2', dueDate: '2027-01-13', codeFreezeDate: null }
      ]
      const match = resolveMilestone(duplicates, '3.7 EA2 RHOAI RELEASE')
      expect(match.releaseNumber).toBe('rhai-3.7.EA2')
      expect(match.codeFreezeDate).toBe('2026-12-04')
    })

    it('returns null when nothing matches', () => {
      expect(resolveMilestone(releases, '3.9 EA1 RHOAI RELEASE')).toBeNull()
      expect(resolveMilestone(releases, null)).toBeNull()
    })
  })

  describe('buildMirrors', () => {
    function featureIssue(key, summary, created) {
      return {
        key,
        fields: {
          summary,
          created,
          status: { name: 'In Progress', statusCategory: { name: 'In Progress' } },
          issuetype: { name: 'Feature' },
          assignee: { displayName: 'Andy Stoneberg' },
          customfield_10469: { displayName: 'Jenny Yi' },
          customfield_10855: [{ name: '3.7 EA1 RHOAI RELEASE' }],
          fixVersions: [{ name: '3.7 EA1 RHOAI RELEASE' }],
          labels: ['a', 'b'],
          components: []
        }
      }
    }

    function childIssue(key, parentKey, category) {
      return {
        key,
        fields: {
          summary: key,
          parent: { key: parentKey },
          project: { key: 'RHOAIENG' },
          status: { name: category, statusCategory: { name: category } },
          assignee: null
        }
      }
    }

    it('resolves many features in two Jira queries', async () => {
      const calls = []
      const jira = {
        fetchAllJqlResults: async (jql) => {
          calls.push(jql)
          if (jql.startsWith('key in')) {
            return [featureIssue('A-1', 'First', '2026-10-23'), featureIssue('B-2', 'Second', '2026-10-23')]
          }
          return [
            childIssue('X-1', 'A-1', 'Done'),
            childIssue('X-2', 'A-1', 'In Progress'),
            childIssue('X-3', 'B-2', 'Done')
          ]
        }
      }

      const result = await buildMirrors({
        jira,
        issueKeys: ['A-1', 'B-2', 'A-1'],
        releases: [{ productName: 'rhai', releaseNumber: 'rhai-3.7.EA1', codeFreezeDate: '2026-12-11' }],
        startDates: { 'A-1': '2026-10-23', 'B-2': '2026-11-12' },
        today: '2026-11-12'
      })

      expect(calls).toHaveLength(2)
      expect(Object.keys(result).sort()).toEqual(['A-1', 'B-2'])
      expect(result['A-1'].progress).toMatchObject({ total: 2, done: 1, pct: 50 })
      expect(result['B-2'].progress).toMatchObject({ total: 1, done: 1, pct: 100 })
      expect(result['A-1'].milestone.codeFreezeDate).toBe('2026-12-11')
      expect(result['B-2'].attention.state).toBe('delivered')
    })

    it('omits keys Jira does not return', async () => {
      const jira = {
        fetchAllJqlResults: async (jql) => (jql.startsWith('key in') ? [featureIssue('A-1', 'First', '2026-10-23')] : [])
      }
      const result = await buildMirrors({ jira, issueKeys: ['A-1', 'GONE-9'], releases: [], today: '2026-11-12' })
      expect(Object.keys(result)).toEqual(['A-1'])
    })

    it('returns nothing and issues no queries for an empty key list', async () => {
      let called = false
      const jira = { fetchAllJqlResults: async () => { called = true; return [] } }
      const result = await buildMirrors({ jira, issueKeys: [], releases: [], today: '2026-11-12' })
      expect(result).toEqual({})
      expect(called).toBe(false)
    })
  })

  describe('validateFeatureKeys', () => {
    function issue(key, issueType, category) {
      return {
        key,
        fields: {
          issuetype: { name: issueType },
          status: { name: category, statusCategory: { name: category } }
        }
      }
    }

    it('accepts open features and explains every rejection', async () => {
      const jira = {
        fetchAllJqlResults: async () => [
          issue('RHAISTRAT-1', 'Feature', 'In Progress'),
          issue('RHAISTRAT-2', 'Feature', 'Done'),
          issue('RHOAIENG-3', 'Epic', 'In Progress')
        ]
      }

      const result = await validateFeatureKeys({
        jira,
        keys: ['RHAISTRAT-1', 'RHAISTRAT-2', 'RHOAIENG-3', 'RHAISTRAT-404']
      })

      expect(result.valid).toEqual(['RHAISTRAT-1'])
      expect(result.invalid).toEqual([
        { key: 'RHAISTRAT-2', reason: 'closed', status: 'Done' },
        { key: 'RHOAIENG-3', reason: 'not_a_feature', issueType: 'Epic' },
        { key: 'RHAISTRAT-404', reason: 'not_found' }
      ])
    })

    it('skips the Jira call when there is nothing to verify', async () => {
      let called = false
      const jira = { fetchAllJqlResults: async () => { called = true; return [] } }
      const result = await validateFeatureKeys({ jira, keys: [] })
      expect(result).toEqual({ valid: [], invalid: [] })
      expect(called).toBe(false)
    })
  })
})
