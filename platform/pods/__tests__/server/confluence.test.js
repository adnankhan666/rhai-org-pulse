import { describe, it, expect, vi } from 'vitest'
import { buildStorage, confluenceStatus, publishPage } from '../../server/confluence.js'

const fullConfig = {
  CONFLUENCE_BASE_URL: 'https://redhat.atlassian.net',
  CONFLUENCE_EMAIL: 'someone@redhat.com',
  CONFLUENCE_API_TOKEN: 'token',
  CONFLUENCE_SPACE_KEY: 'RHOAI',
  CONFLUENCE_PARENT_ID: '1234'
}

describe('confluence publishing', () => {
  describe('confluenceStatus', () => {
    it('reports configured when every setting is present', () => {
      expect(confluenceStatus(fullConfig, {})).toMatchObject({
        configured: true,
        missing: [],
        spaceKey: 'RHOAI',
        parentId: '1234'
      })
    })

    it('lists exactly what is missing', () => {
      const status = confluenceStatus({ CONFLUENCE_BASE_URL: 'https://x' }, {})
      expect(status.configured).toBe(false)
      expect(status.missing).toEqual([
        'CONFLUENCE_EMAIL',
        'CONFLUENCE_API_TOKEN',
        'CONFLUENCE_SPACE_KEY'
      ])
    })
  })

  describe('buildStorage', () => {
    it('converts headings, tables, lists and inline emphasis', () => {
      const markdown = [
        '# Pod — 360 — 2026-11-12',
        '',
        '**Feature:** RHAISTRAT-2191',
        '',
        '## Snapshot',
        '',
        '| Metric | Value |',
        '|---|---|',
        '| Child items | 9 |',
        '',
        '- Stale items: A-1',
        '- Unassigned: A-2'
      ].join('\n')

      const html = buildStorage(markdown)

      expect(html).toContain('<h1>Pod — 360 — 2026-11-12</h1>')
      expect(html).toContain('<p><strong>Feature:</strong> RHAISTRAT-2191</p>')
      expect(html).toContain('<h2>Snapshot</h2>')
      expect(html).toContain('<table><tbody><tr><th>Metric</th><th>Value</th></tr><tr><td>Child items</td><td>9</td></tr></tbody></table>')
      expect(html).toContain('<ul><li>Stale items: A-1</li><li>Unassigned: A-2</li></ul>')
    })

    it('escapes html so report text cannot inject markup', () => {
      expect(buildStorage('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    })
  })

  describe('publishPage', () => {
    it('posts a page under the configured parent and returns its url', async () => {
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: '999',
          _links: { base: 'https://redhat.atlassian.net/wiki', webui: '/spaces/RHOAI/pages/999' }
        })
      }))

      const page = await publishPage({
        settings: fullConfig,
        title: 'Orbit Pod — 360 — 2026-11-12',
        markdown: '# Title\n\nbody',
        fetchImpl
      })

      expect(page).toEqual({
        pageId: '999',
        url: 'https://redhat.atlassian.net/wiki/spaces/RHOAI/pages/999',
        title: 'Orbit Pod — 360 — 2026-11-12'
      })

      const [url, options] = fetchImpl.mock.calls[0]
      expect(url).toBe('https://redhat.atlassian.net/wiki/rest/api/content')
      const sent = JSON.parse(options.body)
      expect(sent.space.key).toBe('RHOAI')
      expect(sent.ancestors).toEqual([{ id: '1234' }])
      expect(sent.body.storage.representation).toBe('storage')
      expect(options.headers.Authorization).toBe(
        'Basic ' + Buffer.from('someone@redhat.com:token').toString('base64')
      )
    })

    it('surfaces the Confluence error message', async () => {
      const fetchImpl = vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ message: 'A page with this title already exists' })
      }))

      await expect(publishPage({
        settings: fullConfig,
        title: 'dup',
        markdown: 'x',
        fetchImpl
      })).rejects.toThrow(/already exists/)
    })

    it('creates at the space root when no parent is configured', async () => {
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: '1', _links: {} })
      }))
      const withoutParent = { ...fullConfig, CONFLUENCE_PARENT_ID: '' }

      await publishPage({ settings: withoutParent, title: 't', markdown: 'x', fetchImpl })

      const sent = JSON.parse(fetchImpl.mock.calls[0][1].body)
      expect(sent.ancestors).toBeUndefined()
      expect(sent.space.key).toBe('RHOAI')
    })
  })
})
