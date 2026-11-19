import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { insideKiki, kikiClient } from '../lib/kiki.js'
import { sameOrigin } from '../lib/index.js'

test('a DSH started by Kiki for a member is recognised', () => {
  const env = { HOME: '/Users/a' }
  assert.equal(insideKiki({ ...env, DSH_HOME: '/Users/a/kiki-data/agents/写手/.dsh' }), true)
  assert.equal(insideKiki({ ...env, DSH_AGENTS_HOME: '/Users/a/kiki-data/agents/写手' }), true)
  assert.equal(insideKiki({ ...env, DSH_HOME: '/Users/a/.dsh' }), false)
  assert.equal(insideKiki({ ...env, KIKI_DSH_KIKI: 'off' }), true)
})

test('the client asks local Kiki for a token once, saves it 0600, and renews it on 401', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dk-'))
  const env = { HOME: home, DSH_HOME: join(home, '.dsh') }
  const calls = []
  let valid = 'tok-1'
  const f = async (url, init) => {
    calls.push(url.replace('http://127.0.0.1:4567', ''))
    if (url.endsWith('/tokens')) {
      assert.equal(JSON.parse(init.body).name, 'DeepSeek Harness')
      return Response.json({ token: valid })
    }
    if (init.headers.authorization !== `Bearer ${valid}`) return new Response('{}', { status: 401 })
    const m = JSON.parse(init.body)
    return Response.json({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: `ok ${m.params.name}` }] } })
  }
  const k = kikiClient(env, f)
  assert.equal(await k.call('kiki_report', { status: 'working' }), 'ok kiki_report')
  assert.equal(await k.call('kiki_ask', { text: 'x' }), 'ok kiki_ask')
  const file = join(home, '.dsh', 'kiki.json')
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).token, 'tok-1')
  assert.equal(statSync(file).mode & 0o777, 0o600)
  valid = 'tok-2'
  assert.equal(await k.call('kiki_ask', { text: 'y' }), 'ok kiki_ask')
  assert.deepEqual(calls, ['/api/coders/mcp/tokens', '/api/coders/mcp', '/api/coders/mcp', '/api/coders/mcp', '/api/coders/mcp/tokens', '/api/coders/mcp'])
})

test('writes are only accepted from the same origin', () => {
  assert.equal(sameOrigin({ headers: { host: '127.0.0.1:4700', origin: 'http://127.0.0.1:4700' } }), true)
  assert.equal(sameOrigin({ headers: { host: '127.0.0.1:4700', origin: 'https://evil.example' } }), false)
  assert.equal(sameOrigin({ headers: { host: '127.0.0.1:4700' } }), true)
})
