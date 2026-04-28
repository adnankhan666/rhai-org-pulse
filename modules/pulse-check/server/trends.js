/**
 * Trend computation: sentiment, blockers, and throughput over time
 * for any axis + value combination.
 */

var periods = require('./periods')

/**
 * Compute trends for a person over N periods.
 * Returns an array of period summaries in chronological order.
 */
function personTrends(readUpdate, uid, periodCount) {
  var periodList = periods.listPeriods(periodCount || 12).reverse()
  return periodList.map(function(p) {
    var update = readUpdate(uid, p.periodEnd)
    return {
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      submitted: !!update,
      sentiment: update ? update.sentiment : null,
      highlightCount: update && update.highlights ? update.highlights.length : 0,
      blockerCount: update && update.blockers ? update.blockers.filter(function(b) { return !b.resolved }).length : 0,
      resolvedBlockerCount: update && update.blockers ? update.blockers.filter(function(b) { return b.resolved }).length : 0,
      tags: update && update.tags ? update.tags : []
    }
  })
}

/**
 * Compute aggregate trends for a group of people over N periods.
 */
function groupTrends(readUpdate, people, periodCount) {
  var periodList = periods.listPeriods(periodCount || 12).reverse()
  return periodList.map(function(p) {
    var submitted = 0
    var sentiment = { green: 0, yellow: 0, red: 0 }
    var totalBlockers = 0

    for (var i = 0; i < people.length; i++) {
      var update = readUpdate(people[i].uid, p.periodEnd)
      if (update) {
        submitted++
        if (update.sentiment && sentiment[update.sentiment] !== undefined) {
          sentiment[update.sentiment]++
        }
        if (update.blockers) {
          for (var j = 0; j < update.blockers.length; j++) {
            if (!update.blockers[j].resolved) totalBlockers++
          }
        }
      }
    }

    return {
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      total: people.length,
      submitted: submitted,
      submissionRate: people.length > 0 ? Math.round((submitted / people.length) * 100) : 0,
      sentiment: sentiment,
      blockerCount: totalBlockers
    }
  })
}

/**
 * Detect week-over-week sentiment shifts.
 */
function detectShifts(trendData) {
  var shifts = []
  for (var i = 1; i < trendData.length; i++) {
    var prev = trendData[i - 1]
    var curr = trendData[i]

    if (prev.sentiment && curr.sentiment) {
      var prevHealth = sentimentHealth(prev.sentiment)
      var currHealth = sentimentHealth(curr.sentiment)
      if (currHealth < prevHealth) {
        shifts.push({
          periodEnd: curr.periodEnd,
          direction: 'down',
          from: prevHealth,
          to: currHealth
        })
      } else if (currHealth > prevHealth) {
        shifts.push({
          periodEnd: curr.periodEnd,
          direction: 'up',
          from: prevHealth,
          to: currHealth
        })
      }
    }
  }
  return shifts
}

function sentimentHealth(sentimentObj) {
  if (typeof sentimentObj === 'string') {
    return { green: 3, yellow: 2, red: 1 }[sentimentObj] || 0
  }
  var total = (sentimentObj.green || 0) + (sentimentObj.yellow || 0) + (sentimentObj.red || 0)
  if (total === 0) return 0
  return ((sentimentObj.green || 0) * 3 + (sentimentObj.yellow || 0) * 2 + (sentimentObj.red || 0) * 1) / total
}

module.exports = { personTrends, groupTrends, detectShifts, sentimentHealth }
