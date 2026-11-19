// dsh-kiki, host half (a Cordis plugin row: name / inject / apply).
//
// - Reports DSH sessions to Kiki, one card per session (see report.js). Silent when Kiki isn't running.
// - Gives the DSH model three Kiki tools: kiki_ask (hand a task to Kiki's members), kiki_services and kiki_query
//   (read-only lookups in local services registered in Kiki).
// - Serves /dsh-kiki/* for the "Kiki" page in the web sidebar (client.js): status, install Kiki, open Kiki,
//   hand DSH's DeepSeek key to Kiki, turn reporting on or off.
import { insideKiki, kikiAppInstalled, kikiClient, kikiHealth } from './kiki.js'
import { createReporter, pickLang } from './report.js'
import { PLUGIN_VERSION, installKiki, openKiki, readEdition, writeEdition } from './install.js'

export const name = 'dsh-kiki'
export const inject = []
export const ROUTE = '/dsh-kiki'

const RECHECK_MS = 30_000

export function apply(ctx) {
  const env = process.env
  const inside = insideKiki(env)
  const kiki = kikiClient(env)
  const lang = pickLang(env)
  const log = (msg) => ctx.logger?.debug?.(`[dsh-kiki] ${msg}`)

  // A Kiki installed from DSH: keep its note about where this DSH lives current.
  try {
    if (!inside) writeEdition('refresh', env)
  } catch {}

  // ---------- Reporting ----------
  let downAt = 0 // Kiki was unreachable at this time; don't try again for a while
  const reporter = createReporter(async (status, args) => {
    if (!kiki.conf.autoReport || Date.now() - downAt < RECHECK_MS) return
    try {
      await kiki.call('kiki_report', { status, ...args })
      downAt = 0
    } catch (e) {
      downAt = Date.now()
      log(`report failed: ${e.message}`)
    }
  }, lang)
  if (!inside) {
    ctx.effect(() => {
      const off = ctx.on('session/event', (session, event) => {
        try {
          reporter.handle(session, event)
        } catch (e) {
          log(`event: ${e.message}`)
        }
      })
      return () => off?.()
    }, 'dsh-kiki: report sessions to Kiki')
  }

  // ---------- Tools for the model ----------
  if (!inside) ctx.inject(['tools'], (c) => registerTools(c, kiki, log))

  // ---------- Routes for the sidebar page ----------
  const install = { state: 'idle', step: '', tag: '', error: '' }
  ctx.inject(['webServer'], (c) => {
    c.effect(
      () =>
        c.webServer.register({
          kind: 'prefix',
          path: ROUTE,
          handler: (req, res) =>
            handle(req, res).catch((e) => {
              if (!res.writableEnded) send(res, 500, { error: String(e?.message ?? e) })
            }),
        }),
      'dsh-kiki: sidebar routes',
    )
  })

  async function status() {
    const version = await kikiHealth(kiki.conf.url)
    let hasKey = false
    try {
      const cred = ctx.get?.('credentials')
      if (cred) {
        const { credentialRef } = await import('@deepseek-ai/dsh-credentials')
        const d = await cred.describe(credentialRef('DEEPSEEK_API_KEY'))
        hasKey = !!(d?.set ?? d?.configured ?? d?.present)
      }
    } catch {}
    return {
      plugin: PLUGIN_VERSION,
      platform: process.platform,
      inside,
      url: kiki.conf.url,
      running: !!version,
      version: version ?? '',
      installed: !!version || !!kikiAppInstalled(),
      edition: readEdition(env)?.edition ?? '',
      autoReport: kiki.conf.autoReport,
      hasKey,
      install,
    }
  }

  async function handle(req, res) {
    const path = new URL(req.url ?? '/', 'http://x').pathname.slice(ROUTE.length) || '/'
    if (req.method === 'GET' && path === '/status') return send(res, 200, await status())
    if (req.method !== 'POST') return send(res, 404, { error: 'not found' })
    // Writes only from DSH's own page: same origin and our header (a cross-site form or fetch can't set it without a preflight we never answer)
    if (req.headers['x-dsh-kiki'] !== '1' || !sameOrigin(req)) return send(res, 403, { error: 'forbidden' })
    const body = await readJson(req)

    if (path === '/install') {
      if (process.platform !== 'darwin') return send(res, 400, { error: 'mac-only' })
      if (install.state !== 'running') {
        Object.assign(install, { state: 'running', step: 'starting', tag: '', error: '' })
        installKiki((step, tag) => Object.assign(install, { step, ...(tag ? { tag } : {}) }))
          .then(() => Object.assign(install, { state: 'done' }))
          .catch((e) => Object.assign(install, { state: 'error', error: String(e?.message ?? e) }))
      }
      return send(res, 200, { install })
    }
    if (path === '/open') {
      await openKiki()
      return send(res, 200, { ok: true })
    }
    if (path === '/use-key') {
      const cred = ctx.get?.('credentials')
      if (!cred) return send(res, 400, { error: 'no-credentials' })
      const { credentialRef } = await import('@deepseek-ai/dsh-credentials')
      const key = (await cred.resolve(credentialRef('DEEPSEEK_API_KEY')))?.value
      if (!key) return send(res, 400, { error: 'no-key' })
      const r = await fetch(`${kiki.conf.url}/api/models/quick-key`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
        signal: AbortSignal.timeout(20_000),
      })
      const j = await r.json().catch(() => ({}))
      return send(res, r.ok ? 200 : 400, r.ok ? { ok: true } : { error: j.error || `HTTP ${r.status}` })
    }
    if (path === '/report') {
      kiki.setAutoReport(body.on !== false)
      return send(res, 200, { autoReport: kiki.conf.autoReport })
    }
    return send(res, 404, { error: 'not found' })
  }
}

