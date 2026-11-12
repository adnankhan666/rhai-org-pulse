import { describe, it, expect } from 'vitest'
import { nextRunAfter, runIfDue, getScheduleInfo, SCHEDULE_HOUR_UTC } from '../../server/pod-360-schedule.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    async readFromStorage(key) { return data[key] || null },
    async writeToStorage(key, value) { data[key] = value }
  }
}

describe('weekly pod 360 schedule', () => {
  it('targets Thursday 09:00 UTC', () => {
    expect(SCHEDULE_HOUR_UTC).toBe(9)

    // Wednesday 12 Nov 2026 10:00 UTC -> next Thursday 09:00
    const next = nextRunAfter(new Date('2026-11-11T10:00:00Z'))
    expect(next.toISOString()).toBe('2026-11-12T09:00:00.000Z')
    expect(next.getUTCDay()).toBe(4)
  })

  it('rolls a full week when this Thursday has passed', () => {
    const next = nextRunAfter(new Date('2026-11-12T09:30:00Z'))
    expect(next.toISOString()).toBe('2026-11-19T09:00:00.000Z')
  })

  it('does not fire on a cold start', async () => {
    const storage = memoryStorage()
    let calls = 0
    const result = await runIfDue({
      storage,
      now: new Date('2026-11-12T07:30:00Z'),
      generateForPod: async () => { calls += 1; return 1 }
    })
    expect(result == null).toBe(true)
    expect(calls).toBe(0)
  })

  it('runs once its slot has passed, then waits a week', async () => {
    const storage = memoryStorage({ 'team-data/pods/360-schedule.json': { lastRunAt: '2026-11-05T09:00:00.000Z' } })
    let calls = 0
    const generateForPod = async () => { calls += 1; return 2 }

    const first = await runIfDue({ storage, now: new Date('2026-11-12T09:05:00Z'), generateForPod })
    expect(first.reports).toBe(2)
    expect(calls).toBe(1)

    const second = await runIfDue({ storage, now: new Date('2026-11-12T09:10:00Z'), generateForPod })
    expect(second == null).toBe(true)
    expect(calls).toBe(1)

    const nextWeek = await runIfDue({ storage, now: new Date('2026-11-19T09:01:00Z'), generateForPod })
    expect(nextWeek.reports).toBe(2)
    expect(calls).toBe(2)
  })

  it('describes the schedule and the next run', async () => {
    const storage = memoryStorage()
    const info = await getScheduleInfo(storage, new Date('2026-11-11T10:00:00Z'))
    expect(info).toMatchObject({
      cadence: 'weekly',
      day: 'Thursday',
      timeUtc: '09:00',
      label: 'Weekly on Thursday, 09:00 UTC',
      lastRunAt: null,
      nextRunAt: '2026-11-12T09:00:00.000Z'
    })
  })
})
