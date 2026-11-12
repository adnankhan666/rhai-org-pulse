/**
 * Pod persistence.
 *
 * Production: one JSON file per pod under team-data/pods/.
 * Demo: an in-memory store so create/edit works for the session even though
 * demo storage is read-only.
 */

const crypto = require('crypto')
const {
  PodError,
  assertUniquePodName,
  assertMembersAvailableInActivePods,
  MAX_MEMBERS
} = require('./validation')

const PODS_DIR = 'team-data/pods'
const DEMO_MODE = process.env.DEMO_MODE === 'true'

const memoryPods = new Map()
let writeChain = Promise.resolve()

function withWriteLock(fn) {
  const run = writeChain.then(fn, fn)
  writeChain = run.catch(() => {})
  return run
}

function podKey(id) {
  return `${PODS_DIR}/${id}.json`
}

function generatePodId(existingIds) {
  let id
  do {
    id = 'pod_' + crypto.randomBytes(8).toString('hex')
  } while (existingIds.has(id))
  return id
}

function nowIso() {
  return new Date().toISOString()
}

async function listPods(storage) {
  if (DEMO_MODE) {
    return [...memoryPods.values()].map(pod => structuredClone(pod))
  }

  const files = await storage.listStorageFiles(PODS_DIR)
  const pods = await Promise.all(
    files.map(file => storage.readFromStorage(`${PODS_DIR}/${file}`))
  )
  return pods.filter(Boolean)
}

async function getPod(storage, podId) {
  if (DEMO_MODE) {
    const pod = memoryPods.get(podId)
    return pod ? structuredClone(pod) : null
  }

  return storage.readFromStorage(podKey(podId))
}

async function savePod(storage, pod) {
  if (DEMO_MODE) {
    memoryPods.set(pod.id, structuredClone(pod))
    return
  }

  await storage.writeToStorage(podKey(pod.id), pod)
}

function buildPodRecord(data, pods) {
  const existingIds = new Set(pods.map(pod => pod.id))
  const timestamp = nowIso()

  return {
    id: generatePodId(existingIds),
    name: data.name,
    description: data.description || '',
    focusKeys: [...(data.focusKeys || [])],
    status: 'active',
    memberUids: [...data.memberUids],
    progressPct: 0,
    createdBy: data.createdBy,
    createdAt: timestamp,
    updatedBy: data.createdBy,
    updatedAt: timestamp,
    archivedBy: null,
    archivedAt: null,
    sourcePodId: data.sourcePodId || null,
    version: 1
  }
}

async function createPod(storage, data) {
  return withWriteLock(async () => {
    const pods = await listPods(storage)
    assertUniquePodName(data.name, pods)
    assertMembersAvailableInActivePods(pods, data.memberUids)

    const pod = buildPodRecord(data, pods)
    await savePod(storage, pod)
    return pod
  })
}

async function updatePod(storage, podId, mutate) {
  return withWriteLock(async () => {
    const pod = await getPod(storage, podId)
    if (!pod) return null

    const next = mutate({ ...pod, memberUids: [...pod.memberUids] }) || pod
    next.updatedAt = nowIso()
    next.updatedBy = next.updatedBy || pod.updatedBy
    next.version = (pod.version || 1) + 1

    await savePod(storage, next)
    return next
  })
}

async function addMembers(storage, podId, memberUids, actor) {
  return withWriteLock(async () => {
    const pods = await listPods(storage)
    const pod = pods.find(item => item.id === podId)
    if (!pod) return null

    if (pod.status !== 'active') {
      throw new PodError(400, 'Archived pods cannot be changed')
    }

    const existing = new Set(pod.memberUids)
    const additions = memberUids.filter(uid => !existing.has(uid))
    if (additions.length === 0) {
      throw new PodError(400, 'No new members to add')
    }

    const nextCount = pod.memberUids.length + additions.length
    if (nextCount > MAX_MEMBERS) {
      throw new PodError(400, `A pod can have at most ${MAX_MEMBERS} members`)
    }

    assertMembersAvailableInActivePods(pods, additions, podId)

    pod.memberUids.push(...additions)
    pod.updatedBy = actor
    pod.updatedAt = nowIso()
    pod.version = (pod.version || 1) + 1

    await savePod(storage, pod)
    return pod
  })
}

async function archivePod(storage, podId, actor) {
  return updatePod(storage, podId, pod => {
    if (pod.status === 'archived') return pod
    pod.status = 'archived'
    pod.archivedAt = nowIso()
    pod.archivedBy = actor
    pod.updatedBy = actor
    return pod
  })
}

/**
 * Set the percent-complete progress (0-100) of an active pod.
 */
async function setPodProgress(storage, podId, progressPct, actor) {
  return updatePod(storage, podId, pod => {
    if (pod.status !== 'active') {
      throw new PodError(400, 'Only active pods can update progress')
    }
    pod.progressPct = Math.max(0, Math.min(100, Math.round(progressPct)))
    pod.updatedBy = actor
    return pod
  })
}

async function nextOutcome(storage, podId, data) {
  return withWriteLock(async () => {
    const pods = await listPods(storage)
    const source = pods.find(pod => pod.id === podId)
    if (!source) return null
    if (source.status !== 'active') {
      throw new PodError(400, 'Only active pods can start a next outcome')
    }

    assertUniquePodName(data.name, pods)
    assertMembersAvailableInActivePods(pods, source.memberUids, source.id)

    const pod = buildPodRecord({
      name: data.name,
      description: data.description ?? source.description,
      focusKeys: data.focusKeys ?? source.focusKeys,
      memberUids: source.memberUids,
      createdBy: data.createdBy,
      sourcePodId: source.id
    }, pods)

    await savePod(storage, pod)

    const timestamp = nowIso()
    source.status = 'archived'
    source.archivedAt = timestamp
    source.archivedBy = data.createdBy
    source.updatedBy = data.createdBy
    source.updatedAt = timestamp
    source.version = (source.version || 1) + 1
    await savePod(storage, source)

    return { pod, source }
  })
}

module.exports = {
  PODS_DIR,
  listPods,
  getPod,
  createPod,
  addMembers,
  archivePod,
  nextOutcome,
  updatePod,
  setPodProgress
}
