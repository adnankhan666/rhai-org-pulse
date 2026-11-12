# Platform Extensions

The `platform/` directory holds deployment-specific customizations to core UI.
This is separate from `modules/` (which are for feature domains). Platform
extensions customize core chrome — tabs, panels, branding — without forking
core files.

## How it works

Core discovers platform extensions via Vite's `import.meta.glob`. When
`platform/` is absent (core-only deployments), the globs return empty objects
and no platform extensions are loaded. No conditional logic is needed.

## About Page Tabs (`platform/about-tabs/`)

The About page supports extensible tabs via `platform/about-tabs/manifest.json`.

### Manifest format

```json
{
  "tabs": [
    {
      "id": "docs",
      "label": "Docs",
      "icon": "BookOpen",
      "component": "./DocsTab.vue",
      "order": 15
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique tab identifier |
| `label` | string | yes | Display text on the tab button |
| `icon` | string | yes | Lucide icon name (resolved via shared ICON_MAP) |
| `component` | string | yes | Path to Vue component relative to `platform/about-tabs/` |
| `order` | number | no | Sort position (default: 100) |
| `requireRole` | string | no | Role required to see this tab |

### Core tab ordering

| Order | Tab |
|-------|-----|
| 10 | About |
| 30 | Site Usage |
| 40 | Backups |
| 50 | Help & Debug |

Platform tabs default to `order: 100` (after all core tabs). Set a lower value
to insert between core tabs — e.g., `15` places a tab between About and Site
Usage.

### Adding a new tab

1. Create a Vue component in `platform/about-tabs/` (e.g., `MyTab.vue`)
2. Add an entry to `platform/about-tabs/manifest.json`
3. Run `npm run validate:platform` to verify the manifest
4. The tab appears automatically on the About page

### Component contract

Platform tab components receive no props and emit no events. They are
standalone sections that render their own content.

## Allocation (`platform/allocation/`)

Allocation was removed from `@org-pulse/core` in v2.0.61 and now lives entirely
in this consumer repo as a self-contained `module-views` platform extension at
`platform/allocation/`. It registers into team-tracker's contribution slots via
the discovery seam (a per-team **Allocation** tab, the **Work Allocation**
report, and an **Allocation** settings tab) and ships its own classification
strategy, server engine, and Jira transport.

### Structure

```
platform/allocation/
  manifest.json                 # type module-views, targetModule team-tracker,
                                #   server.entry, secrets (jira), strategy metadata
  team-tracker-contributions.js # register({ registerTeamDetailTab, registerReport,
                                #   registerSettingsTab }) — the discovery seam
  classify.js                   # classifyIssue() + getJiraFields() (owns classification)
  client/                       # tab, settings, report, subcomponents, composables
  server/                       # index.js (entry) + routes/orchestration/…engine
