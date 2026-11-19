# dsh-kiki

English | [中文](README.zh.md)

[Kiki](https://getkiki.ai) inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Kiki is a Mac app that acts as your AI chief of staff: you say what you need, it decides which team member should do it, hands the work over, and brings back the result.

This plugin adds a **Kiki** row to the DSH web sidebar:

| On this computer | The Kiki page shows |
| --- | --- |
| Kiki is running | The full Kiki app, plus a switch for reporting DSH conversations to Kiki |
| Kiki.app is installed but closed | An **Open Kiki** button |
| No Kiki, macOS | What Kiki is and an **Install Kiki** button |
| Windows / Linux | A note that Kiki is Mac-only for now |

It also:

- **Reports DSH sessions to Kiki.** Each DSH session becomes one card in Kiki's overview: working, needs you (approval or a question), done with the last answer, or error. Sub-agent sessions are skipped. Nothing is sent when Kiki isn't running.
- **Gives the model three Kiki tools:** `kiki_ask` hands a task to one of Kiki's members (it returns a ticket id and does not wait), `kiki_services` and `kiki_query` read local services you registered in Kiki (read-only).

## Install

```sh
dsh plugin --profile web add dsh-kiki
```

Then restart `dsh web`. On a desktop client, search for `dsh-kiki` in its plugin manager instead.

## What "Install Kiki" does

Only when you press the button, and only on macOS:

1. Downloads the latest `Kiki-mac-<arch>.zip` (about 100 MB) from `dl.kikibao.com`, falling back to [GitHub Releases](https://github.com/lkyxuan/kiki/releases), and checks it against the release's `SHA256SUMS`. These are the same steps as Kiki's own install script.
2. Unpacks `Kiki.app` into `/Applications` (or `~/Applications`) and opens it. An existing `Kiki.app` is never replaced.
3. Writes `~/kiki-data/edition.json` saying Kiki came from DSH, with the path and version of this DSH. Kiki reads it to give new members the DSH engine and to run them on this DSH instead of downloading its own copy. This note is only written for a fresh Kiki.

After that Kiki is an ordinary Mac app: it starts at login and updates itself. The Kiki app is closed source; this plugin is MIT.

When Kiki came from DSH and you saved a DeepSeek key in DSH, the Kiki page offers to hand that key to Kiki. The key goes only to the Kiki on this computer (`127.0.0.1`), and only when you press **Yes**.

## Settings

| Variable | Effect |
| --- | --- |
| `KIKI_URL` | Kiki address, default `http://127.0.0.1:4567` |
| `KIKI_MCP_TOKEN` | Token for a Kiki on another computer. A local Kiki hands one out on first use, saved in `$DSH_HOME/kiki.json` (mode 0600) |
| `KIKI_DSH_KIKI=off` | Turn the plugin off |

Reporting can also be switched off on the Kiki page. When DSH is one that Kiki started for one of its members, the plugin stays quiet, because Kiki already shows that work.

## How it works

- Host half (`lib/index.js`): listens to `session/event`, calls Kiki's MCP endpoint (`POST /api/coders/mcp`, tool `kiki_report`), registers the three tools on `ctx.tools`, and serves `/dsh-kiki/*` for the page. Write requests need the `x-dsh-kiki` header and a same-origin `Origin`.
- Browser half (`lib/client.js`): a `sidebar.panellist` row and a `main` page. When Kiki runs, the page is an iframe of `http://127.0.0.1:4567`, so it only works in a browser on the same Mac.

Tested with DSH 0.2.2-rc.1.

```sh
npm test
```

## Security

Like every DSH plugin, this runs with your permissions. It talks to `127.0.0.1` only, except for downloading Kiki from `dl.kikibao.com` / `github.com` when you press Install. It reads your DSH DeepSeek key only when you press **Yes** on the key prompt.

MIT
