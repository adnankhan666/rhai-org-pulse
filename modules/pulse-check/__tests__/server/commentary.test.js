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
  const res = { statusCode: 200, body: null, status(code) { res.statusCode = code; return res }, json(data) { res.body = data; return res } }
  return res
}

describe('commentary routes', () => {
  let router, storage

  beforeEach(() => {
    router = createMockRouter()
    storage = createMockStorage({
      'team-data/registry.json': {
        meta: { orgRoots: ['achen'] },
        people: {
          achen: { uid: 'achen', name: 'Alice Chen', email: 'achen@example.com', managerUid: 'demovp', status: 'active', orgRoot: 'achen', _teamGrouping: 'Platform' },
        }
      }
    })
    registerRoutes(router, {
      storage,
      requireAdmin(req, res, next) { next() },
      requireAuth(req, res, next) { next() }
    })
  })

  it('PUT /commentary saves and GET returns it', () => {
    const putRes = mockRes()
    router.routes.put['/commentary/:periodEnd'](
      {
        params: { periodEnd: '2026-04-26' },
        userEmail: 'achen@example.com',
        body: {
          axis: 'management',
          value: 'achen',
          summary: 'Auth migration on track. Staging blocker escalated.',
          highlights: ['Auth shipped'],
          risks: ['Staging dependency']
        }
      },
      putRes
    )
    expect(putRes.body.authorUid).toBe('achen')
    expect(putRes.body.summary).toContain('Auth migration')

    const getRes = mockRes()
    router.routes.get['/commentary/:periodEnd'](
      { params: { periodEnd: '2026-04-26' }, query: { axis: 'management', value: 'achen' } },
      getRes
    )
    expect(getRes.body.summary).toContain('Auth migration')
  })

  it('GET /commentary returns null when none exists', () => {
    const res = mockRes()
    router.routes.get['/commentary/:periodEnd'](
      { params: { periodEnd: '2026-04-26' }, query: { axis: 'management', value: 'nobody' } },
      res
    )
    expect(res.body).toBeNull()
  })
})