```

### Contribution seam (`team-tracker-contributions.js`)

Core discovers `platform/*/team-tracker-contributions.js` and calls its exported
`register(api)` with an **injected** registrar API — the extension never imports
team-tracker internals:

```js
export function register({ registerTeamDetailTab, registerReport, registerSettingsTab }) {
  registerTeamDetailTab({
    id: 'allocation', label: 'Allocation', order: 40,
    isVisible: () => true, // gated on the strategy being configured
    render: { type: 'component', load: () => import('./client/TeamAllocationTab.vue') }
  })
  // registerReport({ … render: { … './client/reports/AllocationReport.vue' } })
  // registerSettingsTab({ … render: { … './client/AllocationSettings.vue' } })
}
```

`render` is a **descriptor** (`{ type: 'component', load: () => import(...) }`),
never a raw component, so client chunks stay code-split.

### Strategy metadata (`manifest.json` → `strategy`)

The strategy (formerly `platform/allocation-strategy/`) is folded in. Its
metadata lives under `manifest.strategy`:

```json
{
  "strategy": {
    "id": "ai-eng-40-40-20",
    "name": "AI Engineering 40/40/20",
    "description": "Classifies work into Tech Debt & Quality (40%), New Features (40%), and Learning & Enablement (20%)",
    "categories": [
      { "key": "tech-debt-quality", "name": "Tech Debt & Quality", "color": "amber", "target": 40 },
      { "key": "new-features", "name": "New Features", "color": "blue", "target": 40 },
      { "key": "learning-enablement", "name": "Learning & Enablement", "color": "green", "target": 20 }
    ]
  }
}
```

`classify.js` exports `classifyIssue(issue)` (returns a category key or
`'uncategorized'`) and optionally `getJiraFields()` (declares extra Jira field
IDs + an `extract` function). The AI-Eng story-points field remains the
hardcoded `customfield_10028`.

### Self-loading the strategy (core no longer provides it)

Core removed `loadAllocationStrategy` and `context.allocationStrategy`, so the
extension is fully self-sufficient:

- **Backend** — `server/index.js` builds the strategy object from
  `manifest.strategy` + `classify.js` and threads it (plus the Jira transport)
  into `server/routes.js`/orchestration via an augmented context. Routes are
  registered on the passed `router` and mounted by core at
  `/api/modules/team-tracker/allocation/...`. The refresh handler is preserved
  via `context.registerRefresh`.
- **Frontend** — `useAllocationStrategy()` reads `manifest.strategy` directly
  (no core loader). It reports `configured: true` whenever the extension is
  present. Backend metadata is also available at
  `GET /api/modules/team-tracker/allocation/strategy`.

### Secrets

The extension slug is `team-tracker/allocation`, so it does **not** inherit
team-tracker's Jira secrets automatically. `manifest.json` declares the `jira`
platform secret group and `server/index.js` reads `JIRA_EMAIL`/`JIRA_TOKEN` from
`context.secrets` (via core's shared `createJiraClient`) — never `process.env`.

```json
{ "secrets": { "platform": ["jira"] } }
```

### Server-only manifest (no nav item)

Core v2.0.62 allows server-only `module-views` extensions, so the manifest
declares only `server.entry` (plus `secrets` and `strategy`) — no `navItems` or
`client.views`. All UI surfaces through the contribution seam: the per-team
allocation tab, the report card, and the settings tab.

### Adding or changing the strategy

1. Edit `platform/allocation/manifest.json` → `strategy` (categories, targets).
2. Edit `platform/allocation/classify.js` classification logic.
3. Run `npm run validate:platform` to verify the manifest.

## Server Routes (`platform/*/`)

Server-route platform extensions register Express routes on a dedicated mount
path without contributing any UI. Core discovers manifests with
`"type": "server-routes"` and mounts the exported router at the path
specified by `mountPath` (e.g., `/api/usage`).

Requires `@org-pulse/core` ≥ 2.0.95, which adds the `server-routes`
extension type and the `appendToStorage`, `readRawFromStorage`,
`writeRawToStorage`, and `listAllStorageFiles` storage methods used by
server-route extensions.

### Manifest format

```json
{
  "type": "server-routes",
  "mountPath": "/api/usage",
  "server": {
    "entry": "./server/index.js"
  },
  "secrets": {
    "module": [
      {
        "key": "USAGE_TRACKING_HMAC_KEY",
        "description": "HMAC key for pseudonymizing user IDs",
        "required": false
      }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Must be `server-routes` |
| `mountPath` | string | yes | Absolute mount path for the router (e.g., `/api/usage`) |
| `server.entry` | string | yes | Path to the server entry point relative to the extension dir |
| `secrets` | object | no | Secret declarations — use `secrets.module` array with `key`, `description`, and `required` per secret |

### Server entry contract

The entry module must export a single function:

```js
module.exports = function register(router, context) {
  // router — Express Router, already scoped to mountPath
  // context — { storage, requireAuth, requireAdmin, resolveSecret, registerRefresh }
}
```

### Adding a new server-routes extension

1. Create `platform/<name>/manifest.json` with `"type": "server-routes"`
2. Create `platform/<name>/server/index.js` exporting the register function
3. Run `npm run validate:platform` to verify the manifest

## Pods (`platform/pods/`)

The **Pods** page is an AI Eng-specific `module-views` extension targeting
team-tracker. Step 1 is an intentional functional replica of the core **People**
directory so Pods can diverge without modifying `@org-pulse/core` or the
People page.

- Route: `#/team-tracker/pods`
- Nav item: **Pods**, after **People**
- View: `client/views/PodsView.vue`
- Local copies of the People page filter components live under
  `client/components/`, `client/composables/`, and `client/utils/`
- Uses the same registry, stats, sync-status, and field-definition APIs as People
- Search matches every person value the directory can expose: org, title, team,
  location, identities, lifecycle fields, and all `_appFields` values
- Row checkboxes build a live pod preview between the search bar and table, with
  a gradient bubble for each selected person
- The pod name is editable; each member bubble has a remove control
- The page is headed **Pods** with **Active**, **Archived**, and **+** sub-tabs
- **+** opens the create flow; **Create** calls `POST /pods`, blocks fewer than
  three members or a missing feature key client-side, surfaces server validation
  errors, and returns to the Active list
- Active and Archived show compact pod cards with tiny member initials. The `i`
  button opens a pinned detail panel (see below) instead of a hover tooltip
- Every pod carries a **feature key** such as `RHAISTRAT-2191`; active cards show
  it as **Working on** and archived cards as **Worked on**. The key links to the
  Jira browse URL
- Active/Archived can be filtered by pod name, member, or feature key
- **Completed** archives the pod
- **Next outcome** atomically creates a new pod, archives the current pod, and
  opens the new pod in Active
- The header checkbox selects or clears all currently visible rows

### Pod API and storage

The server extension exposes:

| Method | Endpoint |
|---|---|
| `GET` | `/api/modules/team-tracker/pods` |
| `POST` | `/api/modules/team-tracker/pods` |
| `GET` | `/api/modules/team-tracker/pods/:podId` |
| `POST` | `/api/modules/team-tracker/pods/:podId/members` |
| `POST` | `/api/modules/team-tracker/pods/:podId/duplicate` |
| `POST` | `/api/modules/team-tracker/pods/:podId/next-outcome` |
| `POST` | `/api/modules/team-tracker/pods/:podId/archive` |
| `GET` | `/api/modules/team-tracker/pods/permissions/me` |
| `GET` | `/api/modules/team-tracker/pods/:podId/mirror` |
| `POST` | `/api/modules/team-tracker/pods/mirrors` |

Rules enforced server-side:

- Minimum **3 active members** at creation
- At least one **Jira feature key** at creation. Keys are normalized to upper
  case and verified against Jira: the issue must exist, have issue type
  `Feature`, and not be in a `Done` status category. Creation fails closed with
  `502` when Jira cannot be reached
- A next outcome must use a **different** feature key from the pod it replaces,
  and the new key goes through the same Jira check before the source pod is
  archived
- Globally unique, case-insensitive pod names
- A person can belong to **only one active pod at a time**
- No rename, no hard delete
- Membership is **add-only**
- Duplicate is only allowed for an archived source pod
- Next outcome atomically archives the current pod and creates the new active pod
- Archive keeps history and hides the pod from active lists
- Creation requires **Senior Manager, Senior Engineering Manager, Director,
  Senior Director, VP, SVP, CTO, or admin**
- Add members, duplicate, and archive require the pod creator or an admin

### Pod work mirror

The Pods page projects each pod's feature into a read-only view. Nothing is
written to Jira or Product Pages, and no mirrored value is stored on the pod
record: everything is fetched at read time, so the pod stays the single record
and Jira stays the source of truth.

**Sources**

- **Jira** — feature fields plus one `parent in (...)` query for child work items
- **Product Pages** — code-freeze dates, read from
  `releases/delivery/product-pages-releases-cache.json` via `readFromStorage`.
  The cache is refreshed by the release tooling (a service account in
  production); the demo refreshes it by hand

**Derived values**

- `progress` — child items grouped by status category into `done`, `inProgress`,
  `todo`, `other`. Progress can go **down** when scope is added; it is computed,
  never stored
- `attention` — `delta = progress% − elapsed%`, with `elapsed` running from the
  pod's `createdAt` to the code freeze. States: `delivered`, `overdue` (past
  freeze and not done), `behind` (`delta <= −15`), `on_track`, `unknown`
- `asOf` — Jira's own `updated` timestamp on the feature, not the fetch time, so
  a stale number is visibly stale

**Card display**

Progress renders as a full-width segmented bar (done / in progress / to do) with
`% · done/total` on the left and the attention chip plus days-to-freeze on the
right. Card states, and the legend shown above the grid:

| State | Meaning |
|---|---|
| On track (green) | In progress and keeping pace with elapsed time |
| Behind (amber) | More than 15 points behind elapsed time |
| Blocked / overdue (red) | Jira status blocked, or past code freeze and unfinished |
| Delivered (blue) | All child work done |
| To do / no signal (grey) | Not started, or no mirror yet |

While the batch call is in flight the card shows a skeleton, not `0%`. A failed
call shows **Mirror unavailable — retry**; a pod with no key shows **No Jira
feature linked**. Archived pods keep their completed state and are not fetched.

**Detail panel**

Clicking `i` pins a panel (no hover, so it can be read) with three blocks:
**Health** (Color, Status, Freeze, Progress), **Ownership** (Assignee, PM), and
**Delivery** (Fix version, Release type). Jira labels and pod-internal metadata
are deliberately excluded — this is a leadership review surface, not a Jira
replacement.

`Release Type` describes the feature itself (GA, TP, DP) and is independent of
the release it ships in, so it is mirrored separately and never inferred from the
fix version name.

**Field mapping**

| Pod view | Jira field |
|---|---|
| Summary | `summary` |
| Status | `status` |
| Color | `Color Status` (`customfield_10712`) |
| Assignee | `assignee` |
| PM | `Product Manager` (`customfield_10469`) |
| Fix version | `fixVersions[0]` |
| Target version | `Target Version` (`customfield_10855`) |
| Release type | `Release Type` (`customfield_10851`) |
| Owners / teams | `labels` (multi-valued; a pod may span teams) |

Code freeze is resolved by matching version and phase, never the full version
string: `3.7 EA1 RHOAI RELEASE` → `rhai-3.7.EA1` → `2026-12-11`. Version names
collide across projects and some are archived, so the match prefers an entry
that actually carries a freeze date.

Production pods live under `team-data/pods/<podId>.json`. In demo mode they are
kept in an in-memory session store so create/duplicate/archive can be exercised
without making the demo fixtures writable.

Run `npm run setup` after installing dependencies so the core platform is
symlinked into the workspace.

## Dockerfile layering

The core frontend builder does NOT include `platform/`. Deployment-specific
Dockerfiles add it:

```dockerfile
# In deploy/ai-eng.frontend.Dockerfile
COPY platform/ ./platform/
```

## Validation

Run `npm run validate:platform` to check manifest structure. This runs
automatically in CI. It gracefully skips if `platform/` doesn't exist
(core-only builds).
