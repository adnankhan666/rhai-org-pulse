/**
 * Pod work mirror.
 *
 * Read-only projection of a pod's Jira feature plus its Product Pages
 * milestones. Nothing here writes to Jira or Product Pages: the pod record
 * stays the pod record, and this module derives a display-time view of it.
 */

const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/

const FEATURE_FIELDS = [
  'summary',
  'status',
  'created',
  'updated',
  'assignee',
  'priority',
  'labels',
  'components',
  'fixVersions',
  'parent',
  'issuetype',
  'duedate',
  'customfield_10469', // Product Manager
  'customfield_10855', // Target Version
  'customfield_10712', // Color Status
  'customfield_10851'  // Release Type
].join(',')

const CHILD_FIELDS = 'key,summary,status,assignee,issuetype,project,parent'

const BEHIND_THRESHOLD_PCT = 15

/** First focus key that looks like a Jira issue key, or null. */
function primaryFocusKey(pod) {
  const keys = (pod && pod.focusKeys) || []
  return keys.find(key => JIRA_KEY_PATTERN.test(String(key))) || null
}

function displayName(person) {
  if (!person) return null
  return person.displayName || person.name || null
}

function statusCategoryOf(issue) {
  const status = (issue && issue.fields && issue.fields.status) || {}
  return (status.statusCategory && status.statusCategory.name) || null
}

/**
 * Roll up child work items by status category.
 * Progress is derived, never stored: adding scope can lower it.
 */
function deriveProgress(children) {
  const counts = { done: 0, inProgress: 0, todo: 0, other: 0 }
  for (const issue of children || []) {
    const category = statusCategoryOf(issue)
    if (category === 'Done') counts.done += 1
    else if (category === 'In Progress') counts.inProgress += 1
    else if (category === 'To Do') counts.todo += 1
    else counts.other += 1
  }

  const total = (children || []).length
  const pct = total === 0 ? null : Math.round((counts.done / total) * 100)

  return { ...counts, total, pct }
}

function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

function toDateOnly(value) {
  if (!value) return null
  const text = String(value)
  return text.length >= 10 ? text.slice(0, 10) : null
}

/**
 * Compare delivered work against elapsed calendar time.
 *
 * elapsedPct runs from startDate to the code freeze, because the freeze is
 * the date the feature has to be done, not the release date.
 */
function computeAttention({ progressPct, startDate, codeFreezeDate, today }) {
  const day = today || new Date().toISOString().slice(0, 10)
  const freeze = toDateOnly(codeFreezeDate)
  const start = toDateOnly(startDate)

  const daysToFreeze = freeze ? daysBetween(day, freeze) : null

  let elapsedPct = null
  if (freeze && start) {
    const span = daysBetween(start, freeze)
    const used = daysBetween(start, day)
    if (span === null || used === null) elapsedPct = null
    else if (span <= 0) elapsedPct = used >= 0 ? 100 : 0
    else elapsedPct = Math.max(0, Math.min(100, Math.round((used / span) * 100)))
  }

  const deltaPct = (elapsedPct === null || progressPct === null)
    ? null
    : progressPct - elapsedPct

  let state
  if (progressPct === null) state = 'unknown'
  else if (progressPct >= 100) state = 'delivered'
  else if (daysToFreeze !== null && daysToFreeze < 0) state = 'overdue'
  else if (deltaPct !== null && deltaPct <= -BEHIND_THRESHOLD_PCT) state = 'behind'
  else if (deltaPct === null) state = 'unknown'
  else state = 'on_track'

  return { state, daysToFreeze, elapsedPct, deltaPct }
}

/**
 * Map a Jira version name to a Product Pages release identifier.
 *
 * "3.7 EA1 RHOAI RELEASE" -> { version: "3.7", phase: "EA1" }
 * "3.7 GA RHOAI RELEASE"  -> { version: "3.7", phase: "GA" }
 * "rhai-3.7"              -> { version: "3.7", phase: null }
 */
function parseVersionName(name) {
  const text = String(name || '').trim()
  if (!text) return null

  const version = text.match(/(\d+\.\d+)/)
  if (!version) return null

  const phase = text.match(/\b(EA\d+|GA)\b/i)
  return {
    version: version[1],
    phase: phase ? phase[1].toUpperCase() : null
  }
}

/**
 * Find the Product Pages milestone record for a Jira version name.
 * Matches on version + phase, never on the full string.
 */
function resolveMilestone(releases, versionName) {
  const parsed = parseVersionName(versionName)
  if (!parsed) return null

  const candidates = (releases || []).filter(entry => {
    const entryParsed = parseVersionName(entry.releaseNumber)
    if (!entryParsed || entryParsed.version !== parsed.version) return false
    if (entryParsed.phase !== parsed.phase) return false
    return true
  })

  if (candidates.length === 0) return null

  // Prefer an entry that actually carries a code freeze date.
  candidates.sort((a, b) => {
    const score = entry => (entry.codeFreezeDate ? 2 : 0) + (entry.dueDate ? 1 : 0)
    return score(b) - score(a)
  })

  const chosen = candidates[0]
  return {
    releaseNumber: chosen.releaseNumber,
    productName: chosen.productName,
    codeFreezeDate: toDateOnly(chosen.codeFreezeDate),
    planningFreezeDate: toDateOnly(chosen.planningFreezeDate),
    featureFreezeDate: toDateOnly(chosen.featureFreezeDate),
    dueDate: toDateOnly(chosen.dueDate)
  }
}

