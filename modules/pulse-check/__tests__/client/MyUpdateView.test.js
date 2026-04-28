import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MyUpdateView from '../../client/views/MyUpdateView.vue'

vi.mock('@shared/client/services/api', () => ({
  apiRequest: vi.fn().mockImplementation((url) => {
    if (url.includes('/periods/current')) {
      return Promise.resolve({ periodStart: '2026-04-20', periodEnd: '2026-04-26' })
    }
    if (url.includes('/my-update/')) {
      return Promise.resolve({
        uid: 'bsmith',
        personName: 'Bob Smith',
        periodStart: '2026-04-20',
        periodEnd: '2026-04-26',
        status: 'draft',
        autoMetrics: {
          jira: { resolvedCount: 3, storyPoints: 8, inProgressCount: 2, topIssues: [] },
          github: { contributions: 15 },
          gitlab: null
        },
        highlights: [],
        blockers: [],
        plans: [],
        sentiment: null,
        tags: [],
        notes: ''
      })
    }
    return Promise.resolve({})
  })
}))

describe('MyUpdateView', () => {
  it('renders the page title', async () => {
    const wrapper = mount(MyUpdateView, {
      global: { stubs: { SentimentBadge: true, BlockerCard: true } }
    })
    expect(wrapper.text()).toContain('My Weekly Update')
  })
})
