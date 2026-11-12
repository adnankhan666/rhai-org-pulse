/**
 * Pod request validation and normalization.
 */

const MAX_NAME_LENGTH = 60
const MIN_NAME_LENGTH = 2
const MAX_MEMBERS = 50
const MIN_CREATE_MEMBERS = 3
const MAX_DESCRIPTION_LENGTH = 500
const MAX_FOCUS_KEYS = 10
const MAX_FOCUS_KEY_LENGTH = 60
const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/i
const REQUIRED_FOCUS_KEY_MESSAGE = 'A pod needs at least one Jira feature key (for example RHAISTRAT-2191)'
const DEFAULT_NAME = 'NewPodName'

class PodError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'PodError'
    this.status = status
    this.details = details
  }
}

function normalizePodName(raw) {
  if (typeof raw !== 'string') {
    throw new PodError(400, 'Pod name is required')
  }

  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) throw new PodError(400, 'Pod name is required')
  if (name.toLowerCase() === DEFAULT_NAME.toLowerCase()) {
    throw new PodError(400, 'Give the pod a real name before creating it')
  }
  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    throw new PodError(400, `Pod name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters`)
  }

  return name
}

function normalizeDescription(raw) {
  if (raw === undefined || raw === null) return ''
  if (typeof raw !== 'string') throw new PodError(400, 'Description must be text')
  const description = raw.trim()
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new PodError(400, `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`)
  }
  return description
}

function normalizeFocusKeys(raw, options = {}) {
  const required = options.required === true
  if (raw === undefined || raw === null) {
    if (required) throw new PodError(400, REQUIRED_FOCUS_KEY_MESSAGE)
    return []
  }

  const values = Array.isArray(raw) ? raw : String(raw).split(',')
  const seen = new Set()
  const keys = []

  for (const value of values) {
    if (typeof value !== 'string') {
      throw new PodError(400, 'Focus keys must be text')
    }

    const key = value.trim()
    if (!key) continue
    if (/\s/.test(key)) {
      throw new PodError(400, 'Focus keys cannot contain spaces')
    }
    if (key.length > MAX_FOCUS_KEY_LENGTH) {
      throw new PodError(400, `Focus keys must be ${MAX_FOCUS_KEY_LENGTH} characters or fewer`)
    }

    const dedupeKey = key.toLowerCase()
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey)
      keys.push(key)
    }
  }

  if (keys.length > MAX_FOCUS_KEYS) {
    throw new PodError(400, `A pod can have at most ${MAX_FOCUS_KEYS} focus keys`)
  }
  if (required && keys.length === 0) {
    throw new PodError(400, REQUIRED_FOCUS_KEY_MESSAGE)
  }

  const normalized = keys.map(key => (JIRA_KEY_PATTERN.test(key) ? key.toUpperCase() : key))
  const invalid = normalized.filter(key => !JIRA_KEY_PATTERN.test(key))
  if (invalid.length > 0) {
    throw new PodError(400, `Not a Jira feature key: ${invalid.join(', ')}`, {
      invalidKeys: invalid
    })
  }

  return normalized
}

function findActiveMemberConflicts(pods, memberUids, excludePodId) {
  const memberSet = new Set(memberUids || [])
  const conflicts = []

  for (const pod of pods || []) {
    if (pod.id === excludePodId || pod.status !== 'active') continue
    for (const uid of pod.memberUids || []) {
      if (memberSet.has(uid)) {
        conflicts.push({ uid, podId: pod.id, podName: pod.name })
      }
    }
  }

  return conflicts
}

function assertMembersAvailableInActivePods(pods, memberUids, excludePodId) {
  const conflicts = findActiveMemberConflicts(pods, memberUids, excludePodId)
  if (conflicts.length > 0) {
    throw new PodError(409, 'Some people are already in another active pod', { conflicts })
  }
}

function assertUniquePodName(name, pods, excludePodId) {
  const normalized = String(name || '').toLowerCase()
  const existing = (pods || []).find(pod =>
    pod.id !== excludePodId &&
    String(pod.name || '').toLowerCase() === normalized
  )
  if (existing) {
    throw new PodError(409, `A pod named "${name}" already exists`)
  }
}

function normalizeMemberUids(raw, peopleMap, options = {}) {
  const min = options.min ?? MIN_CREATE_MEMBERS
  const max = options.max ?? MAX_MEMBERS

  if (!Array.isArray(raw)) {
    throw new PodError(400, 'memberUids must be an array')
  }

  const seen = new Set()
  const uids = []

  for (const value of raw) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new PodError(400, 'Every member must be a non-empty UID')
    }
    const uid = value.trim()
    if (!seen.has(uid)) {
      seen.add(uid)
      uids.push(uid)
    }
  }

  if (uids.length < min) {
    throw new PodError(400, `A pod needs at least ${min} members`)
  }
  if (uids.length > max) {
    throw new PodError(400, `A pod can have at most ${max} members`)
  }

  const missingUids = uids.filter(uid => !peopleMap[uid])
  if (missingUids.length > 0) {
    throw new PodError(400, 'Some selected people are not in the registry', { missingUids })
  }

  const inactiveUids = uids.filter(uid => peopleMap[uid].status !== 'active')
  if (inactiveUids.length > 0) {
    throw new PodError(400, 'Some selected people are not active', { inactiveUids })
  }

  return uids
}

module.exports = {
  PodError,
  JIRA_KEY_PATTERN,
  REQUIRED_FOCUS_KEY_MESSAGE,
  DEFAULT_NAME,
  MAX_MEMBERS,
  MIN_CREATE_MEMBERS,
  MAX_FOCUS_KEYS,
  normalizePodName,
  normalizeDescription,
  normalizeFocusKeys,
  findActiveMemberConflicts,
  assertMembersAvailableInActivePods,
  assertUniquePodName,
  normalizeMemberUids
}
