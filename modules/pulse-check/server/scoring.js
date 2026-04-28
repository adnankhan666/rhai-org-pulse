/**
 * Signal scoring — ranks updates by how much attention they need.
 * Higher score = more important = should be expanded in compressed views.
 */

var DEFAULT_WEIGHTS = {
  redSentiment: 10,
  redConsecutiveBonus: 2,
  missingSumbission: 5,
  missingManagerBonus: 3,
  unresolvedBlocker: 4,
  blockerAgeWeekBonus: 2,
  blockerInitiativeBonus: 3,
  yellowSentiment: 2,
  yellowFromGreenBonus: 2,
  sentimentDropTeam: 6,
  sentimentDropGradeBonus: 2,
  lowSubmissionRate: 3,
  lowSubmissionPer10Pct: 1
}

function scoreUpdate(update, opts) {
  var w = (opts && opts.weights) || DEFAULT_WEIGHTS
  var previousSentiment = opts && opts.previousSentiment
  var isManager = opts && opts.isManager
  var score = 0
  var reasons = []

  if (!update) {
    score += w.missingSumbission
    reasons.push('missing')
    if (isManager) {
      score += w.missingManagerBonus
      reasons.push('missing-manager')
    }
    return { score: score, reasons: reasons }
  }

  if (update.sentiment === 'red') {
    score += w.redSentiment
    reasons.push('red')
    var consecutiveRed = (opts && opts.consecutiveRedWeeks) || 0
    if (consecutiveRed > 0) {
      score += consecutiveRed * w.redConsecutiveBonus
      reasons.push('consecutive-red-' + consecutiveRed + 'w')
    }
  } else if (update.sentiment === 'yellow') {
    score += w.yellowSentiment
    reasons.push('yellow')
    if (previousSentiment === 'green') {
      score += w.yellowFromGreenBonus
      reasons.push('shifted-from-green')
    }
  }

  // Score unresolved blockers
  var blockers = update.blockers || []
  for (var i = 0; i < blockers.length; i++) {
    var b = blockers[i]
    if (b.resolved) continue
    score += w.unresolvedBlocker
    reasons.push('blocker')
    var ageWeeks = b.ageWeeks || 0
    if (ageWeeks > 0) {
      score += ageWeeks * w.blockerAgeWeekBonus
      reasons.push('blocker-age-' + ageWeeks + 'w')
    }
    if (b.severity === 'high') {
      score += 2
      reasons.push('blocker-high')
    }
  }

  return { score: score, reasons: reasons }
}

function scoreMissing(opts) {
  return scoreUpdate(null, opts)
}

/**
 * Given a list of { uid, update?, ... } items, score and sort them
 * so the most attention-needing items are first.
 */
function rankItems(items, opts) {
  var scored = items.map(function(item) {
    var itemOpts = Object.assign({}, opts, {
      isManager: item.isManager,
      previousSentiment: item.previousSentiment,
      consecutiveRedWeeks: item.consecutiveRedWeeks
    })
    var result = scoreUpdate(item.update || null, itemOpts)
    return {
      uid: item.uid,
      name: item.name,
      update: item.update || null,
      score: result.score,
      reasons: result.reasons,
      isMissing: !item.update
    }
  })

  scored.sort(function(a, b) { return b.score - a.score })
  return scored
}

/**
 * Split ranked items into "expanded" (top N or score > threshold) and "collapsed".
 */
function splitByAttentionBudget(rankedItems, budget) {
  var n = budget || 5
  var threshold = 3
  var expanded = []
  var collapsed = []

  for (var i = 0; i < rankedItems.length; i++) {
    if (i < n || rankedItems[i].score >= threshold) {
      expanded.push(rankedItems[i])
    } else {
      collapsed.push(rankedItems[i])
    }
  }

  return { expanded: expanded, collapsed: collapsed }
}

module.exports = { scoreUpdate, scoreMissing, rankItems, splitByAttentionBudget, DEFAULT_WEIGHTS }
