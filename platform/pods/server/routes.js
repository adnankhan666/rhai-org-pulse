/**
 * Pod API routes.
 *
 * Mounted by the platform loader at /api/modules/team-tracker.
 */

const {
  PodError,
  MIN_CREATE_MEMBERS,
  normalizePodName,
  normalizeDescription,
  normalizeFocusKeys,
  normalizeMemberUids
} = require('./validation')
const {
  listPods,
  getPod,
  createPod,
  addMembers,
  archivePod,
  nextOutcome,
  setPodProgress
} = require('./pod-store')
const {
  getPodCreationPermission,
  canManagePod
} = require('./permissions')
const { getOrgDisplayNames } = require('../../../shared/server/roster-sync/config')
const { createJiraClient } = require('../../../shared/server/jira')
const { primaryFocusKey, buildMirror, buildMirrors, validateFeatureKeys } = require('./pod-mirror')
const { generatePod360ForPod } = require('./pod-360-runner')
const { getScheduleInfo, startScheduler } = require('./pod-360-schedule')
const { confluenceStatus, publishPage, readSettings } = require('./confluence')

function asyncRoute(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

function requireUser(req, res, next) {
  if (!req.userEmail) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  next()
}

async function loadPeopleMap(storage) {
  const registry = await storage.readFromStorage('team-data/registry.json')
  return registry?.people || {}
}

async function loadReleases(storage) {
  try {
    const cache = await storage.readFromStorage('releases/delivery/product-pages-releases-cache.json')
    return (cache && cache.releases) || []
  } catch (err) {
    console.warn('[pods] Product Pages cache unavailable:', err.message)
    return []
  }
}

async function loadOrgNames(storage) {
  const names = await getOrgDisplayNames(storage)
  return { ...names, _auxiliary: 'Non-Engineering' }
}

function resolvePod(pod, peopleMap, orgNames) {
  const members = (pod.memberUids || []).map(uid => {
    const person = peopleMap[uid]
    if (!person) {
      return { uid, name: null, missing: true }
    }

    return {
      uid,
      name: person.name,
      title: person.title,
      orgRoot: person.orgRoot,
      orgDisplayName: orgNames[person.orgRoot] || (person.orgRoot === '_auxiliary' ? 'Non-Engineering' : person.orgRoot),
      orgType: person.orgType || 'engineering',
      status: person.status,
      teamIds: person.teamIds || []
    }
  })

  return {
    ...pod,
    memberCount: members.length,
    members
  }
}

async function getTeamMemberUids(context, teamId, peopleMap) {
  const teamsData = await context.teamStore.readTeams()
  const team = teamsData?.teams?.[teamId]
  if (!team) return new Set()

  const uids = new Set(team.managers || [])
  for (const [uid, person] of Object.entries(peopleMap)) {
    if ((person.teamIds || []).includes(teamId)) uids.add(uid)
  }
  return uids
}

async function audit(context, req, action, pod, detail) {
  if (!context.auditLog) return
  try {
    await context.auditLog.appendAuditEntry({
      action,
      actor: req.auditActor || req.userEmail,
      entityType: 'pod',
      entityId: pod.id,
      entityLabel: pod.name,
      detail
    })
  } catch (err) {
    console.error('[pods] Failed to write audit entry:', err.message)
  }
}

const FEATURE_REJECTIONS = {
  not_found: 'not found in Jira (or no access)',
  not_a_feature: 'is not a Feature',
  closed: 'is already closed'
}

/**
 * Reject pod creation for keys that are not open Jira features.
 * Fails closed: if Jira cannot be reached we do not guess.
 */
async function assertFeaturesUsable(context, jira, focusKeys) {
  if (!context.secrets || !context.secrets.JIRA_TOKEN) {
    throw new PodError(502, 'Jira credentials are not configured, cannot verify feature keys')
  }

  let result
  try {
    result = await validateFeatureKeys({ jira, keys: focusKeys })
  } catch (err) {
    throw new PodError(502, 'Could not verify the feature key with Jira', { reason: err.message })
  }

  if (result.invalid.length === 0) return

  const parts = result.invalid.map(entry => {
    const base = `${entry.key} ${FEATURE_REJECTIONS[entry.reason] || entry.reason}`
    if (entry.issueType) {
      const article = /^[aeiou]/i.test(entry.issueType) ? 'an' : 'a'
      return `${base} (it is ${article} ${entry.issueType})`
    }
    if (entry.status) return `${base} (${entry.status})`
    return base
  })

  throw new PodError(400, `Feature key rejected: ${parts.join('; ')}`, {
    invalidKeys: result.invalid
  })
}

function registerPodRoutes(router, context) {
  const storage = context.storage
  const readAccess = context.requireScope('roster:read')

  // Read-only Jira client for the pod work mirror. No writes anywhere.
  const podJiraClient = createJiraClient({
    email: (context.secrets && context.secrets.JIRA_EMAIL) || '',
    token: (context.secrets && context.secrets.JIRA_TOKEN) || '',
    host: process.env.JIRA_HOST
  })

  /**
   * @openapi
   * /api/modules/team-tracker/pods:
   *   get:
   *     tags: ['Pods']
   *     summary: List pods
   *     responses:
   *       200:
   *         description: Pods with resolved member records
   */
  router.get('/pods', readAccess, asyncRoute(async function (req, res) {
    const requestedStatus = req.query.status || 'active'
    if (!['active', 'archived', 'all'].includes(requestedStatus)) {
      throw new PodError(400, 'status must be active, archived, or all')
    }

    const peopleMap = await loadPeopleMap(storage)
    const orgNames = await loadOrgNames(storage)
    let pods = await listPods(storage)

    if (requestedStatus !== 'all') {
      pods = pods.filter(pod => pod.status === requestedStatus)
    }

    if (req.query.memberUid) {
      pods = pods.filter(pod => (pod.memberUids || []).includes(req.query.memberUid))
    }

    if (req.query.teamId) {
      const teamMemberUids = await getTeamMemberUids(context, req.query.teamId, peopleMap)
      pods = pods.filter(pod => (pod.memberUids || []).some(uid => teamMemberUids.has(uid)))
    }

    let resolved = pods.map(pod => resolvePod(pod, peopleMap, orgNames))

    if (req.query.q) {
      const query = String(req.query.q).toLowerCase()
      resolved = resolved.filter(pod => {
        const searchable = [
          pod.name,
          ...pod.members.map(member => member.name || '')
        ].join(' ').toLowerCase()
        return searchable.includes(query)
      })
    }

    resolved.sort((a, b) => {
      const byCreated = String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      return byCreated || String(a.name || '').localeCompare(String(b.name || ''))
    })

    res.json({ pods: resolved, total: resolved.length })
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/permissions/me:
   *   get:
   *     tags: ['Pods']
   *     summary: Check whether the current user can create pods
   *     responses:
   *       200:
   *         description: Pod creation permission and title context
   */
  router.get('/pods/permissions/me', readAccess, asyncRoute(async function (req, res) {
    const permission = await getPodCreationPermission(req, storage)
    res.json({
      canCreate: permission.allowed,
      isAdmin: permission.isAdmin,
      email: req.userEmail,
      title: permission.title,
      titleLevel: permission.titleLevel,
      reason: permission.reason
    })
  }))

  // Weekly 360 generation. Thursday 09:00 UTC; disabled with POD_360_SCHEDULE=off.
  if (process.env.POD_360_SCHEDULE !== 'off') {
    startScheduler({
      storage,
      generateForPod: async function () {
        const pods = (await listPods(storage)).filter(pod => pod.status === 'active')
        const peopleMap = await loadPeopleMap(storage)
        const releases = await loadReleases(storage)
        let generated = 0
        for (const pod of pods) {
          if (!primaryFocusKey(pod)) continue
          try {
            await generatePod360ForPod({ storage, jira: podJiraClient, pod, peopleMap, releases })
            generated += 1
          } catch (err) {
            console.warn(`[pods] weekly 360 failed for ${pod.name}:`, err.message)
          }
        }
        return generated
      }
    })
  }

  /**
   * @openapi
   * /api/modules/team-tracker/pods/{podId}:
   *   get:
   *     tags: ['Pods']
   *     summary: Get a pod by ID
   *     parameters:
   *       - in: path
   *         name: podId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Pod with resolved member records
   *       404:
   *         description: Pod not found
   */
  router.get('/pods/:podId', readAccess, asyncRoute(async function (req, res) {
    const pod = await getPod(storage, req.params.podId)
    if (!pod) throw new PodError(404, 'Pod not found')

    const peopleMap = await loadPeopleMap(storage)
    const orgNames = await loadOrgNames(storage)
    res.json({ pod: resolvePod(pod, peopleMap, orgNames) })
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/mirrors:
   *   post:
   *     tags: ['Pods']
   *     summary: Batch read-only work mirror for many pods
   *     description: >
   *       Resolves every requested pod's Jira feature in two queries total
   *       (`key in (...)` and `parent in (...)`), so card lists stay cheap as
   *       the pod count grows. Never writes to Jira or Product Pages.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [podIds]
   *             properties:
   *               podIds:
   *                 type: array
   *                 maxItems: 100
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Mirrors keyed by pod id; pods without a feature are omitted
   *       400:
   *         description: Invalid podIds payload
   *       502:
   *         description: Jira fetch failed
   */
  router.post('/pods/mirrors', readAccess, asyncRoute(async function (req, res) {
    const podIds = req.body && req.body.podIds
    if (!Array.isArray(podIds)) {
      throw new PodError(400, 'podIds must be an array of pod ids')
    }
    if (podIds.length > 100) {
      throw new PodError(400, 'At most 100 pods per request')
    }
    if (podIds.length === 0) {
      return res.json({ mirrors: {}, requested: 0 })
    }

    const wanted = new Set(podIds)
    const pods = (await listPods(storage)).filter(pod => wanted.has(pod.id) && pod.status === 'active')

    const keyByPod = {}
    const startDates = {}
    for (const pod of pods) {
      const key = primaryFocusKey(pod)
      if (!key) continue
      keyByPod[pod.id] = key
      if (!startDates[key]) startDates[key] = pod.createdAt
    }

    const issueKeys = [...new Set(Object.values(keyByPod))]
    if (issueKeys.length === 0) {
      return res.json({ mirrors: {}, requested: podIds.length })
    }

    if (!context.secrets || !context.secrets.JIRA_TOKEN) {
      throw new PodError(502, 'Jira credentials are not configured for the pod mirror', {
        issueKeys
      })
    }

    let releases = []
    try {
      const cache = await storage.readFromStorage('releases/delivery/product-pages-releases-cache.json')
      releases = (cache && cache.releases) || []
    } catch (err) {
      console.warn('[pods] Product Pages cache unavailable:', err.message)
    }

    let built
    try {
      built = await buildMirrors({ jira: podJiraClient, issueKeys, releases, startDates })
    } catch (err) {
      throw new PodError(502, 'Failed to build work mirrors from Jira', {
        issueKeys,
        reason: err.message
      })
    }

    const mirrors = {}
    for (const [podId, key] of Object.entries(keyByPod)) {
      if (built[key]) mirrors[podId] = built[key]
    }

    res.json({ mirrors, requested: podIds.length })
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/{podId}/360:
   *   get:
   *     tags: ['Pods']
   *     summary: Latest generated 360 report for a pod
   *     parameters:
   *       - in: path
   *         name: podId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Latest report, or null when none has been generated
   *       404:
   *         description: Pod not found
   *   post:
   *     tags: ['Pods']
   *     summary: Generate a pod 360 report
   *     description: >
   *       Applies the 360 contract to pod scope (feature plus child items).
   *       Deterministic: the same pod state produces the same markdown. Writes
   *       only to local storage; publishing is a separate action.
   *     parameters:
   *       - in: path
   *         name: podId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       201:
   *         description: Report generated and stored
   *       404:
   *         description: Pod not found
   *       502:
   *         description: Mirror data unavailable
   */
  router.get('/pods/:podId/360', readAccess, asyncRoute(async function (req, res) {
    const pod = await getPod(storage, req.params.podId)
    if (!pod) throw new PodError(404, 'Pod not found')

    const dir = `team-data/pods/${pod.id}/360`
    let files = []
    try {
      files = await storage.listStorageFiles(dir)
    } catch (err) {
      console.warn('[pods] 360 listing failed:', err.message)
    }

    const latest = files.filter(name => name.endsWith('.json')).sort().pop()
    if (!latest) {
      return res.json({ podId: pod.id, report: null })
    }

    const stored = await storage.readFromStorage(`${dir}/${latest}`)
    res.json({ podId: pod.id, report: stored })
  }))

  router.post('/pods/:podId/360', readAccess, asyncRoute(async function (req, res) {
    const pod = await getPod(storage, req.params.podId)
    if (!pod) throw new PodError(404, 'Pod not found')

    if (!primaryFocusKey(pod)) {
      throw new PodError(400, 'This pod has no Jira feature key to report on')
    }

    let report
    try {
      report = await generatePod360ForPod({
        storage,
        jira: podJiraClient,
        pod,
        peopleMap: await loadPeopleMap(storage),
        releases: await loadReleases(storage)
      })
    } catch (err) {
      throw new PodError(502, 'Failed to generate the 360 report', { reason: err.message })
    }

    await audit(context, req, 'pod.360.generate', pod, `Generated 360 report for "${pod.name}"`)

    res.status(201).json({ podId: pod.id, report })
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/360/schedule:
   *   get:
   *     tags: ['Pods']
   *     summary: Weekly 360 schedule and next run
   *     responses:
   *       200:
   *         description: Cadence, last run and next run
   */
  router.get('/pods/360/schedule', readAccess, asyncRoute(async function (req, res) {
    res.json(await getScheduleInfo(storage))
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/360/confluence:
   *   get:
   *     tags: ['Pods']
   *     summary: Whether Confluence publishing is configured
   *     responses:
   *       200:
   *         description: Configured flag plus the settings that are missing
   */
  router.get('/pods/360/confluence', readAccess, asyncRoute(async function (req, res) {
    res.json(confluenceStatus(context.secrets, process.env))
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/{podId}/360/publish:
   *   post:
   *     tags: ['Pods']
   *     summary: Publish the latest pod 360 report to Confluence
   *     description: >
   *       Creates a page under the configured parent. This is an external
   *       write, so it only runs when every Confluence setting is present and
   *       a report already exists.
   *     parameters:
   *       - in: path
   *         name: podId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       201:
   *         description: Page created and the report annotated with its link
   *       400:
   *         description: No report yet, or Confluence is not configured
   *       404:
   *         description: Pod not found
   *       502:
   *         description: Confluence rejected the page
   */
  router.post('/pods/:podId/360/publish', readAccess, asyncRoute(async function (req, res) {
    const pod = await getPod(storage, req.params.podId)
    if (!pod) throw new PodError(404, 'Pod not found')

    const dir = `team-data/pods/${pod.id}/360`
    let files = []
    try {
      files = await storage.listStorageFiles(dir)
    } catch (err) {
      console.warn('[pods] 360 listing failed:', err.message)
    }
    const latest = files.filter(name => name.endsWith('.json')).sort().pop()
    if (!latest) {
      throw new PodError(400, 'Generate the 360 report before publishing it')
    }

    const status = confluenceStatus(context.secrets, process.env)
    if (!status.configured) {
      throw new PodError(400, 'Confluence publishing is not configured', {
        configured: false,
        missing: status.missing
      })
    }

    const stored = await storage.readFromStorage(`${dir}/${latest}`)
    if (!stored) throw new PodError(400, 'Stored report could not be read')

    const day = latest.replace(/\.json$/, '')
    let page
    try {
      page = await publishPage({
        settings: readSettings(context.secrets, process.env),
        title: `${pod.name} — 360 — ${day}`,
        markdown: stored.markdown
      })
    } catch (err) {
      throw new PodError(502, err.message)
    }

    const report = {
      ...stored,
      confluence: {
        pageId: page.pageId,
        url: page.url,
        title: page.title,
        publishedAt: new Date().toISOString()
      }
    }
    await storage.writeToStorage(`${dir}/${latest}`, report)
    await audit(context, req, 'pod.360.publish', pod, `Published 360 report for "${pod.name}" to Confluence`)

    res.status(201).json({ podId: pod.id, report })
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/{podId}/mirror:
   *   get:
   *     tags: ['Pods']
   *     summary: Read-only work mirror for a pod's Jira feature
   *     description: >
   *       Projects the pod's primary Jira focus key into a display-time view:
   *       feature fields, child-item rollup, and the Product Pages code-freeze
   *       milestone. Never writes to Jira or Product Pages.
   *     parameters:
   *       - in: path
   *         name: podId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Mirror payload, or a null mirror with a reason
   *       404:
   *         description: Pod not found
   *       502:
   *         description: Jira or Product Pages fetch failed
   */
  router.get('/pods/:podId/mirror', readAccess, asyncRoute(async function (req, res) {
    const pod = await getPod(storage, req.params.podId)
    if (!pod) throw new PodError(404, 'Pod not found')

    const issueKey = primaryFocusKey(pod)
    if (!issueKey) {
      return res.json({ podId: pod.id, mirror: null, reason: 'no-jira-focus-key' })
    }

    let releases = []
    try {
      const cache = await storage.readFromStorage('releases/delivery/product-pages-releases-cache.json')
      releases = (cache && cache.releases) || []
    } catch (err) {
      console.warn('[pods] Product Pages cache unavailable:', err.message)
    }

    if (!context.secrets || !context.secrets.JIRA_TOKEN) {
      throw new PodError(502, 'Jira credentials are not configured for the pod mirror', {
        issueKey
      })
    }

    try {
      const mirror = await buildMirror({
        jira: podJiraClient,
        issueKey,
        releases,
        startDate: pod.createdAt
      })
      res.json({ podId: pod.id, issueKey, mirror })
    } catch (err) {
      throw new PodError(502, 'Failed to build work mirror from Jira', {
        issueKey,
        reason: err.message
      })
    }
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods:
   *   post:
   *     tags: ['Pods']
   *     summary: Create a pod
   *     responses:
   *       201:
   *         description: Pod created
   *       400:
   *         description: Invalid name or members
   *       403:
   *         description: User is not a senior leader or admin
   *       409:
   *         description: Duplicate pod name
   */
  router.post('/pods', requireUser, asyncRoute(async function (req, res) {
    const permission = await getPodCreationPermission(req, storage)
    if (!permission.allowed) {
      throw new PodError(403, 'Only Senior Manager and above can create pods', {
        reason: permission.reason,
        title: permission.title
      })
    }

    const peopleMap = await loadPeopleMap(storage)
    const name = normalizePodName(req.body?.name)
    const memberUids = normalizeMemberUids(req.body?.memberUids, peopleMap)
    const description = normalizeDescription(req.body?.description)
    const focusKeys = normalizeFocusKeys(req.body?.focusKeys, { required: true })
    await assertFeaturesUsable(context, podJiraClient, focusKeys)

    const pod = await createPod(storage, {
      name,
      description,
      focusKeys,
      memberUids,
      createdBy: req.userEmail
    })

    await audit(context, req, 'pod.create', pod, `Created pod "${pod.name}" with ${pod.memberUids.length} members`)

    const orgNames = await loadOrgNames(storage)
    res.status(201).json({ pod: resolvePod(pod, peopleMap, orgNames) })
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/{podId}/members:
   *   post:
   *     tags: ['Pods']
   *     summary: Add members to a pod
   *     description: Add-only. Existing members cannot be removed.
   *     parameters:
   *       - in: path
   *         name: podId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Pod with updated members
   *       400:
   *         description: Invalid member additions
   *       403:
   *         description: Not the pod creator or an admin
   *       404:
   *         description: Pod not found
   */
  router.post('/pods/:podId/members', requireUser, asyncRoute(async function (req, res) {
    const pod = await getPod(storage, req.params.podId)
    if (!pod) throw new PodError(404, 'Pod not found')
    if (!canManagePod(req, pod)) {
      throw new PodError(403, 'Only the pod creator or an admin can add members')
    }

    const peopleMap = await loadPeopleMap(storage)
    const additions = normalizeMemberUids(req.body?.memberUids, peopleMap, { min: 1 })
    const existing = new Set(pod.memberUids || [])
    const newUids = additions.filter(uid => !existing.has(uid))
    if (newUids.length === 0) {
      throw new PodError(400, 'No new members to add')
    }

    const updated = await addMembers(storage, pod.id, newUids, req.userEmail)
    await audit(context, req, 'pod.members.add', updated, `Added ${newUids.length} member(s) to pod "${updated.name}"`)

    const orgNames = await loadOrgNames(storage)
    res.json({ pod: resolvePod(updated, peopleMap, orgNames) })
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/{podId}/duplicate:
   *   post:
   *     tags: ['Pods']
   *     summary: Duplicate a pod with a new name
   *     parameters:
   *       - in: path
   *         name: podId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       201:
   *         description: New pod created
   *       403:
   *         description: Not the pod creator or an admin
   *       404:
   *         description: Pod not found
   *       409:
   *         description: Duplicate pod name
   */
  router.post('/pods/:podId/duplicate', requireUser, asyncRoute(async function (req, res) {
    const source = await getPod(storage, req.params.podId)
    if (!source) throw new PodError(404, 'Pod not found')
    if (!canManagePod(req, source)) {
      throw new PodError(403, 'Only the pod creator or an admin can duplicate this pod')
    }
    if (source.status === 'active') {
      throw new PodError(409, 'Archive the source pod before duplicating it')
    }
    if (!Array.isArray(source.memberUids) || source.memberUids.length < MIN_CREATE_MEMBERS) {
      throw new PodError(400, `A pod needs at least ${MIN_CREATE_MEMBERS} members to duplicate`)
    }

    const name = normalizePodName(req.body?.name)
    const description = normalizeDescription(req.body?.description ?? source.description)
    const focusKeys = normalizeFocusKeys(req.body?.focusKeys ?? source.focusKeys, { required: true })
    const peopleMap = await loadPeopleMap(storage)

    const pod = await createPod(storage, {
      name,
      description,
      focusKeys,
      memberUids: source.memberUids,
      createdBy: req.userEmail,
      sourcePodId: source.id
    })

    await audit(context, req, 'pod.duplicate', pod, `Duplicated pod "${source.name}" as "${pod.name}"`)

    const orgNames = await loadOrgNames(storage)
    res.status(201).json({ pod: resolvePod(pod, peopleMap, orgNames) })
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/{podId}/next-outcome:
   *   post:
   *     tags: ['Pods']
   *     summary: Start a new pod for the next outcome and archive the current pod
   *     parameters:
   *       - in: path
   *         name: podId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       201:
   *         description: New pod created and source pod archived
   *       400:
   *         description: Pod is not active
   *       403:
   *         description: Not the pod creator or an admin
   *       404:
   *         description: Pod not found
   *       409:
   *         description: Duplicate pod name or member already in another active pod
   */
  router.post('/pods/:podId/next-outcome', requireUser, asyncRoute(async function (req, res) {
    const source = await getPod(storage, req.params.podId)
    if (!source) throw new PodError(404, 'Pod not found')
    if (!canManagePod(req, source)) {
      throw new PodError(403, 'Only the pod creator or an admin can start the next outcome')
    }
    if (source.status !== 'active') {
      throw new PodError(400, 'Only active pods can start a next outcome')
    }

    const name = normalizePodName(req.body?.name)
    const focusKeys = normalizeFocusKeys(req.body?.focusKeys, { required: true })
    const description = normalizeDescription(req.body?.description ?? source.description)

    // A next outcome is new work, so it cannot reuse the pod's current feature.
    const sourceKeys = new Set((source.focusKeys || []).map(key => String(key).toUpperCase()))
    const reused = focusKeys.filter(key => sourceKeys.has(key))
    if (reused.length > 0) {
      throw new PodError(400, `A next outcome needs a different feature key: ${reused.join(', ')} is the current one`, {
        reusedKeys: reused
      })
    }
    await assertFeaturesUsable(context, podJiraClient, focusKeys)

    const result = await nextOutcome(storage, source.id, {
      name,
      description,
      focusKeys,
      createdBy: req.userEmail
    })
    if (!result) throw new PodError(404, 'Pod not found')

    await audit(context, req, 'pod.next-outcome', result.pod, `Started next outcome "${result.pod.name}" from "${source.name}"`)

    const peopleMap = await loadPeopleMap(storage)
    const orgNames = await loadOrgNames(storage)
    res.status(201).json({ pod: resolvePod(result.pod, peopleMap, orgNames) })
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/{podId}/progress:
   *   patch:
   *     tags: ['Pods']
   *     summary: Update a pod's percent-complete progress
   *     parameters:
   *       - in: path
   *         name: podId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - progressPct
   *             properties:
   *               progressPct:
   *                 type: integer
   *                 minimum: 0
   *                 maximum: 100
   *     responses:
   *       200:
   *         description: Pod with updated progress
   *       400:
   *         description: Invalid progress value, or pod is archived
   *       403:
   *         description: Not the pod creator or an admin
   *       404:
   *         description: Pod not found
   */
  router.patch('/pods/:podId/progress', requireUser, asyncRoute(async function (req, res) {
    const pod = await getPod(storage, req.params.podId)
    if (!pod) throw new PodError(404, 'Pod not found')
    if (!canManagePod(req, pod)) {
      throw new PodError(403, 'Only the pod creator or an admin can update progress')
    }

    const pct = Number(req.body?.progressPct)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new PodError(400, 'progressPct must be a number between 0 and 100')
    }

    const updated = await setPodProgress(storage, pod.id, pct, req.userEmail)

    await audit(context, req, 'pod.progress.update', updated, `Set progress of "${updated.name}" to ${updated.progressPct}%`)

    const peopleMap = await loadPeopleMap(storage)
    const orgNames = await loadOrgNames(storage)
    res.json({ pod: resolvePod(updated, peopleMap, orgNames) })
  }))

  /**
   * @openapi
   * /api/modules/team-tracker/pods/{podId}/archive:
   *   post:
   *     tags: ['Pods']
   *     summary: Archive a pod
   *     parameters:
   *       - in: path
   *         name: podId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Pod archived
   *       403:
   *         description: Not the pod creator or an admin
   *       404:
   *         description: Pod not found
   */
  router.post('/pods/:podId/archive', requireUser, asyncRoute(async function (req, res) {
    const pod = await getPod(storage, req.params.podId)
    if (!pod) throw new PodError(404, 'Pod not found')
    if (!canManagePod(req, pod)) {
      throw new PodError(403, 'Only the pod creator or an admin can archive this pod')
    }

    const updated = pod.status === 'archived'
      ? pod
      : await archivePod(storage, pod.id, req.userEmail)

    if (pod.status !== 'archived') {
      await audit(context, req, 'pod.archive', updated, `Archived pod "${updated.name}"`)
    }

    const peopleMap = await loadPeopleMap(storage)
    const orgNames = await loadOrgNames(storage)
    res.json({ pod: resolvePod(updated, peopleMap, orgNames) })
  }))

  router.use(function (err, req, res, next) {
    if (res.headersSent) return next(err)
    const status = err.status || 500
    if (status >= 500) console.error('[pods] request failed:', err)
    const body = { error: err.message || 'Pod request failed' }
    if (err.details) body.details = err.details
    res.status(status).json(body)
  })
}

module.exports = registerPodRoutes
