// Installing the Kiki Mac app from inside DSH: the same steps as Kiki's own install script
// (packaging/install.sh in lkyxuan/kiki): download the release zip, check its SHA-256, unpack it into
// Applications, launch it. Nothing runs until the user presses "Install Kiki".
//
// It also leaves a note for Kiki (~/kiki-data/edition.json) that it was installed from DSH, with where this
// DSH lives. Kiki reads it to give new members the DSH engine and to reuse this DSH instead of
// downloading its own copy.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { kikiDataDir } from './kiki.js'

export const MIRROR = 'https://dl.kikibao.com'
export const RELEASES = 'https://github.com/lkyxuan/kiki/releases/latest/download'
export const PLUGIN_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

export const zipName = (arch = process.arch) => `Kiki-mac-${arch === 'arm64' ? 'arm64' : 'x64'}.zip`

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/** Find the line for `file` in a SHA256SUMS file and compare. */
export function checksumOk(buf, sums, file) {
  const line = String(sums)
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .find((p) => p.length >= 2 && p[p.length - 1].replace(/^\*/, '') === file)
  return !!line && line[0].toLowerCase() === sha256(buf)
}

const run = (file, args, timeout = 120_000) =>
  new Promise((resolve, reject) =>
    execFile(file, args, { timeout, maxBuffer: 8 << 20 }, (err, out, errOut) => (err ? reject(new Error(String(errOut || err.message).trim())) : resolve(out))),
  )

async function get(url, f, timeout) {
  const r = await f(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(timeout) })
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

/** Download the zip and its checksums: the Cloudflare mirror first (faster in mainland China), then GitHub. */
export async function download(say, f = fetch, arch = process.arch) {
  const file = zipName(arch)
  const sources = []
  try {
    const latest = JSON.parse((await get(`${MIRROR}/latest.json`, f, 15_000)).toString('utf8'))
    if (typeof latest.tag === 'string' && /^v\d/.test(latest.tag)) sources.push({ base: `${MIRROR}/${latest.tag}`, tag: latest.tag })
  } catch {}
  sources.push({ base: RELEASES, tag: 'latest' })
  let lastErr
  for (const s of sources) {
    try {
      say('downloading', s.tag)
      const zip = await get(`${s.base}/${file}`, f, 15 * 60_000)
      const sums = (await get(`${s.base}/SHA256SUMS`, f, 30_000)).toString('utf8')
      if (!checksumOk(zip, sums, file)) throw new Error('checksum mismatch')
      return { zip, file, tag: s.tag }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error('download failed')
}

export function appsDir() {
  try {
    accessSync('/Applications', constants.W_OK)
    return '/Applications'
  } catch {
    const d = join(homedir(), 'Applications')
    mkdirSync(d, { recursive: true })
    return d
  }
}

function which(cmd, env = process.env) {
  for (const d of String(env.PATH ?? '').split(delimiter)) {
    if (d && existsSync(join(d, cmd))) return join(d, cmd)
  }
  return undefined
}

/** Where this DSH lives: the node running it, its bin.js, its version, and pnpm (DSH installs plugins with it). */
export function thisDsh(argv = process.argv, env = process.env) {
  let bin = argv[1] ? argv[1] : ''
  try {
    bin = realpathSync(bin)
  } catch {}
  let version
  for (let d = dirname(bin), i = 0; i < 4 && d && d !== dirname(d); i++, d = dirname(d)) {
    try {
      const pkg = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'))
      if (pkg.name === '@deepseek-ai/dsh') {
        version = pkg.version
        break
      }
    } catch {}
  }
  if (!version) return undefined
  return { node: process.execPath, bin, version, ...(which('pnpm', env) ? { pnpm: which('pnpm', env) } : {}) }
}

export const editionFile = (env = process.env) => join(kikiDataDir(env), 'edition.json')

export function readEdition(env = process.env) {
  try {
    return JSON.parse(readFileSync(editionFile(env), 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Leave the "installed from DSH" note for Kiki.
 * - fresh: only when Kiki has no data yet (a Kiki that was set up before stays the edition it was).
 * - refresh: an existing DSH note just gets the current DSH location (DSH may have been upgraded or moved).
 */
export function writeEdition(mode, env = process.env, dsh = thisDsh(undefined, env)) {
  const cur = readEdition(env)
  if (mode === 'refresh' && cur?.edition !== 'dsh') return false
  if (mode === 'fresh' && (cur || existsSync(join(kikiDataDir(env), 'registry.json')))) return false
  const next = { ...(cur ?? {}), edition: 'dsh', from: `dsh-kiki@${PLUGIN_VERSION}`, ...(dsh ? { dsh } : {}), at: new Date().toISOString() }
  if (cur && JSON.stringify({ ...cur, at: '' }) === JSON.stringify({ ...next, at: '' })) return false
  mkdirSync(kikiDataDir(env), { recursive: true })
  writeFileSync(editionFile(env), JSON.stringify(next, null, 2) + '\n')
  return true
}

/**
 * The whole install. `say(step, info?)` reports progress: downloading, unpacking, opening, done.
 * Only on macOS; never replaces a Kiki.app that is already there.
 */
export async function installKiki(say = () => {}, opts = {}) {
  const platform = opts.platform ?? process.platform
  if (platform !== 'darwin') throw new Error('Kiki is Mac-only for now')
  const dest = opts.dest ?? appsDir()
  if (existsSync(join(dest, 'Kiki.app'))) {
    say('opening')
    await (opts.run ?? run)('open', [join(dest, 'Kiki.app')])
    return { already: true }
  }
  const { zip, file, tag } = await download(say, opts.fetch ?? fetch, opts.arch)
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-kiki-'))
  try {
    const p = join(tmp, file)
    writeFileSync(p, zip)
    say('unpacking', tag)
    const sh = opts.run ?? run
    await sh('ditto', ['-x', '-k', p, dest])
    await sh('xattr', ['-dr', 'com.apple.quarantine', join(dest, 'Kiki.app')]).catch(() => {})
    writeEdition('fresh', opts.env)
    say('opening', tag)
    await sh('open', [join(dest, 'Kiki.app')])
    say('done', tag)
    return { tag }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** Kiki.app is there but not running: open it. */
export async function openKiki(opts = {}) {
  const app = opts.app ?? [join('/Applications', 'Kiki.app'), join(homedir(), 'Applications', 'Kiki.app')].find((p) => existsSync(p))
  if (!app) throw new Error('Kiki.app not found')
  await (opts.run ?? run)('open', [app])
}
