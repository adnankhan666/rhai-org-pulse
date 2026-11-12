/**
 * Build a searchable text blob for a registry person.
 *
 * The Pods table shows values from several nested sources (org, teams,
 * identities, lifecycle, and custom fields). Search should match all of them,
 * not just name/email/UID.
 */

function pushValue(parts, value) {
  if (value === null || value === undefined) return

  if (Array.isArray(value)) {
    for (const item of value) pushValue(parts, item)
    return
  }

  if (typeof value === 'object') {
    for (const item of Object.values(value)) pushValue(parts, item)
    return
  }

  const text = String(value).trim()
  if (text) parts.push(text)
}

export function buildPersonSearchText(person) {
  if (!person) return ''

  const parts = []

  pushValue(parts, [
    person.name,
    person.email,
    person.uid,
    person.title,
    person.orgDisplayName,
    person.orgRoot,
    person.orgType,
    person.geo,
    person.location,
    person.city,
    person.country,
    person.officeLocation,
    person.status,
    person.managerUid,
    person.jiraTeam,
    person._teamGrouping,
    person.specialty,
    person.teams,
    person.associatedTeamNames,
    person.github,
    person.gitlab,
    person.customFields,
    person._appFields
  ])

  // Surface the labels users actually see in the table/filter UI.
  if ((person.orgType || 'engineering') === 'auxiliary') {
    parts.push('extended')
  } else {
    parts.push('org member')
  }

  return parts.join(' ').toLowerCase()
}

export function tokenizeSearch(query) {
  return String(query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

export function matchesSearchText(text, query) {
  const terms = Array.isArray(query) ? query : tokenizeSearch(query)
  if (terms.length === 0) return true

  const haystack = String(text || '').toLowerCase()
  return terms.every(term => haystack.includes(term))
}
