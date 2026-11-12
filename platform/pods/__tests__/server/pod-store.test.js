import { describe, it, expect } from 'vitest'
import {
  listPods,
  getPod,
  createPod,
  addMembers,
  archivePod,
  nextOutcome,
  setPodProgress
} from '../../server/pod-store.js'

function createFakeStorage() {
  const files = new Map()
  return {
    files,
    async readFromStorage(key) {
      return files.has(key) ? structuredClone(files.get(key)) : null
    },
    async writeToStorage(key, value) {
      files.set(key, structuredClone(value))
    },
    async listStorageFiles(dir) {
      const prefix = dir + '/'
      return [...files.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => key.slice(prefix.length))
    }
  }
}

function basePod(overrides = {}) {
  return {
    name: 'Orbit Pod',
    description: '',
    focusKeys: ['PurpleSTRAT-1234'],
    memberUids: ['a', 'b', 'c'],
    createdBy: 'owner@example.com',
    ...overrides
  }
}

describe('pod store', () => {
  it('creates and lists a pod', async () => {
    const storage = createFakeStorage()
    const pod = await createPod(storage, basePod())

    expect(pod.id).toMatch(/^pod_/)
    expect(pod.status).toBe('active')
    expect(pod.version).toBe(1)
    expect(pod.memberUids).toEqual(['a', 'b', 'c'])
    expect(pod.focusKeys).toEqual(['PurpleSTRAT-1234'])

    const pods = await listPods(storage)
    expect(pods).toHaveLength(1)
    expect(await getPod(storage, pod.id)).toMatchObject({ name: 'Orbit Pod' })
  })

  it('rejects duplicate names, including archived pods', async () => {
    const storage = createFakeStorage()
    const pod = await createPod(storage, basePod())
    await archivePod(storage, pod.id, 'owner@example.com')

    await expect(createPod(storage, basePod())).rejects.toMatchObject({ status: 409 })
  })

  it('adds members only and increments the version', async () => {
    const storage = createFakeStorage()
    const pod = await createPod(storage, basePod())

    const updated = await addMembers(storage, pod.id, ['d'], 'editor@example.com')
    expect(updated.memberUids).toEqual(['a', 'b', 'c', 'd'])
    expect(updated.version).toBe(2)
    expect(updated.updatedBy).toBe('editor@example.com')

    await expect(addMembers(storage, pod.id, ['a'], 'editor@example.com')).rejects.toMatchObject({ status: 400 })
  })

  it('archives instead of deleting', async () => {
    const storage = createFakeStorage()
    const pod = await createPod(storage, basePod())

    const archived = await archivePod(storage, pod.id, 'owner@example.com')
    expect(archived.status).toBe('archived')
    expect(archived.archivedBy).toBe('owner@example.com')
    expect(archived.archivedAt).toBeTruthy()

    expect(await getPod(storage, pod.id)).toMatchObject({ status: 'archived' })
    expect(await listPods(storage)).toHaveLength(1)
  })

  it('rejects adding members to an archived pod', async () => {
    const storage = createFakeStorage()
    const pod = await createPod(storage, basePod())
    await archivePod(storage, pod.id, 'owner@example.com')

    await expect(addMembers(storage, pod.id, ['d'], 'owner@example.com')).rejects.toMatchObject({ status: 400 })
  })

  it('rejects a member already in another active pod on create', async () => {
    const storage = createFakeStorage()
    await createPod(storage, basePod())

    await expect(createPod(storage, basePod({
      name: 'Another Pod',
      memberUids: ['d', 'e', 'a']
    }))).rejects.toMatchObject({ status: 409 })
  })

  it('rejects adding a member already in another active pod', async () => {
    const storage = createFakeStorage()
    const first = await createPod(storage, basePod())
    await createPod(storage, basePod({
      name: 'Another Pod',
      memberUids: ['d', 'e', 'f']
    }))

    await expect(addMembers(storage, first.id, ['d'], 'owner@example.com')).rejects.toMatchObject({ status: 409 })
  })

  it('moves members to a new pod atomically for the next outcome', async () => {
    const storage = createFakeStorage()
    const source = await createPod(storage, basePod())

    const result = await nextOutcome(storage, source.id, {
      name: 'Next Pod',
      createdBy: 'owner@example.com'
    })

    expect(result.pod.name).toBe('Next Pod')
    expect(result.pod.memberUids).toEqual(['a', 'b', 'c'])
    expect(result.source.status).toBe('archived')
    expect(result.pod.status).toBe('active')
  })

  it('updates progress on an active pod and increments version', async () => {
    const storage = createFakeStorage()
    const pod = await createPod(storage, basePod())

    const updated = await setPodProgress(storage, pod.id, 65, 'owner@example.com')

    expect(updated.progressPct).toBe(65)
    expect(updated.version).toBe(pod.version + 1)

    const fetched = await getPod(storage, pod.id)
    expect(fetched.progressPct).toBe(65)
  })

  it('clamps and rounds progress values', async () => {
    const storage = createFakeStorage()
    const pod = await createPod(storage, basePod())

    expect((await setPodProgress(storage, pod.id, 150.4, 'owner@example.com')).progressPct).toBe(100)
    expect((await setPodProgress(storage, pod.id, -3, 'owner@example.com')).progressPct).toBe(0)
  })

  it('rejects progress updates on archived pods', async () => {
    const storage = createFakeStorage()
    const pod = await createPod(storage, basePod())
    await archivePod(storage, pod.id, 'owner@example.com')

    await expect(setPodProgress(storage, pod.id, 50, 'owner@example.com')).rejects.toMatchObject({ status: 400 })
  })
})
