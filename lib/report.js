// Turns DSH session events into progress reports for Kiki: one DSH session = one card in Kiki.
//   turn/start                          → working
//   approval/asked, ask_user_question   → ask   (Kiki moves the card to "needs you")
//   turn/end completed                  → done, with the last answer
//   turn/end error / max-tokens / aborted → error
// Sub-agent sessions are skipped: you wait for the parent conversation, not each helper.

const MAX_TITLE = 40
const MAX_DETAIL = 600

const TEXT = {
  zh: {
    approval: 'DSH 在等你批准，回 DSH 看一眼',
    question: 'DSH 在问你：',
    questionPlain: 'DSH 在等你回答，回 DSH 看一眼',
    error: '出错了',
    cut: '回答太长被截断了',
    stopped: '被你停下了',
    untitled: 'DSH 里的一件事',
  },
  en: {
    approval: 'DSH is waiting for your approval',
    question: 'DSH asks: ',
    questionPlain: 'DSH is waiting for your answer',
    error: 'Something went wrong',
    cut: 'The answer was cut off (too long)',
    stopped: 'Stopped by you',
    untitled: 'A task in DSH',
  },
}

export function pickLang(env = process.env) {
  const l = String(env.KIKI_LANGUAGE || env.LC_ALL || env.LANG || '').toLowerCase()
  return l.startsWith('zh') ? 'zh' : 'en'
}

export function sessionIdOf(session) {
  const s = session ?? {}
  const id = s.header?.id ?? s.id
  return id === undefined || id === null ? undefined : String(id)
}

/** Sub-agents and deeper delegation don't get their own card. */
export function isSubagent(session) {
  const h = session?.header
  if (!h || typeof h !== 'object') return false
  if (h.origin === 'subagent') return true
  return typeof h.delegationDepth === 'number' && h.delegationDepth > 0
}

/** Plain text of a message whose content is a string or a list of blocks. */
export function textOf(message) {
  const content = message?.content ?? message
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

export function titleOf(text, fallback) {
  const line = String(text ?? '').split('\n').map((s) => s.trim()).find(Boolean) ?? ''
  if (!line) return fallback
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1)}…` : line
}

const clip = (s, n = MAX_DETAIL) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function questionText(args) {
  try {
    const j = typeof args === 'string' ? JSON.parse(args) : args
    const q = Array.isArray(j?.questions) ? j.questions[0]?.question : j?.question
    return typeof q === 'string' ? q : ''
  } catch {
    return ''
  }
}

/**
 * @param send - (status, { title, task, detail? }) => void|Promise; failures are the caller's business.
 * @param lang - 'zh' | 'en'
 */
export function createReporter(send, lang = 'en') {
  const t = TEXT[lang] ?? TEXT.en
  /** per session: title, last user text, last assistant text */
  const sessions = new Map()

  const state = (sid) => {
    let s = sessions.get(sid)
    if (!s) sessions.set(sid, (s = { title: '', user: '', reply: '' }))
    return s
  }
  const emit = (sid, s, status, detail) =>
    send(status, { title: s.title || t.untitled, task: `dsh-${sid}`, ...(detail ? { detail: clip(detail) } : {}) })

  return {
    sessions,
    handle(session, event) {
      const type = event?.type
      if (!type || isSubagent(session)) return
      const sid = sessionIdOf(session)
      if (!sid) return
      const s = state(sid)
      const named = session?.header?.title ?? session?.title
      if (typeof named === 'string' && named.trim()) s.title = titleOf(named, s.title)
      const data = event.data ?? {}

      switch (type) {
        case 'agent/inbox/spliced': // the user's message queued for the next turn (arrives before turn/start)
        case 'user/message': {
          // user/message also carries runtime context and time snapshots (other source kinds) and goal follow-ups: only the user's own words count
          const msgs = type === 'user/message' ? [data.message ?? data] : Array.isArray(data.inserted) ? data.inserted : []
          for (const m of msgs) {
            if ((m?.source?.kind ?? 'user') !== 'user') continue
            const text = textOf(m)
            if (!text) continue
            s.user = text
            if (!s.title) s.title = titleOf(text, '')
          }
          return
        }
        case 'session/title':
          if (typeof data.title === 'string' && data.title.trim()) s.title = titleOf(data.title, s.title)
          return
        case 'turn/start':
          s.reply = ''
          return emit(sid, s, 'working', titleOf(s.user, ''))
        case 'assistant/message': {
          const text = textOf(data.message)
          if (text) s.reply = text
          return
        }
        case 'approval/asked':
          return emit(sid, s, 'ask', t.approval)
        case 'tool/call':
          if (String(data.name ?? '') !== 'ask_user_question') return
          {
            const q = questionText(data.arguments)
            return emit(sid, s, 'ask', q ? t.question + q : t.questionPlain)
          }
        case 'turn/end': {
          const kind = data.reason?.kind
          if (kind === 'completed') return emit(sid, s, 'done', s.reply || (typeof data.text === 'string' ? data.text : ''))
          if (kind === 'error') return emit(sid, s, 'error', String(data.reason?.error?.message ?? t.error))
          if (kind === 'max-tokens') return emit(sid, s, 'error', t.cut)
          if (kind === 'aborted') return emit(sid, s, 'error', t.stopped)
          if (kind === 'blocked') return emit(sid, s, 'ask', t.approval)
          return // interrupted (crash recovery) and unknown kinds: leave the card as it is
        }
        default:
          return
      }
    },
  }
}
