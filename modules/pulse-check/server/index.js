var periods = require('./periods')
var autoMetrics = require('./auto-metrics')
var aggregation = require('./aggregation')
var trends = require('./trends')

var DATA_PREFIX = 'pulse-check'
var VALID_SENTIMENTS = ['green', 'yellow', 'red']
var MAX_ITEMS = 20

module.exports = function registerRoutes(router, context) {
  var storage = context.storage

  function readData(key) {
    return storage.readFromStorage(DATA_PREFIX + '/' + key)
  }

  function writeData(key, data) {
    storage.writeToStorage(DATA_PREFIX + '/' + key, data)
  }

  function getRegistry() {
    return storage.readFromStorage('team-data/registry.json')
  }

  function findPersonByEmail(email) {
    var reg = getRegistry()
    if (!reg || !reg.people) return null
    var uids = Object.keys(reg.people)
    for (var i = 0; i < uids.length; i++) {
      var p = reg.people[uids[i]]
      if (p.email && p.email.toLowerCase() === email.toLowerCase()) return p
    }
    return null
  }

  function getDirectReports(uid) {
    var reg = getRegistry()
    if (!reg || !reg.people) return []
    var reports = []
    var uids = Object.keys(reg.people)
    for (var i = 0; i < uids.length; i++) {
      var p = reg.people[uids[i]]
      if (p.managerUid === uid && p.status === 'active') reports.push(p)
    }
    return reports
  }

  function getPeopleByTeam(teamName) {
    var reg = getRegistry()
    if (!reg || !reg.people) return []
    var result = []
    var uids = Object.keys(reg.people)
    for (var i = 0; i < uids.length; i++) {
      var p = reg.people[uids[i]]
      if (p.status !== 'active') continue
      var grouping = p._teamGrouping || p.miroTeam || ''
      var teams = grouping.split(',').map(function(t) { return t.trim() }).filter(Boolean)
      if (teams.indexOf(teamName) >= 0) result.push(p)
    }
    return result
  }

  function validateUpdate(body) {
    var errors = []
    if (body.sentiment && VALID_SENTIMENTS.indexOf(body.sentiment) < 0) {
      errors.push('sentiment must be one of: ' + VALID_SENTIMENTS.join(', '))
    }
    if (body.highlights && (!Array.isArray(body.highlights) || body.highlights.length > MAX_ITEMS)) {
      errors.push('highlights must be an array with at most ' + MAX_ITEMS + ' items')
    }
    if (body.blockers && (!Array.isArray(body.blockers) || body.blockers.length > MAX_ITEMS)) {
      errors.push('blockers must be an array with at most ' + MAX_ITEMS + ' items')
    }
    if (body.plans && (!Array.isArray(body.plans) || body.plans.length > MAX_ITEMS)) {
      errors.push('plans must be an array with at most ' + MAX_ITEMS + ' items')
    }
    if (body.tags && (!Array.isArray(body.tags) || body.tags.length > 10)) {
      errors.push('tags must be an array with at most 10 items')
    }
    return errors
  }

  // ─── Period Routes ───

  router.get('/periods', function(req, res) {
    var count = parseInt(req.query.count, 10) || 12
    res.json({ periods: periods.listPeriods(Math.min(count, 52)) })
  })

  router.get('/periods/current', function(req, res) {
    var current = periods.getCurrentPeriod()
    res.json(current)
  })

  // ─── My Update Routes ───

  router.get('/my-update/:periodEnd', function(req, res) {
    var periodEnd = req.params.periodEnd
    if (!periods.isValidPeriodEnd(periodEnd)) {
      return res.status(400).json({ error: 'Invalid periodEnd — must be a Sunday (YYYY-MM-DD)' })
    }

    var person = findPersonByEmail(req.userEmail)
    if (!person) {
      return res.status(404).json({ error: 'No registry entry found for ' + req.userEmail })
    }

    var bounds = periods.getWeekBounds(new Date(periodEnd + 'T00:00:00Z'))
    var existing = readData('updates/' + person.uid + '/' + periodEnd + '.json')

    // Always compute fresh auto-metrics
    var metrics = autoMetrics.getAutoMetrics(storage, person, bounds.periodStart, bounds.periodEnd)

    if (existing) {
      existing.autoMetrics = metrics
      return res.json(existing)
    }

    // Return a draft shell
    res.json({
      uid: person.uid,
      personName: person.name,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      status: 'draft',
      autoMetrics: metrics,
      highlights: [],
      blockers: [],
      plans: [],
      sentiment: null,
      tags: [],
      notes: ''
    })
  })

  router.put('/my-update/:periodEnd', function(req, res) {
    var periodEnd = req.params.periodEnd
    if (!periods.isValidPeriodEnd(periodEnd)) {
      return res.status(400).json({ error: 'Invalid periodEnd — must be a Sunday (YYYY-MM-DD)' })
    }

    var person = findPersonByEmail(req.userEmail)
    if (!person) {
      return res.status(404).json({ error: 'No registry entry found for ' + req.userEmail })
    }

    var errors = validateUpdate(req.body)
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; ') })
    }

    var bounds = periods.getWeekBounds(new Date(periodEnd + 'T00:00:00Z'))
    var now = new Date().toISOString()
    var existing = readData('updates/' + person.uid + '/' + periodEnd + '.json')

    var update = {
      uid: person.uid,
      personName: person.name,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      submittedAt: existing ? existing.submittedAt : now,
      updatedAt: now,
      status: 'submitted',
      highlights: req.body.highlights || [],
      blockers: req.body.blockers || [],
      plans: req.body.plans || [],
      sentiment: req.body.sentiment || null,
      tags: req.body.tags || [],
      notes: req.body.notes || ''
    }

    writeData('updates/' + person.uid + '/' + periodEnd + '.json', update)

    // Return with fresh auto-metrics
    update.autoMetrics = autoMetrics.getAutoMetrics(storage, person, bounds.periodStart, bounds.periodEnd)
    res.json(update)
  })

  // ─── Aggregation Route (powers all views) ───

  function getPeopleByOrg(orgRoot) {
    var reg = getRegistry()
    if (!reg || !reg.people) return []
    var result = []
    var uids = Object.keys(reg.people)
    for (var i = 0; i < uids.length; i++) {
      var p = reg.people[uids[i]]
      if (p.status === 'active' && p.orgRoot === orgRoot) result.push(p)
    }
    return result
  }

  var registryHelpers = {
    getPeopleByTeam: getPeopleByTeam,
    getDirectReports: getDirectReports,
    getPeopleByOrg: getPeopleByOrg
  }

  // ─── Tag Scanning ───

  function scanUpdatesForTag(periodEnd, tag) {
    var reg = getRegistry()
    if (!reg || !reg.people) return []
    var matched = []
    var uids = Object.keys(reg.people)
    for (var i = 0; i < uids.length; i++) {
      var update = readData('updates/' + uids[i] + '/' + periodEnd + '.json')
      if (update && update.tags && update.tags.indexOf(tag) >= 0) {
        matched.push(reg.people[uids[i]])
      }
    }
    return matched
  }

  function collectAllTags(periodCount) {
    var tagCounts = {}
    var periodList = periods.listPeriods(periodCount || 4)
    var reg = getRegistry()
    if (!reg || !reg.people) return []
    var uids = Object.keys(reg.people)
    for (var pi = 0; pi < periodList.length; pi++) {
      var pe = periodList[pi].periodEnd
      for (var ui = 0; ui < uids.length; ui++) {
        var update = readData('updates/' + uids[ui] + '/' + pe + '.json')
        if (update && update.tags) {
          for (var ti = 0; ti < update.tags.length; ti++) {
            var t = update.tags[ti]
            tagCounts[t] = (tagCounts[t] || 0) + 1
          }
        }
      }
    }
    return Object.keys(tagCounts).map(function(tag) {
      return { tag: tag, count: tagCounts[tag] }
    }).sort(function(a, b) { return b.count - a.count })
  }

  router.get('/tags', function(req, res) {
    var config = readData('config.json') || {}
    var pinnedTags = config.pinnedTags || []
    var recentTags = collectAllTags(4)
    res.json({ pinnedTags: pinnedTags, recentTags: recentTags })
  })

  // ─── Aggregation Route (powers all views) ───

  router.get('/aggregate/:periodEnd', function(req, res) {
    var periodEnd = req.params.periodEnd
    if (!periods.isValidPeriodEnd(periodEnd)) {
      return res.status(400).json({ error: 'Invalid periodEnd — must be a Sunday (YYYY-MM-DD)' })
    }

    var axis = req.query.axis
    var value = req.query.value
    var SUPPORTED_AXES = ['team', 'management', 'org', 'tag']

    if (!axis || !value) {
      return res.status(400).json({ error: 'axis and value query parameters are required' })
    }
    if (SUPPORTED_AXES.indexOf(axis) < 0) {
      return res.status(400).json({ error: 'Unsupported axis: ' + axis + '. Supported: ' + SUPPORTED_AXES.join(', ') })
    }

    // For tag axis, scan all updates and resolve people who used this tag
    var tagPeople
    if (axis === 'tag') {
      tagPeople = scanUpdatesForTag(periodEnd, value)
    }

    var result = aggregation.aggregate({
      axis: axis,
      value: value,
      periodEnd: periodEnd,
      detail: req.query.detail || undefined,
      groupBy: req.query.groupBy || (axis === 'tag' ? 'team' : undefined),
      readUpdate: function(uid, pe) {
        return readData('updates/' + uid + '/' + pe + '.json')
      },
      registryHelpers: registryHelpers,
      tagPeople: tagPeople
    })

    // Attach commentary if available
    var commentary = readData('commentary/' + value + '/' + periodEnd + '.json')
    if (commentary && commentary.axis === axis) {
      result.commentary = commentary
    }

    res.json(result)
  })

  // ─── Commentary Routes ───

  router.get('/commentary/:periodEnd', function(req, res) {
    var periodEnd = req.params.periodEnd
    if (!periods.isValidPeriodEnd(periodEnd)) {
      return res.status(400).json({ error: 'Invalid periodEnd' })
    }
    var axis = req.query.axis
    var value = req.query.value
    if (!axis || !value) {
      return res.status(400).json({ error: 'axis and value are required' })
    }
    var commentary = readData('commentary/' + value + '/' + periodEnd + '.json')
    if (!commentary || commentary.axis !== axis) {
      return res.json(null)
    }
    res.json(commentary)
  })

  router.put('/commentary/:periodEnd', function(req, res) {
    var periodEnd = req.params.periodEnd
    if (!periods.isValidPeriodEnd(periodEnd)) {
      return res.status(400).json({ error: 'Invalid periodEnd' })
    }
    var body = req.body
    if (!body.axis || !body.value) {
      return res.status(400).json({ error: 'axis and value are required in body' })
    }

    var person = findPersonByEmail(req.userEmail)
    var commentary = {
      authorUid: person ? person.uid : req.userEmail,
      authorName: person ? person.name : req.userEmail,
      axis: body.axis,
      value: body.value,
      periodEnd: periodEnd,
      updatedAt: new Date().toISOString(),
      summary: body.summary || '',
      highlights: body.highlights || [],
      risks: body.risks || [],
      escalations: body.escalations || []
    }

    writeData('commentary/' + body.value + '/' + periodEnd + '.json', commentary)
    res.json(commentary)
  })

  // ─── Heatmap Route (all orgs at a glance) ───

  router.get('/heatmap/:periodEnd', context.requireAdmin, function(req, res) {
    var periodEnd = req.params.periodEnd
    if (!periods.isValidPeriodEnd(periodEnd)) {
      return res.status(400).json({ error: 'Invalid periodEnd' })
    }

    var reg = getRegistry()
    if (!reg || !reg.meta || !reg.meta.orgRoots) {
      return res.json({ orgs: [] })
    }

    var config = require('../../../../shared/server/roster-sync/config')
    var orgDisplayNames = config.getOrgDisplayNames ? config.getOrgDisplayNames(storage) : {}

    var orgs = reg.meta.orgRoots.map(function(orgRoot) {
      var people = getPeopleByOrg(orgRoot)
      var submitted = 0
      var sentiment = { green: 0, yellow: 0, red: 0 }
      var blockerCount = 0

      for (var i = 0; i < people.length; i++) {
        var update = readData('updates/' + people[i].uid + '/' + periodEnd + '.json')
        if (update) {
          submitted++
          if (update.sentiment && sentiment[update.sentiment] !== undefined) {
            sentiment[update.sentiment]++
          }
          var bl = update.blockers || []
          for (var j = 0; j < bl.length; j++) {
            if (!bl[j].resolved) blockerCount++
          }
        }
      }

      var submissionRate = people.length > 0 ? Math.round((submitted / people.length) * 100) : 0
      var health = 'green'
      if (sentiment.red > 0 || submissionRate < 60) health = 'red'
      else if (sentiment.yellow > 0 || submissionRate < 80) health = 'yellow'

      var commentary = readData('commentary/' + orgRoot + '/' + periodEnd + '.json')

      return {
        orgRoot: orgRoot,
        displayName: orgDisplayNames[orgRoot] || orgRoot,
        total: people.length,
        submitted: submitted,
        submissionRate: submissionRate,
        sentiment: sentiment,
        blockerCount: blockerCount,
        health: health,
        commentary: commentary ? { summary: commentary.summary, authorName: commentary.authorName } : null
      }
    })

    res.json({ periodEnd: periodEnd, orgs: orgs, vp: reg.meta.vp || null })
  })

  // ─── Config Routes ───

  router.get('/config', context.requireAdmin, function(req, res) {
    var cfg = readData('config.json') || {
      cadence: 'weekly',
      deadlineDay: 'friday',
      reminderDay: 'thursday',
      pinnedTags: [],
      thresholds: { blockerAgeWeeksForEscalation: 2, lowSubmissionRatePercent: 60 }
    }
    res.json(cfg)
  })

  router.post('/config', context.requireAdmin, function(req, res) {
    var body = req.body
    var cfg = readData('config.json') || {}
    if (body.cadence) cfg.cadence = body.cadence
    if (body.deadlineDay) cfg.deadlineDay = body.deadlineDay
    if (body.reminderDay) cfg.reminderDay = body.reminderDay
    if (body.pinnedTags) cfg.pinnedTags = body.pinnedTags
    if (body.thresholds) cfg.thresholds = Object.assign(cfg.thresholds || {}, body.thresholds)
    writeData('config.json', cfg)
    res.json(cfg)
  })

  // ─── History & Trends Routes ───

  router.get('/person/:uid/history', function(req, res) {
    var uid = req.params.uid
    var count = parseInt(req.query.periods, 10) || 12
    var trendData = trends.personTrends(
      function(u, pe) { return readData('updates/' + u + '/' + pe + '.json') },
      uid,
      Math.min(count, 52)
    )
    var shifts = trends.detectShifts(trendData)
    res.json({ uid: uid, periods: trendData, shifts: shifts })
  })

  router.get('/trends', function(req, res) {
    var axis = req.query.axis
    var value = req.query.value
    var count = parseInt(req.query.periods, 10) || 12

    if (!axis || !value) {
      return res.status(400).json({ error: 'axis and value are required' })
    }

    var SUPPORTED = ['team', 'management', 'org']
    if (SUPPORTED.indexOf(axis) < 0) {
      return res.status(400).json({ error: 'Unsupported axis for trends' })
    }

    var people = aggregation.resolvePeople(axis, value, registryHelpers, {})
    var trendData = trends.groupTrends(
      function(uid, pe) { return readData('updates/' + uid + '/' + pe + '.json') },
      people,
      Math.min(count, 52)
    )
    var shifts = trends.detectShifts(trendData)
    res.json({ axis: axis, value: value, periods: trendData, shifts: shifts })
  })

  // Diagnostics
  if (context.registerDiagnostics) {
    context.registerDiagnostics(function() {
      var current = periods.getCurrentPeriod()
      return Promise.resolve({
        currentPeriod: current,
        dataPrefix: DATA_PREFIX
      })
    })
  }
}
