import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReporter, titleOf } from '../lib/report.js'

const S = { header: { id: 's1' } }
const user = (text, kind = 'user') => ({ type: 'agent/inbox/spliced', data: { inserted: [{ role: 'user', content: [{ type: 'text', text }], source: { kind } }] } })

function run(events, session = S) {
  const out = []
  const r = createReporter((status, args) => out.push({ status, ...args }), 'zh')
  for (const e of events) r.handle(session, e)
  return out
}

test('a turn becomes working then done, with the title from the first message', () => {
  const out = run([
    user('帮我整理一下桌面'),
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { content: [{ type: 'text', text: 'Current runtime context…' }], source: { kind: 'runtime-context' } } },
    { type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: '整理好了' }] } } },
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
  ])
  assert.deepEqual(out, [
    { status: 'working', title: '帮我整理一下桌面', task: 'dsh-s1', detail: '帮我整理一下桌面' },
    { status: 'done', title: '帮我整理一下桌面', task: 'dsh-s1', detail: '整理好了' },
  ])
})

test('session/title renames the card; approvals and questions ask; errors and stops are errors', () => {
  const out = run([
    user('first'),
    { type: 'session/title', data: { title: '修登录页' } },
    { type: 'turn/start' },
    { type: 'approval/asked', data: {} },
    { type: 'tool/call', data: { name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ question: '用哪个库？' }] }) } },
    { type: 'turn/end', data: { reason: { kind: 'error', error: { message: '连接超时' } } } },
    { type: 'turn/start' },
    { type: 'turn/end', data: { reason: { kind: 'aborted' } } },
    { type: 'turn/end', data: { reason: { kind: 'interrupted' } } },
  ])
  assert.deepEqual(
    out.map((x) => [x.status, x.title, x.detail]),
    [
      ['working', '修登录页', 'first'],
      ['ask', '修登录页', 'DSH 在等你批准，回 DSH 看一眼'],
      ['ask', '修登录页', 'DSH 在问你：用哪个库？'],
      ['error', '修登录页', '连接超时'],
      ['working', '修登录页', 'first'],
      ['error', '修登录页', '被你停下了'],
    ],
  )
})

test('sub-agent sessions and goal follow-ups are not reported as the user', () => {
  assert.deepEqual(run([{ type: 'turn/start' }], { header: { id: 'x', origin: 'subagent' } }), [])
  const out = run([user('写测试'), user('continue the goal', 'goal'), { type: 'turn/start' }])
  assert.equal(out[0].detail, '写测试')
})

test('titles are one line and short', () => {
  assert.equal(titleOf('\n  第一行\n第二行', 'x'), '第一行')
  assert.equal(titleOf('a'.repeat(60), 'x').length, 40)
  assert.equal(titleOf('', 'fallback'), 'fallback')
})
