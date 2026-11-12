import { describe, it, expect } from 'vitest'
import { getInitials } from '../../client/utils/initials.js'

describe('pod member initials', () => {
  it('uses first and last name initials', () => {
    expect(getInitials('Alice Chen')).toBe('AC')
    expect(getInitials('Carol Williams')).toBe('CW')
    expect(getInitials('Dana PMLeader')).toBe('DP')
  })

  it('handles one-word and missing names', () => {
    expect(getInitials('Prince')).toBe('PR')
    expect(getInitials('')).toBe('?')
    expect(getInitials(null)).toBe('?')
  })
})