function shapeChild(issue) {
  return {
    key: issue.key,
    summary: (issue.fields && issue.fields.summary) || null,
    project: (issue.fields && issue.fields.project && issue.fields.project.key) || null,
    status: (issue.fields && issue.fields.status && issue.fields.status.name) || null,
    statusCategory: statusCategoryOf(issue),
    assignee: displayName(issue.fields && issue.fields.assignee)
  }
}

function fieldText(value) {
  if (!value) return null
  if (Array.isArray(value)) return value.length > 0 ? fieldText(value[0]) : null
  if (typeof value === 'string') return value
  return value.name || value.value || null
}

/** Build the read-only mirror for one Jira feature key. */
async function buildMirror({ jira, issueKey, releases, today, startDate }) {
  const mirrors = await buildMirrors({ jira, issueKeys: [issueKey], releases, today, startDates: { [issueKey]: startDate } })
  return mirrors[issueKey] || null
}

function shapeFeature(issue, releases) {
  const fields = issue.fields || {}
  const targetVersion = fieldText(fields.customfield_10855)
  const fixVersion = (fields.fixVersions && fields.fixVersions[0]) || null
  const milestone = resolveMilestone(releases, targetVersion || (fixVersion && fixVersion.name))

  return {
    key: issue.key,
    summary: fields.summary || null,
    issueType: (fields.issuetype && fields.issuetype.name) || null,
    status: (fields.status && fields.status.name) || null,
    statusCategory: statusCategoryOf(issue),
    asOf: fields.updated || null,
    assignee: displayName(fields.assignee),
    productManager: displayName(fields.customfield_10469),
    priority: (fields.priority && fields.priority.name) || null,
    labels: fields.labels || [],
    components: (fields.components || []).map(component => component.name),
    targetVersion,
    fixVersion: fixVersion ? fixVersion.name : null,
    releaseType: (fields.customfield_10851 && fields.customfield_10851.value) || null,
    colorStatus: (fields.customfield_10712 && fields.customfield_10712.value) || null,
    milestone
  }
}

/**
 * Batch mirror builder: two Jira queries regardless of pod count.
 *
 * 1. `key in (...)`           — feature fields for every pod
 * 2. `parent in (...)`        — all child items in one page-through
 *
 * Returns a map of issueKey -> mirror. Keys Jira did not return are omitted,
 * so callers can distinguish "no feature" from "feature has no children".
 */
async function buildMirrors({ jira, issueKeys, releases, today, startDates }) {
  const keys = [...new Set((issueKeys || []).filter(Boolean))]
  if (keys.length === 0) return {}

  const features = await jira.fetchAllJqlResults(
    `key in (${keys.join(', ')}) ORDER BY key`,
    FEATURE_FIELDS
  )

  const children = await jira.fetchAllJqlResults(
    `parent in (${keys.join(', ')}) ORDER BY key`,
    CHILD_FIELDS
  )

  const childrenByParent = new Map()
  for (const issue of children) {
    const parentKey = issue.fields && issue.fields.parent && issue.fields.parent.key
    if (!parentKey) continue
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, [])
    childrenByParent.get(parentKey).push(issue)
  }

  const result = {}
  for (const feature of features) {
    const key = feature.key
    const kids = childrenByParent.get(key) || []
    const progress = deriveProgress(kids)
    const shaped = shapeFeature(feature, releases)
    shaped.progress = progress
    shaped.attention = computeAttention({
      progressPct: progress.pct,
      startDate: (startDates && startDates[key]) || (feature.fields && feature.fields.created),
      codeFreezeDate: shaped.milestone && shaped.milestone.codeFreezeDate,
      today
    })
    shaped.children = kids.map(shapeChild)
    result[key] = shaped
  }

  return result
}

/**
 * Verify that keys are real, open Jira features.
 *
 * Returns invalid entries with a reason so the caller can explain the
 * rejection instead of just refusing the request.
 */
async function validateFeatureKeys({ jira, keys }) {
  const wanted = [...new Set((keys || []).filter(Boolean))]
  if (wanted.length === 0) return { valid: [], invalid: [] }

  const issues = await jira.fetchAllJqlResults(
    `key in (${wanted.join(', ')})`,
    'key,issuetype,status,summary'
  )
  const byKey = new Map(issues.map(issue => [issue.key, issue]))

  const valid = []
  const invalid = []

  for (const key of wanted) {
    const issue = byKey.get(key)
    if (!issue) {
      invalid.push({ key, reason: 'not_found' })
      continue
    }

    const issueType = (issue.fields && issue.fields.issuetype && issue.fields.issuetype.name) || null
    if (issueType !== 'Feature') {
      invalid.push({ key, reason: 'not_a_feature', issueType })
      continue
    }

    const category = statusCategoryOf(issue)
    if (category === 'Done') {
      invalid.push({
        key,
        reason: 'closed',
        status: (issue.fields.status && issue.fields.status.name) || null
      })
      continue
    }

    valid.push(key)
  }

  return { valid, invalid }
}

module.exports = {
  JIRA_KEY_PATTERN,
  BEHIND_THRESHOLD_PCT,
  primaryFocusKey,
  deriveProgress,
  computeAttention,
  parseVersionName,
  resolveMilestone,
  buildMirror,
  buildMirrors,
  validateFeatureKeys
}
