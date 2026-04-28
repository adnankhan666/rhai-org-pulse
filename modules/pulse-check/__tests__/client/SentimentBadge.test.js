import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SentimentBadge from '../../client/components/SentimentBadge.vue'

describe('SentimentBadge', () => {
  it('renders green sentiment', () => {
    const wrapper = mount(SentimentBadge, { props: { sentiment: 'green' } })
    expect(wrapper.text()).toContain('On Track')
  })

  it('renders yellow sentiment', () => {
    const wrapper = mount(SentimentBadge, { props: { sentiment: 'yellow' } })
    expect(wrapper.text()).toContain('At Risk')
  })

  it('renders red sentiment', () => {
    const wrapper = mount(SentimentBadge, { props: { sentiment: 'red' } })
    expect(wrapper.text()).toContain('Blocked')
  })

  it('renders "Not set" when sentiment is null', () => {
    const wrapper = mount(SentimentBadge, { props: { sentiment: null } })
    expect(wrapper.text()).toContain('Not set')
  })
})
