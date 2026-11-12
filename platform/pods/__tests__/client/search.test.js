import { describe, it, expect } from 'vitest'
import {
  buildPersonSearchText,
  matchesSearchText,
  tokenizeSearch
} from '../../client/utils/search.js'

const person = {
  uid: 'jdoe',
  name: 'Jane Doe',
  email: 'jdoe@example.com',
  title: 'Staff Engineer',
  orgDisplayName: 'Platform',
  orgRoot: 'achen',
  orgType: 'engineering',
  geo: 'NA',
  location: 'Remote',
  city: 'Boston',
  country: 'US',
  teams: ['ML Platform'],
  associatedTeamNames: [],
  github: { username: 'janedoe', source: 'ldap' },
  gitlab: { username: 'jdoe', source: 'manual' },
  _appFields: {
    field_x1y2z3: 'model serving',
    field_d4e5f6: ['ML Models', 'Platform Dashboard'],
    field_mv0001: ['Python', 'Go'],
    field_rq0001: 'ML Engineer'
  }
}

describe('Pods search', () => {
  it('indexes org, identity, team, location, and custom fields', () => {
    const text = buildPersonSearchText(person)

    for (const value of [
      'jane doe',
      'jdoe@example.com',
      'staff engineer',
      'platform',
      'na',
      'remote',
      'boston',
      'ml platform',
      'janedoe',
      'model serving',
      'ml models',
      'platform dashboard',
      'python',
      'ml engineer'
    ]) {
      expect(text).toContain(value)
    }
  })

  it('adds the labels shown in the org filter', () => {
    expect(buildPersonSearchText(person)).toContain('org member')
    expect(buildPersonSearchText({ ...person, orgType: 'auxiliary' })).toContain('extended')
  })

  it('matches every whitespace-separated term across the blob', () => {
    const text = buildPersonSearchText(person)

    expect(matchesSearchText(text, 'ml engineer')).toBe(true)
    expect(matchesSearchText(text, 'platform python')).toBe(true)
    expect(matchesSearchText(text, 'platform rust')).toBe(false)
  })

  it('treats blank search as a match', () => {
    expect(tokenizeSearch('   ')).toEqual([])
    expect(matchesSearchText('anything', '   ')).toBe(true)
  })
})
