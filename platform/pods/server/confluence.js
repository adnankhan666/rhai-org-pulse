/**
 * Confluence publishing for pod 360 reports.
 *
 * Markdown is converted to Confluence storage format (a restricted XHTML
 * dialect) rather than shipped as Atlassian Document Format, because the
 * report is generated as markdown and storage format is one step away.
 *
 * Nothing here runs unless every setting is present: publishing is an
 * external write, so a half-configured install must say no, not half-succeed.
 */

const REQUIRED_SETTINGS = [
  'CONFLUENCE_BASE_URL',
  'CONFLUENCE_EMAIL',
  'CONFLUENCE_API_TOKEN',
  'CONFLUENCE_SPACE_KEY'
]

// Optional: without it pages are created at the space root.
const OPTIONAL_SETTINGS = ['CONFLUENCE_PARENT_ID']

function readSettings(secrets, env) {
  const source = { ...(env || {}), ...(secrets || {}) }
  const settings = {}
  for (const key of [...REQUIRED_SETTINGS, ...OPTIONAL_SETTINGS]) {
    settings[key] = source[key] ? String(source[key]).trim() : ''
  }
  return settings
}

/** Which settings are missing, so the UI can explain instead of just refusing. */
function confluenceStatus(secrets, env) {
  const settings = readSettings(secrets, env)
  const missing = REQUIRED_SETTINGS.filter(key => !settings[key])
  return {
    configured: missing.length === 0,
    missing,
    spaceKey: settings.CONFLUENCE_SPACE_KEY || null,
    parentId: settings.CONFLUENCE_PARENT_ID || null
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function inline(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

/**
 * Convert the subset of markdown the pod 360 generator emits:
 * headings, paragraphs, bullet lists, bold, inline code and pipe tables.
 */
function buildStorage(markdown) {
  const lines = String(markdown || '').split('\n')
  const out = []
  let listOpen = false

  const closeList = () => {
    if (listOpen) {
      out.push('</ul>')
      listOpen = false
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (!line.trim()) {
      closeList()
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }

    // pipe table: header row, separator row, then body rows
    if (line.trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1] || '')) {
      closeList()
      const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
      const header = cells(line)
      index += 2
      const rows = []
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(cells(lines[index]))
        index += 1
      }
      index -= 1
      out.push('<table><tbody>')
      out.push(`<tr>${header.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr>`)
      for (const row of rows) {
        out.push(`<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`)
      }
      out.push('</tbody></table>')
      continue
    }

    if (/^\s*-\s+/.test(line)) {
      if (!listOpen) {
        out.push('<ul>')
        listOpen = true
      }
      out.push(`<li>${inline(line.replace(/^\s*-\s+/, ''))}</li>`)
      continue
    }

    closeList()
    out.push(`<p>${inline(line)}</p>`)
  }

  closeList()
  return out.join('')
}

async function publishPage({ settings, title, markdown, fetchImpl }) {
  const fetchFn = fetchImpl || fetch
  const base = settings.CONFLUENCE_BASE_URL.replace(/\/+$/, '')
  const auth = Buffer.from(`${settings.CONFLUENCE_EMAIL}:${settings.CONFLUENCE_API_TOKEN}`).toString('base64')

  const body = {
    type: 'page',
    title,
    space: { key: settings.CONFLUENCE_SPACE_KEY },
    body: {
      storage: {
        value: buildStorage(markdown),
        representation: 'storage'
      }
    }
  }

  if (settings.CONFLUENCE_PARENT_ID) {
    body.ancestors = [{ id: String(settings.CONFLUENCE_PARENT_ID) }]
  }

  const response = await fetchFn(`${base}/wiki/rest/api/content`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  })

  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const detail = (payload && (payload.message || payload.errorMessages?.join('; '))) || text.slice(0, 300)
    throw new Error(`Confluence rejected the page (${response.status}): ${detail}`)
  }

  const links = (payload && payload._links) || {}
  const pageUrl = links.base && links.webui ? `${links.base}${links.webui}` : null

  return {
    pageId: payload && payload.id ? String(payload.id) : null,
    url: pageUrl,
    title
  }
}

module.exports = {
  REQUIRED_SETTINGS,
  OPTIONAL_SETTINGS,
  readSettings,
  confluenceStatus,
  buildStorage,
  publishPage
}
