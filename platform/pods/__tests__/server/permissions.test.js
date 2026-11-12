import { describe, it, expect } from 'vitest'
import {
  getTitleLevel,
  getPodCreationPermission,
  canManagePod
} from '../../server/permissions.js'

describe('pod permissions', () => {
  it('maps senior leader titles to the expected level', () => {
    expect(getTitleLevel('Senior Manager')).toBe(2)
    expect(getTitleLevel('Senior Engineering Manager')).toBe(2)
    expect(getTitleLevel('Director')).toBe(3)
    expect(getTitleLevel('Director of Product Management')).toBe(3)
    expect(getTitleLevel('Senior Director')).toBe(4)
    expect(getTitleLevel('VP, Engineering')).toBe(5)
    expect(getTitleLevel('Vice President')).toBe(5)
    expect(getTitleLevel('SVP')).toBe(6)
    expect(getTitleLevel('CTO')).toBe(7)
  })

  it('does not treat IC or lower management titles as pod creators', () => {
    expect(getTitleLevel('Engineering Manager')).toBe(1)
    expect(getTitleLevel('Senior Product Manager')).toBe(1)
    expect(getTitleLevel('Principal Software Engineer')).toBe(0)
    expect(getTitleLevel('Senior UX Designer')).toBe(0)
    expect(getTitleLevel('')).toBe(0)
  })

  it('allows admins regardless of title', async () => {
    const permission = await getPodCreationPermission(
      { isAdmin: true, userEmail: 'admin@example.com', userUid: null },
      { readFromStorage: async () => ({ people: {} }) }
    )
    expect(permission.allowed).toBe(true)
    expect(permission.reason).toBe('admin')
  })

  it('resolves the current person by uid or email and checks title', async () => {
    const storage = {
      readFromStorage: async () => ({
        people: {
          smgr: { uid: 'smgr', email: 'smgr@example.com', title: 'Senior Manager' },
          engmgr: { uid: 'engmgr', email: 'engmgr@example.com', title: 'Engineering Manager' }
        }
      })
    }

    const allowed = await getPodCreationPermission(
      { isAdmin: false, userEmail: 'smgr@example.com', userUid: 'smgr' },
      storage
    )
    expect(allowed.allowed).toBe(true)
    expect(allowed.titleLevel).toBe(2)

    const denied = await getPodCreationPermission(
      { isAdmin: false, userEmail: 'engmgr@example.com', userUid: 'engmgr' },
      storage
    )
    expect(denied.allowed).toBe(false)
    expect(denied.reason).toBe('title-too-low')
  })

  it('denies people missing from the registry', async () => {
    const permission = await getPodCreationPermission(
      { isAdmin: false, userEmail: 'nobody@example.com', userUid: null },
      { readFromStorage: async () => ({ people: {} }) }
    )
    expect(permission.allowed).toBe(false)
    expect(permission.reason).toBe('person-not-found')
  })

  it('lets the creator and admins manage a pod', () => {
    const pod = { createdBy: 'owner@example.com' }
    expect(canManagePod({ userEmail: 'owner@example.com', isAdmin: false }, pod)).toBe(true)
    expect(canManagePod({ userEmail: 'other@example.com', isAdmin: false }, pod)).toBe(false)
    expect(canManagePod({ userEmail: 'other@example.com', isAdmin: true }, pod)).toBe(true)
  })
})
