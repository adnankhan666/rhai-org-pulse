import { describe, it, expect } from 'vitest'
import {
  PodError,
  normalizePodName,
  normalizeDescription,
  normalizeFocusKeys,
  findActiveMemberConflicts,
  assertMembersAvailableInActivePods,
  assertUniquePodName,
  normalizeMemberUids
} from '../../server/validation.js'

const people = {
  a: { uid: 'a', name: 'Alice', status: 'active' },
  b: { uid: 'b', name: 'Bob', status: 'active' },
  c: { uid: 'c', name: 'Carol', status: 'active' },
  inactive: { uid: 'inactive', name: 'Inactive', status: 'inactive' }
}

describe('pod validation', () => {
  it('normalizes a valid pod name', () => {
    expect(normalizePodName('  Orbit   Pod  ')).toBe('Orbit Pod')
  })

  it('rejects empty, placeholder, and overlong names', () => {
    expect(() => normalizePodName('')).toThrow(PodError)
    expect(() => normalizePodName('NewPodName')).toThrow(/real name/i)
    expect(() => normalizePodName('x')).toThrow(/between/i)
    expect(() => normalizePodName('x'.repeat(61))).toThrow(/between/i)
  })

  it('rejects duplicate names case-insensitively', () => {
    const pods = [{ id: 'p1', name: 'Orbit Pod' }]
    expect(() => assertUniquePodName('orbit pod', pods)).toThrow(PodError)
    expect(() => assertUniquePodName('Orbit Pod', pods, 'p1')).not.toThrow()
  })

  it('normalizes descriptions and rejects overlong text', () => {
    expect(normalizeDescription('  hello  ')).toBe('hello')
    expect(normalizeDescription(undefined)).toBe('')
    expect(() => normalizeDescription('x'.repeat(501))).toThrow(/500/)
  })

  it('normalizes focus keys and deduplicates them', () => {
    expect(normalizeFocusKeys(['RHAISTRAT-1234', ' RHAISTRAT-1122 ', 'rhaistrat-1234']))
      .toEqual(['RHAISTRAT-1234', 'RHAISTRAT-1122'])
    expect(normalizeFocusKeys('RHAISTRAT-1234, RHAISTRAT-1122'))
      .toEqual(['RHAISTRAT-1234', 'RHAISTRAT-1122'])
    expect(normalizeFocusKeys(null)).toEqual([])
  })

  it('requires a key at creation and rejects non-Jira keys', () => {
    expect(() => normalizeFocusKeys(null, { required: true }))
      .toThrow(/at least one Jira feature key/)
    expect(() => normalizeFocusKeys([], { required: true }))
      .toThrow(/at least one Jira feature key/)
    expect(() => normalizeFocusKeys(['notakey'], { required: true }))
      .toThrow(/Not a Jira feature key/)
    expect(() => normalizeFocusKeys(['RHAISTRAT'], { required: true }))
      .toThrow(/Not a Jira feature key/)
    expect(normalizeFocusKeys(['rhaistrat-2191'], { required: true })).toEqual(['RHAISTRAT-2191'])
    expect(normalizeFocusKeys(['abcd-1234'], { required: true })).toEqual(['ABCD-1234'])
  })

  it('rejects focus keys with spaces or too many keys', () => {
    expect(() => normalizeFocusKeys(['Purple STRAT-1234'])).toThrow(/spaces/)
    expect(() => normalizeFocusKeys(Array.from({ length: 11 }, (_, i) => `POD-${i}`)))
      .toThrow(/at most 10/)
  })

  it('detects members already in another active pod', () => {
    const pods = [
      { id: 'p1', name: 'Active Pod', status: 'active', memberUids: ['a', 'b'] },
      { id: 'p2', name: 'Archived Pod', status: 'archived', memberUids: ['c'] }
    ]

    expect(findActiveMemberConflicts(pods, ['b', 'c'])).toEqual([
      { uid: 'b', podId: 'p1', podName: 'Active Pod' }
    ])
    expect(() => assertMembersAvailableInActivePods(pods, ['b'])).toThrow(PodError)
    expect(() => assertMembersAvailableInActivePods(pods, ['b'], 'p1')).not.toThrow()
    expect(() => assertMembersAvailableInActivePods(pods, ['c'])).not.toThrow()
  })

  it('deduplicates members and enforces the minimum of three', () => {
    expect(normalizeMemberUids(['a', 'b', 'c', 'a'], people)).toEqual(['a', 'b', 'c'])
    expect(() => normalizeMemberUids(['a', 'b'], people)).toThrow(/at least 3/)
  })

  it('rejects missing and inactive members', () => {
    expect(() => normalizeMemberUids(['a', 'b', 'missing'], people)).toThrow(/not in the registry/)
    expect(() => normalizeMemberUids(['a', 'b', 'inactive'], people)).toThrow(/not active/)
  })

  it('rejects non-array member payloads', () => {
    expect(() => normalizeMemberUids('a,b,c', people)).toThrow(/must be an array/)
  })
})
