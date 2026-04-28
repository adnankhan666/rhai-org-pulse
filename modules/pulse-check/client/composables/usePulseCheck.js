import { ref } from 'vue'
import { apiRequest } from '@shared/client/services/api'

var MODULE_API = '/modules/pulse-check'

export function usePulseCheck() {
  var currentPeriod = ref(null)
  var myUpdate = ref(null)
  var loading = ref(false)
  var saving = ref(false)
  var error = ref(null)

  async function loadCurrentPeriod() {
    try {
      currentPeriod.value = await apiRequest(MODULE_API + '/periods/current')
    } catch (err) {
      error.value = err.message
    }
  }

  async function loadMyUpdate(periodEnd) {
    loading.value = true
    error.value = null
    try {
      myUpdate.value = await apiRequest(MODULE_API + '/my-update/' + periodEnd)
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function saveMyUpdate(periodEnd, data) {
    saving.value = true
    error.value = null
    try {
      myUpdate.value = await apiRequest(MODULE_API + '/my-update/' + periodEnd, {
        method: 'PUT',
        body: data
      })
      return true
    } catch (err) {
      error.value = err.message
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    currentPeriod,
    myUpdate,
    loading,
    saving,
    error,
    loadCurrentPeriod,
    loadMyUpdate,
    saveMyUpdate
  }
}

export function useTeamAggregation() {
  var aggregation = ref(null)
  var loading = ref(false)
  var error = ref(null)

  async function loadAggregation(periodEnd, axis, value) {
    loading.value = true
    error.value = null
    try {
      aggregation.value = await apiRequest(
        MODULE_API + '/aggregate/' + periodEnd + '?axis=' + encodeURIComponent(axis) + '&value=' + encodeURIComponent(value)
      )
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  return { aggregation, loading, error, loadAggregation }
}
