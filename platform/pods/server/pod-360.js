/**
 * Pod 360 report.
 *
 * Applies the ODH Dashboard 360 contract to pod scope: the pod's feature and
 * its child work items instead of a team's board. Deterministic on purpose —
 * the same pod state must always produce the same markdown.
 */

const STALE_DAYS = 14
const REVIEW_DAYS = 7
const OVERLOAD_THRESHOLD = 4

function dateOnly(value) {
  if (!value) return null
  const text = String(value)
  return text.length >= 10 ? text.slice(0, 10) : null
}

function daysSince(value, today) {
  const from = dateOnly(value)
  if (!from) return null
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${dateOnly(today)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

function isDone(child) {
  return child.statusCategory === 'Done'
}

function isInReview(child) {
  return /review/i.test(String(child.status || ''))
}

function summarize(mirror) {
  const children = (mirror && mirror.children) || []
  const done = children.filter(isDone)

  return {
    total: children.length,
    inProgress: children.filter(child => child.statusCategory === 'In Progress').length,
    inReview: children.filter(isInReview).length,
    done: done.length
  }
}

/**
 * @param {{ pod: object, mirror: object, members: Array<{name: string}>, today?: string }} input
 * @returns {{ markdown: string, data: object }}
 */
function buildPod360({ pod, mirror, members, today }) {
  const day = today || new Date().toISOString().slice(0, 10)
  const children = (mirror && mirror.children) || []
  const summary = summarize(mirror)

  const completed7d = children.filter(child => {
    if (!isDone(child)) return false
    const age = daysSince(child.resolutionDate, day)
    return age !== null && age >= 0 && age <= 7
  })

  const staleItems = children.filter(child => {
    if (isDone(child)) return false
    const age = daysSince(child.updated, day)
    return age !== null && age > STALE_DAYS
  })

  const reviewBottlenecks = children.filter(child => {
    if (isDone(child) || !isInReview(child)) return false
    const age = daysSince(child.updated, day)
    return age !== null && age > REVIEW_DAYS
  })

  const unassigned = children.filter(child => !isDone(child) && !child.assignee)

  const capacity = (members || []).map(member => {
    const owned = children.filter(child => child.assignee === member.name)
    return {
      person: member.name,
      inProgress: owned.filter(child => child.statusCategory === 'In Progress').length,
      inReview: owned.filter(isInReview).length,
      total: owned.length
    }
  })

  const overloaded = capacity.filter(row => row.inProgress >= OVERLOAD_THRESHOLD)

  const memberNames = new Set((members || []).map(member => member.name))
  const outsideOwners = [...new Set(
    children
      .map(child => child.assignee)
      .filter(name => name && !memberNames.has(name))
  )]

  const data = {
    generatedAt: new Date().toISOString(),
    outsideOwners,
    pod: { id: pod.id, name: pod.name, members: (members || []).length },
    feature: mirror
      ? {
          key: mirror.key,
          summary: mirror.summary,
          status: mirror.status,
          assignee: mirror.assignee,
          productManager: mirror.productManager,
          colorStatus: mirror.colorStatus,
          fixVersion: mirror.fixVersion,
          releaseType: mirror.releaseType,
          codeFreezeDate: (mirror.milestone && mirror.milestone.codeFreezeDate) || null,
          asOf: mirror.asOf
        }
      : null,
    snapshot: {
      total: summary.total,
      inProgress: summary.inProgress,
      inReview: summary.inReview,
      done: summary.done,
      staleCount: staleItems.length,
      completed7d: completed7d.length
    },
    risks: {
      staleItems: staleItems.map(child => child.key),
      reviewBottlenecks: reviewBottlenecks.map(child => child.key),
      unassigned: unassigned.map(child => child.key),
      overloaded: overloaded.map(row => row.person)
    },
    stratFeatures: mirror ? [{ key: mirror.key, summary: mirror.summary, color: mirror.colorStatus }] : [],
    activityTypeRatio: null,
    capacity,
    prStatus: null,
    notCollected: [
      'Activity type mix: pods do not define activity targets',
      'PR status: pull request data is not fetched for pod children yet'
    ]
  }

  return { markdown: renderMarkdown(data, day), data }
}

function renderMarkdown(data, day) {
  const lines = []
  const feature = data.feature

  lines.push(`# ${data.pod.name} — 360 — ${day}`)
  lines.push('')

  if (feature) {
    const freeze = feature.codeFreezeDate ? ` · code freeze ${feature.codeFreezeDate}` : ''
    lines.push(
      `**Feature:** ${feature.key} — ${feature.summary}`
    )
    lines.push(
      `**Status:** ${feature.status || '—'} · **Color:** ${feature.colorStatus || '—'} · ` +
        `**Assignee:** ${feature.assignee || '—'} · **PM:** ${feature.productManager || '—'}`
    )
    lines.push(
      `**Release:** ${feature.fixVersion || '—'} (${feature.releaseType || '—'})${freeze}`
    )
    lines.push(`**Jira last updated:** ${feature.asOf || 'unknown'}`)
  } else {
    lines.push('**Feature:** none linked — progress and health are unknown.')
  }

  lines.push('')
  lines.push('## Snapshot')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('|---|---|')
  lines.push(`| Child items | ${data.snapshot.total} |`)
  lines.push(`| In progress | ${data.snapshot.inProgress} |`)
  lines.push(`| In review | ${data.snapshot.inReview} |`)
  lines.push(`| Done | ${data.snapshot.done} |`)
  lines.push(`| Stale (>${STALE_DAYS}d) | ${data.snapshot.staleCount} |`)
  lines.push(`| Completed (last 7d) | ${data.snapshot.completed7d} |`)
  lines.push('')

  lines.push('## Risks')
  lines.push('')
  const risks = data.risks
  const riskLines = []
  if (risks.staleItems.length) riskLines.push(`- Stale items: ${risks.staleItems.join(', ')}`)
  if (risks.reviewBottlenecks.length) riskLines.push(`- Stuck in review (>${REVIEW_DAYS}d): ${risks.reviewBottlenecks.join(', ')}`)
  if (risks.unassigned.length) riskLines.push(`- Unassigned in-flight items: ${risks.unassigned.join(', ')}`)
  if (risks.overloaded.length) riskLines.push(`- Overloaded (>=${OVERLOAD_THRESHOLD} in progress): ${risks.overloaded.join(', ')}`)
  lines.push(...(riskLines.length ? riskLines : ['- None']))
  lines.push('')

  lines.push('## Feature')
  lines.push('')
  if (data.stratFeatures.length) {
    for (const item of data.stratFeatures) {
      lines.push(`- ${item.key} — ${item.summary} (${item.color || 'no color'})`)
    }
  } else {
    lines.push('- None')
  }
  lines.push('')

  lines.push('## Capacity')
  lines.push('')
  lines.push('| Person | In progress | In review | Total |')
  lines.push('|---|---|---|---|')
  for (const row of data.capacity) {
    lines.push(`| ${row.person || '—'} | ${row.inProgress} | ${row.inReview} | ${row.total} |`)
  }
  lines.push('')
  if (data.outsideOwners.length) {
    lines.push(`Child items are also owned by people outside this pod: ${data.outsideOwners.join(', ')}.`)
    lines.push('')
  }

  lines.push('## Not collected')
  lines.push('')
  for (const note of data.notCollected) {
    lines.push(`- ${note}`)
  }
  lines.push('')

  return lines.join('\n')
}

module.exports = { buildPod360, STALE_DAYS, REVIEW_DAYS, OVERLOAD_THRESHOLD }
