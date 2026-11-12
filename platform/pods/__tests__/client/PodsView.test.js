import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import PodsView from '../../client/views/PodsView.vue'

const mockPods = []
let mockMirrors = {}

// Set to a conflicts array to make POST /pods fail with a 409 conflict response
let mockPodConflict = null

const mockPeople = [
  {
    uid: 'jdoe',
    name: 'Jane Doe',
    email: 'jdoe@example.com',
    status: 'active',
    title: 'Staff Engineer',
    orgDisplayName: 'Alice Chen',
    orgType: 'engineering',
    geo: 'NA',
    location: 'Remote',
    teams: ['Team A'],
    github: { username: 'janedoe' },
    gitlab: { username: 'jdoe' },
    _appFields: {
      field_x1y2z3: 'model serving',
      field_d4e5f6: ['ML Models'],
      field_mv0001: ['Python'],
      field_rq0001: 'ML Engineer'
    }
  }
]

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn((url, options = {}) => {
    if (url.includes('/pods/mirrors')) {
      return Promise.resolve({ mirrors: mockMirrors })
    }
    if (url.includes('/pods/permissions/me')) {
      return Promise.resolve({ canCreate: true, isAdmin: true, email: 'test@example.com' })
    }
    if (url.endsWith('/pods') && options.method === 'POST') {
      if (mockPodConflict) {
        const err = new Error('Some people are already in another active pod')
        err.status = 409
        err.data = { error: err.message, details: { conflicts: mockPodConflict } }
        return Promise.reject(err)
      }
      const body = JSON.parse(options.body || '{}')
      return Promise.resolve({
        pod: {
          id: 'pod_test',
          name: body.name,
          status: 'active',
          memberCount: body.memberUids.length,
          members: [],
          createdBy: 'test@example.com'
        }
      })
    }
    if (url.endsWith('/next-outcome') && options.method === 'POST') {
      const id = url.split('/pods/')[1].split('/next-outcome')[0]
      const source = mockPods.find(item => item.id === id)
      const body = JSON.parse(options.body || '{}')
      source.status = 'archived'
      source.archivedAt = '2026-11-05T13:00:00.000Z'
      const next = {
        ...source,
        id: 'pod_next',
        name: body.name,
        status: 'active',
        createdAt: '2026-11-05T13:00:00.000Z',
        archivedAt: null
      }
      mockPods.push(next)
      return Promise.resolve({ pod: next })
    }
    if (url.endsWith('/archive') && options.method === 'POST') {
      const id = url.split('/pods/')[1].split('/archive')[0]
      const pod = mockPods.find(item => item.id === id)
      if (pod) {
        pod.status = 'archived'
        pod.archivedAt = '2026-11-05T13:00:00.000Z'
      }
      return Promise.resolve({ pod })
    }
    if (url.endsWith('/duplicate') && options.method === 'POST') {
      const id = url.split('/pods/')[1].split('/duplicate')[0]
      const source = mockPods.find(item => item.id === id)
      const body = JSON.parse(options.body || '{}')
      const duplicated = {
        ...source,
        id: 'pod_duplicate',
        name: body.name,
        status: 'active',
        createdAt: '2026-11-05T13:00:00.000Z',
        archivedAt: null
      }
      mockPods.push(duplicated)
      return Promise.resolve({ pod: duplicated })
    }
    if (url.includes('/pods')) {
      return Promise.resolve({
        pods: mockPods.map(pod => ({ ...pod, members: [...(pod.members || [])] }))
      })
    }
    if (url.includes('/registry/people')) return Promise.resolve({ people: mockPeople })
    if (url.includes('/registry/stats')) return Promise.resolve({ orgDisplayNames: {} })
    if (url.includes('/sync/status')) return Promise.resolve({})
    return Promise.resolve({})
  })
}))

// Field definitions served to the view; mutate `mockFieldDefs.personFields` per test
const mockFieldDefs = { personFields: [] }

vi.mock('@shared/client/composables/useFieldDefinitions', () => ({
  useFieldDefinitions: () => ({
    definitions: ref(mockFieldDefs),
    fetchDefinitions: vi.fn(() => Promise.resolve())
  })
}))

