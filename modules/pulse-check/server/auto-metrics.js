/**
 * Auto-enrichment: pull Jira/GitHub/GitLab metrics from team-tracker caches
 * for a given person and period window.
 */

function getAutoMetrics(storage, registryPerson, periodStart, periodEnd) {
  var result = { jira: null, github: null, gitlab: null }

  // Jira: read from people/{sanitized_name}.json, filter by resolutionDate
  var jiraName = registryPerson.name
  if (jiraName) {
    var sanitized = jiraName.toLowerCase().replace(/[^a-z0-9]/g, '_')
    var personData = storage.readFromStorage('people/' + sanitized + '.json')
    if (personData && personData.resolved) {
      var resolved = (personData.resolved.issues || []).filter(function(issue) {
        if (!issue.resolutionDate) return false
        var rd = issue.resolutionDate.slice(0, 10)
        return rd >= periodStart && rd <= periodEnd
      })
      var points = resolved.reduce(function(sum, i) { return sum + (i.storyPoints || 0) }, 0)
      result.jira = {
        resolvedCount: resolved.length,
        storyPoints: points,
        inProgressCount: personData.inProgress ? personData.inProgress.count : 0,
        topIssues: resolved.slice(0, 5).map(function(i) {
          return { key: i.key, summary: i.summary, storyPoints: i.storyPoints }
        })
      }
    }
  }

  // GitHub: read from github-contributions.json
  var ghUsername = registryPerson.github && registryPerson.github.username
  if (ghUsername) {
    var ghData = storage.readFromStorage('github-contributions.json')
    if (ghData && ghData.users && ghData.users[ghUsername]) {
      result.github = {
        contributions: ghData.users[ghUsername].totalContributions || 0
      }
    }
  }

  // GitLab: read from gitlab-contributions.json
  var glUsername = registryPerson.gitlab && registryPerson.gitlab.username
  if (glUsername) {
    var glData = storage.readFromStorage('gitlab-contributions.json')
    if (glData && glData.users && glData.users[glUsername]) {
      result.gitlab = {
        contributions: glData.users[glUsername].totalContributions || 0
      }
    }
  }

  return result
}

module.exports = { getAutoMetrics }
