// dsh-kiki, browser half: a "Kiki" row in the DSH web sidebar.
// Kiki running on this Mac → the full Kiki app inside the page. Not installed → what Kiki is and an Install button.
// Plain script (no build step): DSH's module loader hands us `require` for react.
;(() => {
  const ID = 'dsh-kiki'
  const PANEL = 'kiki'
  const SITE = 'https://getkiki.ai'

  const ZH = {
    label: 'Kiki',
    loading: '正在找 Kiki…',
    inside: '你已经在 Kiki 里了：这个 DSH 是 Kiki 的一位成员在用。',
    remote: '你是从别的电脑打开的 DSH 网页。Kiki 跑在 DSH 那台 Mac 上，到那台电脑上打开这一页就能看到它。',
    openApp: '打开 Kiki',
    notRunning: 'Kiki 已经装好了，但现在没开。',
    introTitle: 'Kiki：你的 AI 首席秘书',
    intro: [
      '你说一句话，Kiki 判断该谁干、派给团队成员，做完了把结果给你。',
      '装好后它就在这一栏里；成员默认用你这台电脑上的 DSH 干活，也能用你 DSH 里存的 DeepSeek 密钥，不用再填。',
      '你在 DSH 里聊的对话，也会在 Kiki 的总览里出一张卡片。',
    ],
    installNote: '会下载 Kiki 的 Mac App（约 100MB）放进「应用程序」，跟从官网下载的是同一个；以后它自己更新。',
    install: '安装 Kiki',
    steps: { starting: '准备中…', downloading: '正在下载 Kiki…', unpacking: '正在放进「应用程序」…', opening: '正在打开 Kiki…', done: '装好了，Kiki 正在启动…' },
    failed: '没装上：',
    retry: '再试一次',
    notMac: 'Kiki 现在只有 Mac 版，Windows 版即将推出。',
    site: '去官网看看',
    report: '把 DSH 的对话报给 Kiki',
    keyAsk: '用你 DSH 里的 DeepSeek 密钥给 Kiki 接上大脑？',
    keyYes: '好',
    keyNo: '不用',
    keyDone: 'Kiki 已经用上你的 DeepSeek 密钥了。',
    newWindow: '在新窗口打开',
  }
  const EN = {
    label: 'Kiki',
    loading: 'Looking for Kiki…',
    inside: 'You are already in Kiki: this DSH belongs to one of its members.',
    remote: 'You opened this DSH page from another computer. Kiki runs on the Mac that runs DSH; open this page there to see it.',
    openApp: 'Open Kiki',
    notRunning: 'Kiki is installed but not running.',
    introTitle: 'Kiki: your AI chief of staff',
    intro: [
      'Say what you need. Kiki decides who should do it, hands it to a team member, and brings you the result.',
      'Once installed it lives in this tab. Members work with the DSH on this computer by default and can use the DeepSeek key you saved in DSH.',
      'Your DSH conversations show up as cards in Kiki too.',
    ],
    installNote: 'Downloads the Kiki Mac app (about 100 MB) into Applications: the same app as on the website. It updates itself afterwards.',
    install: 'Install Kiki',
    steps: { starting: 'Getting ready…', downloading: 'Downloading Kiki…', unpacking: 'Moving it into Applications…', opening: 'Opening Kiki…', done: 'Installed. Kiki is starting…' },
    failed: 'Install failed: ',
    retry: 'Try again',
    notMac: 'Kiki is Mac-only for now. Windows is coming soon.',
    site: 'Visit the website',
    report: 'Report DSH conversations to Kiki',
    keyAsk: 'Use the DeepSeek key saved in DSH for Kiki?',
    keyYes: 'Yes',
    keyNo: 'No thanks',
    keyDone: 'Kiki now uses your DeepSeek key.',
    newWindow: 'Open in a new window',
  }
  const t = () => (String(globalThis.navigator?.language ?? '').toLowerCase().startsWith('zh') ? ZH : EN)

  /** DSH may be served under a sub-path (behind a proxy): our routes live under the same prefix. */
  function base() {
    try {
      const u = new URL(document.baseURI)
      return u.pathname.replace(/\/+$/, '') + '/dsh-kiki'
    } catch {
      return '/dsh-kiki'
    }
  }
  const api = (path, body) =>
    fetch(base() + path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json', 'x-dsh-kiki': '1' }, body: JSON.stringify(body) }).then((r) => r.json())

  const isLoopback = () => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(location.hostname)
  const store = {
    get(k) {
      try {
        return localStorage.getItem(`dsh-kiki:${k}`)
      } catch {
        return null
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(`dsh-kiki:${k}`, v)
      } catch {}
    },
  }

  const CSS = `
.dk{--dk-accent:#b35900;--dk-on-accent:#fff;--dk-muted:rgba(0,0,0,.56);--dk-line:rgba(0,0,0,.1);--dk-card:rgba(0,0,0,.03);
  height:100%;display:flex;flex-direction:column;color:inherit;font:inherit;min-height:0}
@media (prefers-color-scheme: dark){.dk{--dk-accent:#fd890c;--dk-on-accent:#131419;--dk-muted:rgba(255,255,255,.6);--dk-line:rgba(255,255,255,.12);--dk-card:rgba(255,255,255,.04)}}
:root[data-theme=dark] .dk,.dark .dk{--dk-accent:#fd890c;--dk-on-accent:#131419;--dk-muted:rgba(255,255,255,.6);--dk-line:rgba(255,255,255,.12);--dk-card:rgba(255,255,255,.04)}
:root[data-theme=light] .dk{--dk-accent:#b35900;--dk-on-accent:#fff;--dk-muted:rgba(0,0,0,.56);--dk-line:rgba(0,0,0,.1);--dk-card:rgba(0,0,0,.03)}
.dk-bar{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--dk-line);font-size:13px;flex-wrap:wrap}
.dk-bar b{font-weight:600}
.dk-sp{flex:1}
.dk-sw{display:inline-flex;align-items:center;gap:6px;color:var(--dk-muted);cursor:pointer;user-select:none}
.dk-sw input{accent-color:var(--dk-accent);margin:0}
.dk-a{color:var(--dk-accent);text-decoration:none}
.dk-a:hover{text-decoration:underline}
.dk-frame{flex:1;border:0;width:100%;min-height:0;background:transparent}
.dk-key{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--dk-line);font-size:13px;flex-wrap:wrap}
.dk-page{flex:1;overflow:auto;display:flex;justify-content:center;padding:48px 16px}
.dk-card{max-width:460px;width:100%}
.dk-logo{width:44px;height:44px;display:block;margin-bottom:16px}
.dk-card h2{font-size:20px;font-weight:650;margin:0 0 12px}
.dk-card p{margin:0 0 10px;line-height:1.6}
.dk-note{color:var(--dk-muted);font-size:12.5px}
.dk-btn{appearance:none;border:0;border-radius:8px;padding:8px 16px;font:inherit;font-weight:600;cursor:pointer;background:var(--dk-accent);color:var(--dk-on-accent)}
.dk-btn[disabled]{opacity:.55;cursor:default}
.dk-btn.dk-ghost{background:transparent;color:inherit;border:1px solid var(--dk-line);font-weight:500}
.dk-row{display:flex;gap:10px;align-items:center;margin-top:18px;flex-wrap:wrap}
.dk-err{color:#d93025;font-size:13px;margin-top:10px}
`

  function makeFactory() {
    return (require) => {
      const React = require('react')
      const h = React.createElement
      const { useEffect, useState, useCallback } = React

      function Logo({ size = 20, color = false, className }) {
        // Kiki's mark: a tilted rounded square with two eyes
        return h(
          'svg',
          { width: size, height: size, viewBox: '0 0 64 64', className, 'aria-hidden': true },
          h(
            'g',
            { transform: 'rotate(-9 32 32)' },
            color
              ? [
                  h('rect', { key: 'b', x: 7, y: 7, width: 50, height: 50, rx: 13, fill: '#fd890c' }),
                  h('rect', { key: 'l', x: 21, y: 21, width: 8, height: 22, rx: 4, fill: '#131419' }),
                  h('rect', { key: 'r', x: 35, y: 21, width: 8, height: 22, rx: 4, fill: '#131419' }),
                ]
              : h('path', {
                  fill: 'currentColor',
                  fillRule: 'evenodd',
                  d: 'M20 7h24a13 13 0 0 1 13 13v24a13 13 0 0 1-13 13H20A13 13 0 0 1 7 44V20A13 13 0 0 1 20 7Zm5 14a4 4 0 0 0-4 4v14a4 4 0 0 0 8 0V25a4 4 0 0 0-4-4Zm14 0a4 4 0 0 0-4 4v14a4 4 0 0 0 8 0V25a4 4 0 0 0-4-4Z',
                }),
          ),
        )
      }

      function useStyle() {
        useEffect(() => {
          if (document.querySelector('style[data-plugin-css="dsh-kiki"]')) return
          const s = document.createElement('style')
          s.setAttribute('data-plugin-css', 'dsh-kiki')
          s.textContent = CSS
          document.head.appendChild(s)
        }, [])
      }

      function KikiPage() {
        useStyle()
        const L = t()
        const [st, setSt] = useState(null)
        const [err, setErr] = useState('')
        const refresh = useCallback(() => api('/status').then(setSt, () => setSt((x) => x ?? { error: true })), [])
        useEffect(() => {
          refresh()
          // poll faster while installing or waiting for Kiki to come up
          const busy = st && (st.install?.state === 'running' || (st.installed && !st.running))
          const id = setInterval(refresh, busy ? 1500 : 6000)
          return () => clearInterval(id)
        }, [refresh, st && st.install?.state, st && st.running, st && st.installed])

        const post = (path, body = {}) =>
          api(path, body).then((j) => {
            if (j && j.error) setErr(String(j.error))
            refresh()
            return j
          })

        if (!st) return h('div', { className: 'dk' }, h('div', { className: 'dk-page' }, h('p', { className: 'dk-note' }, L.loading)))
        const page = (...kids) => h('div', { className: 'dk' }, h('div', { className: 'dk-page' }, h('div', { className: 'dk-card' }, h(Logo, { size: 44, color: true, className: 'dk-logo' }), ...kids)))

        if (st.inside) return page(h('p', null, L.inside))

        if (st.running) {
          if (!isLoopback()) return page(h('p', null, L.remote))
          return h(Running, { st, L, post })
        }

        if (st.platform !== 'darwin')
          return page(h('h2', null, L.introTitle), ...L.intro.map((x, i) => h('p', { key: i }, x)), h('p', null, L.notMac), h('div', { className: 'dk-row' }, h('a', { className: 'dk-btn', href: SITE, target: '_blank', rel: 'noopener' }, L.site)))

        if (st.installed && st.install?.state !== 'running')
          return page(h('p', null, L.notRunning), h('div', { className: 'dk-row' }, h('button', { className: 'dk-btn', onClick: () => post('/open') }, L.openApp)), err && h('div', { className: 'dk-err' }, err))

        const ins = st.install ?? {}
        const busy = ins.state === 'running'
        return page(
          h('h2', null, L.introTitle),
          ...L.intro.map((x, i) => h('p', { key: i }, x)),
          h('p', { className: 'dk-note' }, L.installNote),
          h(
            'div',
            { className: 'dk-row' },
            h('button', { className: 'dk-btn', disabled: busy, onClick: () => (setErr(''), post('/install')) }, busy ? L.steps[ins.step] ?? L.steps.starting : ins.state === 'error' ? L.retry : L.install),
            h('a', { className: 'dk-a', href: SITE, target: '_blank', rel: 'noopener' }, L.site),
          ),
          ins.state === 'error' && h('div', { className: 'dk-err' }, L.failed + ins.error),
          err && h('div', { className: 'dk-err' }, err),
        )
      }

      function Running({ st, L, post }) {
        const [keyState, setKeyState] = useState(st.edition === 'dsh' && st.hasKey && !store.get('key') ? 'ask' : '')
        const useKey = () =>
          post('/use-key').then((j) => {
            store.set('key', j && j.ok ? 'used' : 'no')
            setKeyState(j && j.ok ? 'done' : '')
          })
        return h(
          'div',
          { className: 'dk' },
          h(
            'div',
            { className: 'dk-bar' },
            h(Logo, { size: 18, color: true }),
            h('b', null, 'Kiki'),
            st.version && h('span', { className: 'dk-note' }, `v${st.version}`),
            h('span', { className: 'dk-sp' }),
            h('label', { className: 'dk-sw' }, h('input', { type: 'checkbox', checked: !!st.autoReport, onChange: (e) => post('/report', { on: e.target.checked }) }), L.report),
            h('a', { className: 'dk-a', href: st.url, target: '_blank', rel: 'noopener' }, L.newWindow),
          ),
          keyState === 'ask' &&
            h(
              'div',
              { className: 'dk-key' },
              h('span', null, L.keyAsk),
              h('button', { className: 'dk-btn', onClick: useKey }, L.keyYes),
              h('button', { className: 'dk-btn dk-ghost', onClick: () => (store.set('key', 'no'), setKeyState('')) }, L.keyNo),
            ),
          keyState === 'done' && h('div', { className: 'dk-key' }, L.keyDone),
          h('iframe', { className: 'dk-frame', src: st.url, title: 'Kiki', allow: 'clipboard-read; clipboard-write; microphone' }),
        )
      }

      return {
        name: ID,
        inject: ['slots'],
        apply(ctx) {
          ctx.slots.inject('main', function* () {
            yield ctx.slots.register({ name: 'main', key: PANEL }, KikiPage)
          })
          ctx.slots.inject('sidebar.panellist', function* () {
            yield ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 20, label: () => t().label }, ({ size }) => h(Logo, { size: size ?? 16 }))
          })
        },
      }
    }
  }

  window.__ModuleLoader__.load({ id: ID, factory: makeFactory() })
})()
