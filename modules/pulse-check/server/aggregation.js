/**
 * Multi-axis aggregation engine.
 * Resolves a person set for a given (axis, value), reads their updates,
 * and returns results at the requested detail level.
 */

var scoring = require('./scoring')

/**
 * Resolve person set by axis from registry data.
 * Returns array of person objects.
 */
function resolvePeople(axis, value, registryHelpers, opts) {
  if (axis === 'team') {
    return registryHelpers.getPeopleByTeam(value)
  }
  if (axis === 'management') {
    return registryHelpers.getDirectReports(value)
  }
  if (axis === 'org') {
    return registryHelpers.getPeopleByOrg ? registryHelpers.getPeopleByOrg(value) : []
  }
  if (axis === 'tag') {
    return opts && opts.tagPeople ? opts.tagPeople : []
  }
  return []
}

/**
 * Compute the default detail level based on result set cardinality.
 */
function defaultDetail(count) {
  if (count <= 8) return 'full'
  if (count <= 25) return 'summary'
  return 'stats'
}

/**
 * Build an aggregation result.
 * @param {object} params
 * @param {string} params.axis
 * @param {string} params.value
 * @param {string} params.periodEnd
 * @param {string} [params.detail] - 'full' | 'summary' | 'stats'
 * @param {string} [params.groupBy] - optional nested grouping axis
 * @param {Function} params.readUpdate - (uid, periodEnd) => update|null
 * @param {object} params.registryHelpers
 */
function aggregate(params) {
  var axis = params.axis
  var value = params.value
  var periodEnd = params.periodEnd
  var readUpdate = params.readUpdate
  var registryHelpers = params.registryHelpers

  var people = resolvePeople(axis, value, registryHelpers, { tagPeople: params.tagPeople })
  var detail = params.detail || defaultDetail(people.length)

  var updates = []
  var missing = []
  var sentiment = { green: 0, yellow: 0, red: 0 }
  var unresolvedBlockers = []
  var totalJiraResolved = 0
  var totalJiraPoints = 0

  var scoringItems = []

  for (var i = 0; i < people.length; i++) {
    var p = people[i]
    var update = readUpdate(p.uid, periodEnd)

    var hasDirectReports = registryHelpers.getDirectReports(p.uid).length > 0

    if (update) {
      updates.push(update)
      if (update.sentiment && sentiment[update.sentiment] !== undefined) {
        sentiment[update.sentiment]++
      }

      var blockerList = update.blockers || []
      for (var j = 0; j < blockerList.length; j++) {
        var b = blockerList[j]
        if (!b.resolved) {
          unresolvedBlockers.push({
            person: update.personName,
            uid: update.uid,
            text: b.text,
            severity: b.severity || 'medium'
          })
        }
      }

      if (update.autoMetrics && update.autoMetrics.jira) {
        totalJiraResolved += update.autoMetrics.jira.resolvedCount || 0
        totalJiraPoints += update.autoMetrics.jira.storyPoints || 0
      }
    } else {
      missing.push({ uid: p.uid, name: p.name })
    }

    scoringItems.push({
      uid: p.uid,
      name: p.name,
      update: update,
      isManager: hasDirectReports
    })
  }

  var ranked = scoring.rankItems(scoringItems)

  var result = {
    axis: axis,
    value: value,
    periodEnd: periodEnd,
    detail: detail,
    total: people.length,
    submitted: updates.length,
    missing: missing,
    sentiment: sentiment,
    unresolvedBlockers: unresolvedBlockers,
    metrics: {
      jiraResolved: totalJiraResolved,
      jiraPoints: totalJiraPoints
    }
  }

  if (detail === 'full') {
    result.updates = updates
    result.ranked = ranked
  } else if (detail === 'summary') {
    var split = scoring.splitByAttentionBudget(ranked, 5)
    result.expanded = split.expanded
    result.collapsedCount = split.collapsed.length
    result.collapsedSummary = split.collapsed.length > 0
      ? split.collapsed.length + ' on track'
      : null
  } else {
    // stats: just the numbers, no individual updates
    result.topSignals = ranked.slice(0, 3).map(function(item) {
      return { uid: item.uid, name: item.name, score: item.score, reasons: item.reasons, isMissing: item.isMissing }
    })
  }

  // Nested groupBy support
  if (params.groupBy === 'team' && axis !== 'team') {
    var teamMap = {}
    for (var k = 0; k < people.length; k++) {
      var person = people[k]
      var grouping = person._teamGrouping || person.miroTeam || ''
      var teams = grouping.split(',').map(function(t) { return t.trim() }).filter(Boolean)
      if (teams.length === 0) teams = ['_unassigned']
      for (var t = 0; t < teams.length; t++) {
        var team = teams[t]
        if (!teamMap[team]) teamMap[team] = { people: [], updates: [], missing: [] }
        teamMap[team].people.push(person)
        var u = readUpdate(person.uid, periodEnd)
        if (u) teamMap[team].updates.push(u)
        else teamMap[team].missing.push({ uid: person.uid, name: person.name })
      }
    }

    result.groups = Object.keys(teamMap).map(function(teamName) {
      var g = teamMap[teamName]
      var groupSentiment = { green: 0, yellow: 0, red: 0 }
      for (var gi = 0; gi < g.updates.length; gi++) {
        var gs = g.updates[gi].sentiment
        if (gs && groupSentiment[gs] !== undefined) groupSentiment[gs]++
      }
      return {
        team: teamName,
        total: g.people.length,
        submitted: g.updates.length,
        missing: g.missing,
        sentiment: groupSentiment
      }
    }).sort(function(a, b) { return a.team.localeCompare(b.team) })
  }

  return result
}

module.exports = { aggregate, resolvePeople, defaultDetail }