function createNav(params = {}) {
  return {
    params: ref(params),
    navigateTo: vi.fn(),
    goBack: vi.fn()
  }
}

function mountView(navParams = {}) {
  const nav = createNav(navParams)
  const wrapper = mount(PodsView, {
    global: {
      provide: { moduleNav: nav },
      stubs: {
        MultiSelectDropdown: true,
        ColumnHeaderFilter: true
      }
    }
  })
  return { wrapper, nav }
}

async function openCreateTab(wrapper) {
  const createTab = wrapper.find('button[aria-label="Create Pod"]')
  expect(createTab.exists()).toBe(true)
  await createTab.trigger('click')
  await nextTick()
}

async function mountCreateView(navParams = {}) {
  const { wrapper, nav } = mountView(navParams)
  await flushPromises()
  await openCreateTab(wrapper)
  return { wrapper, nav }
}

describe('PodsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPods.splice(0)
    mockFieldDefs.personFields = []
  })

  it('shows Active and Archived tabs and opens the + create tab', async () => {
    const { wrapper } = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Pods')
    expect(wrapper.text()).toContain('Active')
    expect(wrapper.text()).toContain('Archived')
    expect(wrapper.find('input[type="text"]').exists()).toBe(false)

    await openCreateTab(wrapper)

    expect(wrapper.find('input[type="text"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Create Pod"]').classes()).toContain('bg-primary-600')
  })

  it('switches to the Archived tab', async () => {
    const { wrapper } = mountView()
    await flushPromises()

    const archived = wrapper.findAll('button').find(button => button.text().includes('Archived'))
    expect(archived).toBeTruthy()
    await archived.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('No archived pods')
  })

  it('reads q param from URL on mount', async () => {
    const { wrapper } = await mountCreateView({ q: 'alice' })
    const input = wrapper.find('input[type="text"]')
    expect(input.element.value).toBe('alice')
  })

  it('updates search when q param changes', async () => {
    const { wrapper, nav } = await mountCreateView({})

    nav.params.value = { q: 'bob' }
    await nextTick()
    await nextTick()
    const input = wrapper.find('input[type="text"]')
    expect(input.element.value).toBe('bob')

    nav.params.value = {}
    await nextTick()
    await nextTick()
    expect(input.element.value).toBe('')
  })

  it('searches across all person fields', async () => {
    const { wrapper } = await mountCreateView()

    const input = wrapper.find('input[type="text"]')

    for (const term of [
      'Alice Chen',
      'Staff Engineer',
      'Remote',
      'Team A',
      'janedoe',
      'jdoe',
      'ML Models',
      'Python',
      'model serving',
      'ML Engineer'
    ]) {
      await input.setValue(term)
      await nextTick()
      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    }

    await input.setValue('not-a-real-person')
    await nextTick()
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
  })

  it('clears the search from the clear button', async () => {
    const { wrapper } = await mountCreateView()

    const input = wrapper.find('input[type="text"]')
    await input.setValue('janedoe')
    await nextTick()
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)

    const clear = wrapper.find('button[aria-label="Clear search"]')
    expect(clear.exists()).toBe(true)
    await clear.trigger('click')
    await nextTick()

    expect(input.element.value).toBe('')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
  })

  it('builds a pod preview from selected people', async () => {
    const { wrapper } = await mountCreateView()

    expect(wrapper.find('[data-testid="pod-preview"]').exists()).toBe(false)

    const rowCheckbox = wrapper.find('tbody input[type="checkbox"]')
    await rowCheckbox.setValue(true)
    await nextTick()

    const preview = wrapper.find('[data-testid="pod-preview"]')
    expect(preview.exists()).toBe(true)
    expect(preview.find('input[aria-label="Pod name"]').element.value).toBe('NewPodName')
    expect(preview.text()).toContain('Jane Doe')
    expect(preview.text()).toContain('1 selected')

    await wrapper.find('button[aria-label="Clear pod selection"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="pod-preview"]').exists()).toBe(false)
    expect(rowCheckbox.element.checked).toBe(false)
  })

  it('selects all visible rows from the header checkbox', async () => {
    const { wrapper } = await mountCreateView()

    const headerCheckbox = wrapper.find('thead input[type="checkbox"]')
    await headerCheckbox.setValue(true)
    await nextTick()

    expect(wrapper.findAll('tbody input[type="checkbox"]').every(cb => cb.element.checked)).toBe(true)
    expect(wrapper.find('[data-testid="pod-preview"] input[aria-label="Pod name"]').element.value).toBe('NewPodName')
  })

  it('edits the pod name and removes a member bubble', async () => {
    const { wrapper } = await mountCreateView()

    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    await nextTick()

    const nameInput = wrapper.find('[data-testid="pod-preview"] input[aria-label="Pod name"]')
    await nameInput.setValue('Alpha Pod')
    await nextTick()
    expect(nameInput.element.value).toBe('Alpha Pod')

    await wrapper.find('button[aria-label="Remove Jane Doe from pod"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="pod-preview"]').exists()).toBe(false)
    expect(wrapper.find('tbody input[type="checkbox"]').element.checked).toBe(false)
  })

  it('creates a pod with at least three people', async () => {
    mockPeople.push(
      { uid: 'bsmith', name: 'Bob Smith', email: 'bsmith@example.com', status: 'active', title: 'Engineer', teams: ['Team A'] },
      { uid: 'cwilliams', name: 'Carol Williams', email: 'cwilliams@example.com', status: 'active', title: 'Engineer', teams: ['Team A'] }
    )

    try {
      const { wrapper } = await mountCreateView()

      await wrapper.find('thead input[type="checkbox"]').setValue(true)
      await nextTick()
      expect(wrapper.findAll('tbody input[type="checkbox"]')).toHaveLength(3)

      const nameInput = wrapper.find('[data-testid="pod-preview"] input[aria-label="Pod name"]')
      await nameInput.setValue('Alpha Pod')
      await wrapper.find('#pod-focus-keys').setValue('RHAISTRAT-2191')
      await nextTick()

      const createButton = wrapper.find('button[aria-label="Create pod"]')
      expect(createButton.attributes('disabled')).toBeUndefined()
      await createButton.trigger('click')
      await flushPromises()

      const notice = wrapper.find('[data-testid="pod-created-notice"]')
      expect(notice.exists()).toBe(true)
      expect(notice.text()).toContain('Alpha Pod')
      expect(notice.text()).toContain('3 members')
      expect(wrapper.find('[data-testid="pod-preview"]').exists()).toBe(false)
    } finally {
      mockPeople.splice(1)
    }
  })

  it('blocks creation until a Jira feature key is provided', async () => {
    mockPeople.push(
      { uid: 'bsmith', name: 'Bob Smith', email: 'bsmith@example.com', status: 'active', title: 'Engineer', teams: ['Team A'] },
      { uid: 'cwilliams', name: 'Carol Williams', email: 'cwilliams@example.com', status: 'active', title: 'Engineer', teams: ['Team A'] }
    )

    try {
      const { wrapper } = await mountCreateView()

      await wrapper.find('thead input[type="checkbox"]').setValue(true)
      await nextTick()

      await wrapper.find('[data-testid="pod-preview"] input[aria-label="Pod name"]').setValue('Alpha Pod')
      await nextTick()

      const createButton = () => wrapper.find('button[aria-label="Create pod"]')
      expect(createButton().attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('Required')

      await wrapper.find('#pod-focus-keys').setValue('RHAISTRAT-2191')
      await nextTick()

      expect(createButton().attributes('disabled')).toBeUndefined()
    } finally {
      mockPeople.splice(1)
    }
  })

  it('shows a bubble next to people assigned to an active pod', async () => {
    mockPods.push({
      id: 'pod_1',
      name: 'Orbit Pod',
      status: 'active',
      memberCount: 1,
      members: [{ uid: 'jdoe', name: 'Jane Doe' }],
      createdBy: 'owner@example.com',
      createdAt: '2026-11-05T12:00:00.000Z',
      archivedAt: null
    })

    const { wrapper } = await mountCreateView()

    const tooltip = wrapper.find('tbody [data-testid="active-pod-tooltip"]')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.text()).toContain('Jane Doe is in active pod: Orbit Pod')
    // the colored bubble itself still renders its initials
    expect(tooltip.element.parentElement.textContent).toContain('OP')
  })

  it('renders pod initials from camelCase pod names', async () => {
    mockPods.push({
      id: 'pod_1',
      name: 'HelloWorldPod',
      status: 'active',
      memberCount: 1,
      members: [{ uid: 'jdoe', name: 'Jane Doe' }],
      createdBy: 'owner@example.com',
      createdAt: '2026-11-05T12:00:00.000Z',
      archivedAt: null
    })

    const { wrapper } = await mountCreateView()

    const tooltip = wrapper.find('tbody [data-testid="active-pod-tooltip"]')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.text()).toContain('HelloWorldPod')
    expect(tooltip.element.parentElement.textContent).toContain('HWP')
  })

  it('shows colored stakeholder role chips in the table', async () => {
    mockPeople.push({
      uid: 'dcook', name: 'Dana Cook', email: 'dcook@example.com', status: 'active',
      title: 'Senior Product Manager', orgType: 'auxiliary', teams: [],
      _appFields: { field_stake: ['PM'] }
    })
    mockFieldDefs.personFields = [{
      id: 'field_stake', label: 'Stakeholder role', type: 'constrained',
      multiValue: true, visible: true, allowedValues: ['PM', 'UX', 'CCS', 'TPM', 'QE']
    }]

    try {
      const { wrapper } = await mountCreateView()

      const chipTooltip = wrapper.find('tbody [data-testid="role-chip-tooltip"]')
      expect(chipTooltip.exists()).toBe(true)
      expect(chipTooltip.text()).toContain('Stakeholder role: PM')
      // the colored chip itself carries the role palette
      const chip = chipTooltip.element.parentElement.firstElementChild
      expect(chip.textContent).toBe('PM')
      expect(chip.className).toContain('bg-teal-100')

      // engineering people without the role value get no chip
      const otherChips = wrapper.findAll('tbody [data-testid="role-chip-tooltip"]')
      expect(otherChips).toHaveLength(1)
    } finally {
      mockPeople.splice(1)
    }
  })

  it('marks stakeholder member bubbles with a mini badge on pod cards', async () => {    mockPeople.push({
      uid: 'dcook', name: 'Dana Cook', email: 'dcook@example.com', status: 'active',
      title: 'Senior Product Manager', orgType: 'auxiliary', teams: [],
      _appFields: { field_stake: ['UX'] }
    })
    mockFieldDefs.personFields = [{
      id: 'field_stake', label: 'Stakeholder role', type: 'constrained',
      multiValue: true, visible: true, allowedValues: ['PM', 'UX', 'CCS', 'TPM', 'QE']
    }]
    mockPods.push({
      id: 'pod_1',
      name: 'Orbit Pod',
      status: 'active',
      memberCount: 2,
      members: [
        { uid: 'a', name: 'Alice Chen' },
        { uid: 'dcook', name: 'Dana Cook' }
      ],
      createdBy: 'owner@example.com',
      createdAt: '2026-11-05T12:00:00.000Z',
      archivedAt: null
    })

    try {
      const { wrapper } = mountView()
      await flushPromises()

      // exactly one member bubble carries a role badge
      const badges = wrapper.findAll('span[title^="Stakeholder:"]')
      expect(badges).toHaveLength(1)
      expect(badges[0].text()).toBe('UX')
      expect(badges[0].classes()).toContain('bg-rose-100')

      // the member tooltip names the role too (order: bubble, badge, tooltip)
      const aliceBubble = wrapper.find('span[aria-label="Alice Chen"]')
      expect(aliceBubble.exists()).toBe(true)
      expect(aliceBubble.element.parentElement.textContent).not.toContain('\u00b7')
      const danaBubble = wrapper.find('span[aria-label="Dana Cook"]')
      expect(danaBubble.element.parentElement.textContent).toContain('Dana Cook \u00b7 UX')
    } finally {
      mockPeople.splice(1)
    }
  })

  it('shows an explicit state instead of a fake percentage without a mirror', async () => {
    mockPods.push({
      id: 'pod_1',
      name: 'Orbit Pod',
      status: 'active',
      memberCount: 2,
      progressPct: 65,
      members: [
        { uid: 'a', name: 'Alice Chen' },
        { uid: 'b', name: 'Bob Smith' }
      ],
      createdBy: 'owner@example.com',
      createdAt: '2026-11-05T12:00:00.000Z',
      archivedAt: null
    })

    const { wrapper } = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No Jira feature linked')
    expect(wrapper.text()).not.toContain('0% complete')
  })

  it('renders the derived progress bar when a mirror is present', async () => {
    mockMirrors = {
      pod_1: {
        key: 'RHAISTRAT-2191',
        summary: 'Selector parity',
        status: 'In Progress',
        statusCategory: 'In Progress',
        asOf: '2026-11-10T22:40:19.039+0000',
        assignee: 'Andy Stoneberg',
        productManager: 'Jenny Yi',
        labels: [],
        fixVersion: '3.7 EA1 RHOAI RELEASE',
        releaseType: 'GA',
        colorStatus: 'Green',
        milestone: { codeFreezeDate: '2026-12-11' },
        progress: { done: 4, inProgress: 4, todo: 1, other: 0, total: 9, pct: 44 },
        attention: { state: 'on_track', daysToFreeze: 29, elapsedPct: 0, deltaPct: 44 },
        children: []
      }
    }
    mockPods.push({
      id: 'pod_1',
      name: 'Orbit Pod',
      status: 'active',
      memberCount: 3,
      members: [{ uid: 'a', name: 'Alice Chen' }],
      createdBy: 'owner@example.com',
      createdAt: '2026-11-05T12:00:00.000Z',
      archivedAt: null,
      focusKeys: ['RHAISTRAT-2191']
    })

    try {
      const { wrapper } = mountView()
      await flushPromises()

      expect(wrapper.text()).toContain('44% · 4/9')
      expect(wrapper.text()).toContain('On track')
      expect(wrapper.text()).toContain('29d to freeze')
    } finally {
      mockMirrors = {}
    }
  })

  it('shows archived pods at 100% progress', async () => {
    mockPods.push({
      id: 'pod_1',
      name: 'Orbit Pod',
      status: 'archived',
      memberCount: 1,
      members: [{ uid: 'a', name: 'Alice Chen' }],
      createdBy: 'owner@example.com',
      createdAt: '2026-11-05T12:00:00.000Z',
      archivedAt: '2026-11-06T08:00:00.000Z'
    })

    const { wrapper } = mountView()
    await flushPromises()

    const archivedTab = wrapper.findAll('button').find(b => b.text().trim().startsWith('Archived'))
    await archivedTab.trigger('click')
    await flushPromises()

    expect(wrapper.find('span[title="100% complete"]').exists()).toBe(true)
  })

  it('highlights people already in another active pod when creation is rejected', async () => {
    mockPeople.push(
      { uid: 'bsmith', name: 'Bob Smith', email: 'bsmith@example.com', status: 'active', title: 'Engineer', teams: ['Team A'] },
      { uid: 'cwilliams', name: 'Carol Williams', email: 'cwilliams@example.com', status: 'active', title: 'Engineer', teams: ['Team A'] }
    )
    mockPodConflict = [
      { uid: 'jdoe', podId: 'pod_x', podName: 'Orbit Pod' },
      { uid: 'bsmith', podId: 'pod_x', podName: 'Orbit Pod' }
    ]

    try {
      const { wrapper } = await mountCreateView()

      await wrapper.find('thead input[type="checkbox"]').setValue(true)
      await nextTick()

      const nameInput = wrapper.find('[data-testid="pod-preview"] input[aria-label="Pod name"]')
      await nameInput.setValue('Alpha Pod')
      await wrapper.find('#pod-focus-keys').setValue('RHAISTRAT-2191')
      await nextTick()

      await wrapper.find('button[aria-label="Create pod"]').trigger('click')
      await flushPromises()

      // Error alert lists the conflicting people and their active pod
      const alert = wrapper.find('[role="alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('Some people are already in another active pod')
      const conflictList = wrapper.find('[data-testid="pod-conflict-list"]')
      expect(conflictList.exists()).toBe(true)
      expect(conflictList.text()).toContain('Jane Doe')
      expect(conflictList.text()).toContain('Bob Smith')
      expect(conflictList.text()).toContain('Orbit Pod')
      expect(conflictList.text()).not.toContain('Carol Williams')

      // Conflicting rows are highlighted with an "In <pod>" badge
      const rows = wrapper.findAll('tbody tr')
      const janeRow = rows.find(row => row.text().includes('Jane Doe'))
      const bobRow = rows.find(row => row.text().includes('Bob Smith'))
      const carolRow = rows.find(row => row.text().includes('Carol Williams'))
      expect(janeRow.classes()).toContain('bg-red-50')
      expect(janeRow.text()).toContain('In Orbit Pod')
      expect(bobRow.classes()).toContain('bg-red-50')
      expect(bobRow.text()).toContain('In Orbit Pod')
      expect(carolRow.classes()).not.toContain('bg-red-50')
      expect(carolRow.text()).not.toContain('In Orbit Pod')

      // The preview chip for a conflicting member gets a red ring
      const preview = wrapper.find('[data-testid="pod-preview"]')
      const janeChip = preview.findAll('span').find(span => span.text() === 'Jane Doe')
      expect(janeChip).toBeTruthy()
      expect(janeChip.classes()).toContain('ring-2')
      expect(janeChip.classes()).toContain('ring-red-400')

      // Changing the selection clears the conflict highlights
      const firstCheckbox = wrapper.find('tbody input[type="checkbox"]')
      await firstCheckbox.setValue(false)
      await nextTick()

      expect(wrapper.find('[data-testid="pod-conflict-list"]').exists()).toBe(false)
      expect(janeRow.classes()).not.toContain('bg-red-50')
    } finally {
      mockPeople.splice(1)
      mockPodConflict = null
    }
  })

  it('keeps the create button disabled with fewer than three people', async () => {
    const { wrapper } = await mountCreateView()

    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    await nextTick()

    const nameInput = wrapper.find('[data-testid="pod-preview"] input[aria-label="Pod name"]')
    await nameInput.setValue('Alpha Pod')
    await nextTick()

    expect(wrapper.find('button[aria-label="Create pod"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('select 2 more')
  })

  it('renders a pod with initials and an info tooltip', async () => {
    mockPods.push({
      id: 'pod_1',
      name: 'Orbit Pod',
      status: 'active',
      memberCount: 3,
      members: [
        { uid: 'a', name: 'Alice Chen' },
        { uid: 'b', name: 'Bob Smith' },
        { uid: 'c', name: 'Carol Williams' }
      ],
      createdBy: 'owner@example.com',
      createdAt: '2026-11-05T12:00:00.000Z',
      archivedAt: null,
      focusKeys: ['PurpleSTRAT-1234', 'PurpleSTRAT-1122']
    })

    const { wrapper } = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Orbit Pod')
    expect(wrapper.text()).toContain('AC')
    expect(wrapper.text()).toContain('BS')
    expect(wrapper.text()).toContain('CW')
    expect(wrapper.text()).toContain('PurpleSTRAT-1234')
    expect(wrapper.text()).toContain('PurpleSTRAT-1122')
    expect(wrapper.text()).toContain('In progress')
    const infoButton = wrapper.find('button[aria-label="Show 360 report"]')
    expect(infoButton.exists()).toBe(true)
    expect(infoButton.attributes('aria-expanded')).toBe('false')
    expect(wrapper.text()).toContain('Completed')
    expect(wrapper.text()).toContain('Next outcome')
  })

  it('opens pod details on click and closes them again', async () => {
    mockPods.push({
      id: 'pod_1',
      name: 'Orbit Pod',
      status: 'active',
      memberCount: 3,
      members: [{ uid: 'a', name: 'Alice Chen' }],
      createdBy: 'owner@example.com',
      createdAt: '2026-11-05T12:00:00.000Z',
      archivedAt: null,
      focusKeys: ['RHAISTRAT-2191'],
      progressPct: 0
    })
    const { wrapper } = mountView()
    await flushPromises()

    const panelCopy = 'Progress and health are unknown for this pod.'
    expect(wrapper.text()).not.toContain(panelCopy)
    await wrapper.find('button[aria-label="Show 360 report"]').trigger('click')
    expect(wrapper.find('button[aria-label="Hide 360 report"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain(panelCopy)

    await wrapper.find('button[aria-label="Hide 360 report"]').trigger('click')
    expect(wrapper.text()).not.toContain(panelCopy)
  })

  it('filters pods by focus key', async () => {
    mockPods.push(
      {
        id: 'pod_1',
        name: 'Orbit Pod',
        status: 'active',
        memberCount: 3,
        members: [{ uid: 'a', name: 'Alice Chen' }],
        createdBy: 'owner@example.com',
        createdAt: '2026-11-05T12:00:00.000Z',
        archivedAt: null,
        focusKeys: ['PurpleSTRAT-1234']
      },
      {
        id: 'pod_2',
        name: 'Nebula Pod',
        status: 'active',
        memberCount: 3,
        members: [{ uid: 'b', name: 'Bob Smith' }],
        createdBy: 'owner@example.com',
        createdAt: '2026-11-05T12:01:00.000Z',
        archivedAt: null,
        focusKeys: ['PurpleSTRAT-9999']
      }
    )

    const { wrapper } = mountView()
    await flushPromises()

    await wrapper.find('input[aria-label="Filter pods"]').setValue('PurpleSTRAT-1234')
    await nextTick()

    expect(wrapper.text()).toContain('Orbit Pod')
    expect(wrapper.text()).not.toContain('Nebula Pod')
  })

  it('moves a pod to Archived when completed', async () => {
    mockPods.push({
      id: 'pod_1',
      name: 'Orbit Pod',
      status: 'active',
      memberCount: 3,
      members: [{ uid: 'a', name: 'Alice Chen' }],
      createdBy: 'owner@example.com',
      createdAt: '2026-11-05T12:00:00.000Z',
      archivedAt: null
    })

    const { wrapper } = mountView()
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text() === 'Completed').trigger('click')
    await nextTick()

    const dialog = wrapper.find('[data-testid="pod-action-dialog"]')
    expect(dialog.exists()).toBe(true)
    await dialog.findAll('button').find(button => button.text() === 'Complete').trigger('click')
    await flushPromises()

    expect(mockPods[0].status).toBe('archived')
    expect(wrapper.text()).toContain('Orbit Pod')
    expect(wrapper.text()).toContain('Archived')
  })

  it('duplicates and archives the current pod for the next outcome', async () => {
    mockPods.push({
      id: 'pod_1',
      name: 'Orbit Pod',
      status: 'active',
      memberCount: 3,
      members: [{ uid: 'a', name: 'Alice Chen' }],
      createdBy: 'owner@example.com',
      createdAt: '2026-11-05T12:00:00.000Z',
      archivedAt: null,
      focusKeys: ['RHAISTRAT-2191']
    })

    const { wrapper } = mountView()
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text() === 'Next outcome').trigger('click')
    await nextTick()

    const input = wrapper.find('#next-outcome-name')
    await input.setValue('Orbit Pod 2')

    // A next outcome needs a different feature, so nothing is prefilled.
    expect(wrapper.find('#next-outcome-focus').element.value).toBe('')
    await wrapper.find('#next-outcome-focus').setValue('RHAISTRAT-2551')

    const dialog = wrapper.find('[data-testid="pod-action-dialog"]')
    await dialog.findAll('button').find(button => button.text() === 'Create next pod').trigger('click')
    await flushPromises()

    expect(mockPods).toHaveLength(2)
    expect(mockPods.find(pod => pod.name === 'Orbit Pod').status).toBe('archived')
    expect(mockPods.find(pod => pod.name === 'Orbit Pod 2').status).toBe('active')
    expect(wrapper.text()).toContain('Created Orbit Pod 2')
  })
})
