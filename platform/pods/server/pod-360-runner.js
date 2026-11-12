/**
 * Shared pod 360 generation, used by the API route and the weekly scheduler.
 */

const { buildMirror } = require('./pod-mirror')
const { buildPod360 } = require('./pod-360')

async function generatePod360ForPod({ storage, jira, pod, peopleMap, releases, today }) {
  const { primaryFocusKey } = require('./pod-mirror')
  const issueKey = primaryFocusKey(pod)
  if (!issueKey) {
    throw new Error('Pod has no Jira feature key')
  }

  const members = (pod.memberUids || [])
    .map(uid => peopleMap[uid])
    .filter(Boolean)
    .map(person => ({ name: person.name }))

  const mirror = await buildMirror({
    jira,
    issueKey,
    releases: releases || [],
    startDate: pod.createdAt,
    today
  })

  const { markdown, data } = buildPod360({ pod, mirror, members, today })
  const day = today || new Date().toISOString().slice(0, 10)

  const report = {
    podId: pod.id,
    issueKey,
    generatedAt: data.generatedAt,
    markdown,
    data,
    confluence: null
  }

  await storage.writeToStorage(`team-data/pods/${pod.id}/360/${day}.json`, report)
  return report
}

module.exports = { generatePod360ForPod }