function registerTools(ctx, kiki, log) {
  import('@deepseek-ai/dsh-tools')
    .then(({ defineTool }) => {
      const text = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }
      const tool = (name, description, parameters) =>
        ctx.tools.register(
          defineTool({
            name,
            description,
            parameters,
            output: text,
            timeoutMs: 40_000,
            execute: (args) => kiki.call(name, args ?? {}),
          }),
        )
      ctx.effect(
        () =>
          tool(
            'kiki_ask',
            "Hand a task to Kiki, the user's assistant app on this computer, when one of Kiki's agents should do it or it needs Kiki's own data and schedules. " +
              'Kiki does it in the background and the user sees the result in Kiki. This does not wait for the result; it returns a ticket id.',
            {
              text: { type: 'string', required: true, description: "What to do, with all the context needed, in the user's language" },
              title: { type: 'string', description: 'Short name for the task' },
              bao: { type: 'string', description: "Optional: name of the Kiki agent that should do it" },
            },
          ),
        'dsh-kiki: kiki_ask',
      )
      ctx.effect(
        () => tool('kiki_services', 'List the local services (databases, crawlers, data feeds) the user registered in Kiki. Call this before kiki_query.', {}),
        'dsh-kiki: kiki_services',
      )
      ctx.effect(
        () =>
          tool('kiki_query', 'Read data from one of the local services registered in Kiki (see kiki_services). Read-only.', {
            service: { type: 'string', required: true, description: 'Service name from kiki_services' },
            query: { type: 'string', description: 'SQL for sqlite (empty = list tables); the query text for http/command services' },
          }),
        'dsh-kiki: kiki_query',
      )
    })
    .catch((e) => log(`tools unavailable: ${e.message}`))
}

export function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true // same-origin GET/fetch without Origin (older browsers); the custom header still blocks cross-site
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(obj))
}

function readJson(req) {
  return new Promise((resolve) => {
    let s = ''
    req.setEncoding('utf8')
    req.on('data', (d) => {
      s += d
      if (s.length > 16_384) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}
