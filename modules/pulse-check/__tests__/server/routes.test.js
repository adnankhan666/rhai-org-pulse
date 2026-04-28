import { describe, it, expect, beforeEach } from 'vitest'

const registerRoutes = require('../../server/index')

function createMockRouter() {
  const routes = { get: {}, put: {}, post: {} }
  return {
    get(path, ...handlers) { routes.get[path] = handlers[handlers.length - 1] },
    put(path, ...handlers) { routes.put[path] = handlers[handlers.length - 1] },
    post(path, ...handlers) { routes.post[path] = handlers[handlers.length - 1] },
    routes
  }
}

function createMockStorage(files = {}) {
  const store = { ...files }
  return {
    readFromStorage(key) { return store[key] || null },
    writeToStorage(key, data) { store[key] = data },
    _store: store
  }
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { res.statusCode = code; return res },
    json(data) { res.body = data; return res }
  }
  return res
}

describe('pulse-check routes', () => {
  let router, storage

  beforeEach(() => {
    router = createMockRouter()
    storage = createMockStorage({
      'team-data/registry.json': {
        meta: { orgRoots: ['achen'] },
        people: {
          bsmith: { uid: 'bsmith', name: 'Bob Smith', email: 'bsmith@example.com', managerUid: 'achen', status: 'active', _teamGrouping: 'Platform' },
          cwilliams: { uid: 'cwilliams', name: 'Carol Williams', email: 'cwilliams@example.com', managerUid: 'achen', status: 'active', _teamGrouping: 'Platform' },
          achen: { uid: 'achen', name: 'Alice Chen', email: 'achen@example.com', managerUid: 'demovp', status: 'active', _teamGrouping: 'Platform' },
        }
      }
    })

    registerRoutes(router, {
      storage,
      requireAdmin(req, res, next) { next() },
      requireAuth(req, res, next) { next() }
    })
  })

  it('registers period routes', () => {
    expect(router.routes.get['/periods']).toBeDefined()
    expect(router.routes.get['/periods/current']).toBeDefined()
  })

  it('GET /periods returns a list', () => {
    const res = mockRes()
    router.routes.get['/periods']({ query: {} }, res)
    expect(res.body.periods).toBeDefined()
    expect(res.body.periods.length).toBeGreaterThan(0)
  })

  it('GET /my-update rejects invalid periodEnd', () => {
    const res = mockRes()
    router.routes.get['/my-update/:periodEnd'](
      { params: { periodEnd: '2026-04-25' }, userEmail: 'bsmith@example.com' },
      res
    )
    expect(res.statusCode).toBe(400)
  })

  it('GET /my-update returns draft for new update', () => {
    const res = mockRes()
    router.routes.get['/my-update/:periodEnd'](
      { params: { periodEnd: '2026-04-26' }, userEmail: 'bsmith@example.com' },
      res
    )
    expect(res.body.uid).toBe('bsmith')
    expect(res.body.status).toBe('draft')
    expect(res.body.autoMetrics).toBeDefined()
  })

  it('PUT /my-update saves and returns update', () => {
    const res = mockRes()
    router.routes.put['/my-update/:periodEnd'](
      {
        params: { periodEnd: '2026-04-26' },
        userEmail: 'bsmith@example.com',
        body: {
          highlights: [{ text: 'Shipped feature' }],
          blockers: [],
          plans: [{ text: 'Start next sprint' }],
          sentiment: 'green',
          tags: ['auth-migration'],
          notes: ''
        }
      },
      res
    )
    expect(res.body.status).toBe('submitted')
    expect(res.body.uid).toBe('bsmith')
    expect(res.body.highlights).toHaveLength(1)

    // Verify it was stored
    const stored = storage._store['pulse-check/updates/bsmith/2026-04-26.json']
    expect(stored).toBeDefined()
    expect(stored.sentiment).toBe('green')
  })

  it('PUT /my-update rejects invalid sentiment', () => {
    const res = mockRes()
    router.routes.put['/my-update/:periodEnd'](
      {
        params: { periodEnd: '2026-04-26' },
        userEmail: 'bsmith@example.com',
        body: { sentiment: 'purple' }
      },
      res
    )
    expect(res.statusCode).toBe(400)
  })

  it('GET /aggregate returns team data', () => {
    // Pre-populate an update
    storage._store['pulse-check/updates/bsmith/2026-04-26.json'] = {
      uid: 'bsmith',
      personName: 'Bob Smith',
      sentiment: 'green',
      highlights: [{ text: 'Done' }],
      blockers: [{ text: 'Stuck', severity: 'high', resolved: false }],
      plans: [],
      tags: []
    }

    const res = mockRes()
    router.routes.get['/aggregate/:periodEnd'](
      { params: { periodEnd: '2026-04-26' }, query: { axis: 'team', value: 'Platform' } },
      res
    )
    expect(res.body.total).toBe(3)
    expect(res.body.submitted).toBe(1)
    expect(res.body.missing).toHaveLength(2)
    expect(res.body.sentiment.green).toBe(1)
    expect(res.body.unresolvedBlockers).toHaveLength(1)
  })

  it('GET /aggregate supports management axis', () => {
    const res = mockRes()
    router.routes.get['/aggregate/:periodEnd'](
      { params: { periodEnd: '2026-04-26' }, query: { axis: 'management', value: 'achen' } },
      res
    )
    // achen has 2 direct reports: bsmith and cwilliams
    expect(res.body.total).toBe(2)
  })
})
