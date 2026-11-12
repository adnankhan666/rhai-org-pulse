/**
 * Weekly pod 360 schedule.
 *
 * Thursday 09:00 UTC. The tick is deliberately short (every minute) and the
 * decision is "is it due?", so a restarted server catches up instead of
 * missing the window. State lives in storage, not memory.
 */

const SCHEDULE_DAY = 4 // Thursday (0 = Sunday)
const SCHEDULE_HOUR_UTC = 9
const SCHEDULE_KEY = 'team-data/pods/360-schedule.json'

/** Next Thursday 09:00 UTC strictly after `from`. */
function nextRunAfter(from) {
  const date = new Date(from)
  const candidate = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    SCHEDULE_HOUR_UTC,
    0,
    0,
    0
  ))

  const deltaDays = (SCHEDULE_DAY - candidate.getUTCDay() + 7) % 7
  candidate.setUTCDate(candidate.getUTCDate() + deltaDays)
  if (candidate <= date) candidate.setUTCDate(candidate.getUTCDate() + 7)

  return candidate
}

function describeSchedule() {
  return {
    cadence: 'weekly',
    day: 'Thursday',
    timeUtc: '09:00',
    label: 'Weekly on Thursday, 09:00 UTC'
  }
}

async function readState(storage) {
  try {
    const state = await storage.readFromStorage(SCHEDULE_KEY)
    return state || {}
  } catch {
    return {}
  }
}

async function writeState(storage, state) {
  await storage.writeToStorage(SCHEDULE_KEY, state)
}

/**
 * Run once if the scheduled time has passed since the last run.
 * Returns the reports generated, or null when nothing was due.
 */
async function runIfDue({ storage, now = new Date(), generateForPod }) {
  const state = await readState(storage)
  const lastRunAt = state.lastRunAt ? new Date(state.lastRunAt) : null
  // Without a previous run, wait for the next slot rather than firing on boot.
  const dueAt = lastRunAt ? nextRunAfter(lastRunAt) : nextRunAfter(now)

  if (now < dueAt) {
    return null
  }

  const pods = await generateForPod()
  const nextRunAt = nextRunAfter(now)
  await writeState(storage, {
    lastRunAt: now.toISOString(),
    nextRunAt: nextRunAt.toISOString()
  })

  return { ranAt: now.toISOString(), reports: pods, nextRunAt: nextRunAt.toISOString() }
}

async function getScheduleInfo(storage, now = new Date()) {
  const state = await readState(storage)
  const lastRunAt = state.lastRunAt ? new Date(state.lastRunAt) : null
  const nextRunAt = lastRunAt ? nextRunAfter(lastRunAt) : nextRunAfter(now)
  return {
    ...describeSchedule(),
    lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
    nextRunAt: nextRunAt.toISOString()
  }
}

function startScheduler({ storage, generateForPod, intervalMs = 60000, logger = console }) {
  const tick = async () => {
    try {
      const result = await runIfDue({ storage, generateForPod })
      if (result) {
        logger.log(`[pods] weekly 360 generated for ${result.reports} pod(s)`)
      }
    } catch (err) {
      logger.warn('[pods] weekly 360 run failed:', err.message)
    }
  }

  const timer = setInterval(tick, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
  tick()
  return () => clearInterval(timer)
}

module.exports = {
  SCHEDULE_DAY,
  SCHEDULE_HOUR_UTC,
  nextRunAfter,
  describeSchedule,
  runIfDue,
  getScheduleInfo,
  startScheduler
}
