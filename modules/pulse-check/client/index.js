import { defineAsyncComponent } from 'vue'

export const routes = {
  'my-update': defineAsyncComponent(() => import('./views/MyUpdateView.vue')),
  'team-dashboard': defineAsyncComponent(() => import('./views/TeamDashboardView.vue')),
  'reports': defineAsyncComponent(() => import('./views/ReportsDashboardView.vue')),
  'initiatives': defineAsyncComponent(() => import('./views/InitiativeBoardView.vue')),
  'heatmap': defineAsyncComponent(() => import('./views/OrgHeatmapView.vue')),
  'history': defineAsyncComponent(() => import('./views/HistoryView.vue')),
}
