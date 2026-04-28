/**
 * Period computation for weekly status cadence.
 * A period is Monday 00:00 UTC to Sunday 23:59 UTC.
 * The periodEnd key is the ISO date of the Sunday (YYYY-MM-DD).
 */

function getWeekBounds(date) {
  var d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  var day = d.getUTCDay()
  // Monday = 1, Sunday = 0
  var diffToMonday = day === 0 ? -6 : 1 - day
  var monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + diffToMonday)
  var sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return {
    periodStart: monday.toISOString().slice(0, 10),
    periodEnd: sunday.toISOString().slice(0, 10)
  }
}

function getCurrentPeriod() {
  return getWeekBounds(new Date())
}

function listPeriods(count) {
  var periods = []
  var d = new Date()
  for (var i = 0; i < (count || 12); i++) {
    periods.push(getWeekBounds(d))
    d.setUTCDate(d.getUTCDate() - 7)
  }
  return periods
}

function isValidPeriodEnd(periodEnd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return false
  var d = new Date(periodEnd + 'T00:00:00Z')
  return d.getUTCDay() === 0 // Must be a Sunday
}

module.exports = { getWeekBounds, getCurrentPeriod, listPeriods, isValidPeriodEnd }
