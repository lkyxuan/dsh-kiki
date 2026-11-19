import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checksumOk, installKiki, sha256, writeEdition, zipName } from '../lib/install.js'

const dsh = { node: '/usr/local/bin/node', bin: '/x/node_modules/@deepseek-ai/dsh/lib/bin.js', version: '0.2.2-rc.1' }

test('checksums are matched by file name', () => {
  const buf = Buffer.from('kiki')
  const sums = `${'0'.repeat(64)}  Kiki-0.6.7-mac-arm64.dmg\n${sha256(buf)}  Kiki-mac-arm64.zip\n`
  assert.equal(checksumOk(buf, sums, 'Kiki-mac-arm64.zip'), true)
  assert.equal(checksumOk(Buffer.from('other'), sums, 'Kiki-mac-arm64.zip'), false)
  assert.equal(checksumOk(buf, sums, 'Kiki-mac-x64.zip'), false)
  assert.equal(zipName('arm64'), 'Kiki-mac-arm64.zip')
  assert.equal(zipName('x64'), 'Kiki-mac-x64.zip')
})

test('the edition note is written only for a fresh Kiki, and refreshed only if it says dsh', () => {
  const home = mkdtempSync(join(tmpdir(), 'dk-'))
  const env = { HOME: home }
  const file = join(home, 'kiki-data', 'edition.json')
  assert.equal(writeEdition('refresh', env, dsh), false)
  assert.equal(writeEdition('fresh', env, dsh), true)
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).dsh, dsh)
  assert.equal(writeEdition('refresh', env, dsh), false) // nothing changed
  assert.equal(writeEdition('refresh', env, { ...dsh, version: '0.2.3' }), true)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).dsh.version, '0.2.3')

  const used = mkdtempSync(join(tmpdir(), 'dk-'))
  mkdirSync(join(used, 'kiki-data'))
  writeFileSync(join(used, 'kiki-data', 'registry.json'), '{}')
  assert.equal(writeEdition('fresh', { HOME: used }, dsh), false) // a Kiki set up before stays as it was
})

test('install: Mac only; an existing Kiki.app is opened, not replaced; a download is checked and unpacked', async () => {
  await assert.rejects(installKiki(() => {}, { platform: 'linux' }), /Mac-only/)

  const apps = mkdtempSync(join(tmpdir(), 'apps-'))
  mkdirSync(join(apps, 'Kiki.app'))
  const ran = []
  const r1 = await installKiki(() => {}, { platform: 'darwin', dest: apps, run: async (...a) => ran.push(a) })
  assert.deepEqual(r1, { already: true })
  assert.deepEqual(ran, [['open', [join(apps, 'Kiki.app')]]])

  const dest = mkdtempSync(join(tmpdir(), 'apps-'))
  const home = mkdtempSync(join(tmpdir(), 'home-'))
  const zip = Buffer.from('zip bytes')
  const f = async (url) => {
    if (url.endsWith('/latest.json')) return Response.json({ tag: 'v0.6.7' })
    if (url.endsWith('/Kiki-mac-arm64.zip')) return new Response(zip)
    if (url.endsWith('/SHA256SUMS')) return new Response(`${sha256(zip)}  Kiki-mac-arm64.zip\n`)
    return new Response('', { status: 404 })
  }
  const steps = []
  const cmds = []
  const r2 = await installKiki((s) => steps.push(s), { platform: 'darwin', dest, arch: 'arm64', fetch: f, env: { HOME: home }, run: async (c, a) => cmds.push(c) })
  assert.equal(r2.tag, 'v0.6.7')
  assert.deepEqual(steps, ['downloading', 'unpacking', 'opening', 'done'])
  assert.deepEqual(cmds, ['ditto', 'xattr', 'open'])
  assert.equal(JSON.parse(readFileSync(join(home, 'kiki-data', 'edition.json'), 'utf8')).edition, 'dsh')
})

test('a bad checksum on the mirror falls back to GitHub, and fails if that is bad too', async () => {
  const dest = mkdtempSync(join(tmpdir(), 'apps-'))
  const urls = []
  const f = async (url) => {
    urls.push(url)
    if (url.endsWith('/latest.json')) return Response.json({ tag: 'v0.6.7' })
    if (url.endsWith('.zip')) return new Response('zip')
    return new Response(`${'f'.repeat(64)}  Kiki-mac-arm64.zip\n`)
  }
  await assert.rejects(installKiki(() => {}, { platform: 'darwin', dest, arch: 'arm64', fetch: f, run: async () => {} }), /checksum/)
  assert.ok(urls.some((u) => u.startsWith('https://github.com/lkyxuan/kiki/releases/latest/download/')))
})
