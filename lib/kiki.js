// Talking to Kiki: where it is, whether it runs, the MCP token, and MCP tool calls.
// Nothing here touches DSH, so the tests can run it with plain node.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, sep } from 'node:path'

export const DEFAULT_URL = 'http://127.0.0.1:4567'
/** Name this plugin registers under in Kiki: shown on Kiki's cards, and the MCP token is issued for it. */
export const PRODUCT = 'DeepSeek Harness'

/** DSH's own home directory (DSH_HOME, default ~/.dsh). */
export function dshHome(env = process.env) {
  return env.DSH_HOME || join(env.HOME || homedir(), '.dsh')
}

/** Kiki's data directory (the Mac app keeps everything in ~/kiki-data). */
export function kikiDataDir(env = process.env) {
  return env.KIKI_DATA_DIR || join(env.HOME || homedir(), 'kiki-data')
}

/** The token and Kiki address live next to DSH's own settings, readable only by the user. */
export function confFile(env = process.env) {
  return join(dshHome(env), 'kiki.json')
}

export function readConf(env = process.env) {
  let j = {}
  try {
    j = JSON.parse(readFileSync(confFile(env), 'utf8'))
  } catch {}
  const url = String(env.KIKI_URL || j.url || DEFAULT_URL).replace(/\/+$/, '')
  const token = env.KIKI_MCP_TOKEN || (typeof j.token === 'string' ? j.token : undefined)
  return { url, token, autoReport: j.autoReport !== false }
}

export function saveConf(c, env = process.env) {
  const f = confFile(env)
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify(c, null, 2) + '\n', { mode: 0o600 })
  try {
    chmodSync(f, 0o600)
  } catch {}
}

export function isLocal(url) {
  try {
    const h = new URL(url).hostname
    return h === '127.0.0.1' || h === 'localhost' || h === '[::1]'
  } catch {
    return false
  }
}

/**
 * Is this DSH one that Kiki itself started for one of its members?
 * Kiki runs those with DSH_HOME = <kiki-data>/agents/<member>/.dsh and already shows their work,
 * so reporting them again would make duplicate cards. KIKI_DSH_KIKI=off turns the plugin off entirely.
 */
export function insideKiki(env = process.env) {
  if (env.KIKI_DSH_KIKI === 'off') return true
  if (env.DSH_AGENTS_HOME && env.DSH_AGENTS_HOME.startsWith(join(kikiDataDir(env), 'agents') + sep)) return true
  const home = env.DSH_HOME || ''
  return home.startsWith(join(kikiDataDir(env), 'agents') + sep)
}

/** Is Kiki up? Returns its version, or undefined. */
export async function kikiHealth(url, f = fetch) {
  try {
    const r = await f(`${url}/api/health`, { signal: AbortSignal.timeout(1500) })
    if (!r.ok) return undefined
    const j = await r.json()
    return j && j.ok ? String(j.version || '') || '?' : undefined
  } catch {
    return undefined
  }
}

/** No token yet: ask the Kiki on this computer for one (only a local Kiki hands them out). */
export async function ensureToken(c, f = fetch, env = process.env) {
  if (c.token) return c
  if (!isLocal(c.url)) throw new Error('A remote Kiki needs KIKI_MCP_TOKEN set by hand')
  const r = await f(`${c.url}/api/coders/mcp/tokens`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: PRODUCT }),
    signal: AbortSignal.timeout(3000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || typeof j.token !== 'string') throw new Error(j.error || `Kiki gave no token (${r.status})`)
  const out = { ...c, token: j.token }
  saveConf(out, env)
  return out
}

let seq = 0

/** Call one tool on Kiki's MCP endpoint and return the text it answers. */
export async function callKiki(c, tool, args, f = fetch) {
  const r = await f(`${c.url}/api/coders/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${c.token ?? ''}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name: tool, arguments: args } }),
    signal: AbortSignal.timeout(30_000),
  })
  if (r.status === 401) throw Object.assign(new Error('Kiki does not accept this token'), { code: 401 })
  const j = await r.json().catch(() => ({}))
  if (j.error) throw new Error(j.error.message || 'Kiki returned an error')
  const text = (j.result?.content ?? [])
    .filter((p) => p?.type === 'text')
    .map((p) => p.text)
    .join('\n')
  if (j.result?.isError) throw new Error(text || 'Kiki returned an error')
  return text
}

/** A Kiki client that fetches a token on first use and fetches a new one if Kiki revoked it. */
export function kikiClient(env = process.env, f = fetch) {
  let conf = readConf(env)
  return {
    get conf() {
      return conf
    },
    setAutoReport(on) {
      conf = { ...conf, autoReport: on }
      saveConf({ url: conf.url, ...(conf.token && !env.KIKI_MCP_TOKEN ? { token: conf.token } : {}), autoReport: on }, env)
    },
    async call(tool, args) {
      conf = await ensureToken(conf, f, env)
      try {
        return await callKiki(conf, tool, args, f)
      } catch (e) {
        if (e.code === 401 && !env.KIKI_MCP_TOKEN) {
          conf = await ensureToken({ ...conf, token: undefined }, f, env)
          return callKiki(conf, tool, args, f)
        }
        throw e
      }
    },
  }
}

export const kikiAppInstalled = (apps = ['/Applications/Kiki.app', join(homedir(), 'Applications', 'Kiki.app')]) => apps.find((p) => existsSync(p))
