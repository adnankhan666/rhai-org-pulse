/**
 * Pods platform extension server entry.
 *
 * Mounted by core's platform loader at /api/modules/team-tracker.
 */

const registerPodRoutes = require('./routes')

module.exports = function registerPodsExtension(router, context) {
  registerPodRoutes(router, context)
}
