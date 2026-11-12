/**
 * Pod creation and management permissions.
 *
 * Pods are intentionally gated by title level rather than by a broad
 * team-admin role. Admins always bypass the title check.
 */

const MIN_POD_CREATOR_LEVEL = 2

const TITLE_LEVEL_RULES = [
  { level: 7, pattern: /\b(chief|cto|ceo|coo)\b/i },
  { level: 6, pattern: /\b(svp|senior vice president)\b/i },
  { level: 5, pattern: /\b(vp|vice president)\b/i },
  { level: 4, pattern: /\bsenior director\b/i },
  { level: 3, pattern: /\bdirector\b/i },
  { level: 2, pattern: /\bsenior (engineering )?manager\b/i },
  { level: 1, pattern: /\bmanager\b/i }
]

function getTitleLevel(title) {
  const text = String(title || '').trim()
  if (!text) return 0

  for (const rule of TITLE_LEVEL_RULES) {
    if (rule.pattern.test(text)) return rule.level
  }
  return 0
}

function getActorEmail(req) {
  return String(req.userEmail || '').trim().toLowerCase()
}

async function getActorPerson(req, storage) {
  const registry = await storage.readFromStorage('team-data/registry.json')
  const people = registry?.people || {}

  if (req.userUid && people[req.userUid]) return people[req.userUid]

  const email = getActorEmail(req)
  if (!email) return null

  return Object.values(people).find(person =>
    String(person.email || '').trim().toLowerCase() === email
  ) || null
}

async function getPodCreationPermission(req, storage) {
  if (req.isAdmin) {
    return {
      allowed: true,
      isAdmin: true,
      title: null,
      titleLevel: null,
      reason: 'admin'
    }
  }

  const person = await getActorPerson(req, storage)
  const title = person?.title || null
  const titleLevel = getTitleLevel(title)

  return {
    allowed: Boolean(person && titleLevel >= MIN_POD_CREATOR_LEVEL),
    isAdmin: false,
    title,
    titleLevel,
    reason: person
      ? (titleLevel >= MIN_POD_CREATOR_LEVEL ? 'title' : 'title-too-low')
      : 'person-not-found'
  }
}

async function canCreatePod(req, storage) {
  return (await getPodCreationPermission(req, storage)).allowed
}

function canManagePod(req, pod) {
  if (req.isAdmin) return true
  const actor = getActorEmail(req)
  return Boolean(actor && pod && String(pod.createdBy || '').toLowerCase() === actor)
}

module.exports = {
  MIN_POD_CREATOR_LEVEL,
  getTitleLevel,
  getActorPerson,
  getPodCreationPermission,
  canCreatePod,
  canManagePod
}
