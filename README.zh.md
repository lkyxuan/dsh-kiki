# dsh-kiki

[English](README.md) | 中文

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里用 [Kiki](https://getkiki.ai)。Kiki 是 Mac 上的 AI 首席秘书：你说一句话，它判断该谁干、派给团队成员，做完了把结果给你。

装上后 DSH 网页左栏多一行 **Kiki**：

| 这台电脑上 | Kiki 页面显示 |
| --- | --- |
| Kiki 在运行 | 完整的 Kiki 界面，上面一个“把 DSH 的对话报给 Kiki”开关 |
| 装了 Kiki.app 但没开 | 「打开 Kiki」按钮 |
| 没装，macOS | Kiki 是什么，和「安装 Kiki」按钮 |
| Windows / Linux | Kiki 现在只有 Mac 版 |

另外：

- **DSH 的对话报给 Kiki**：一段 DSH 会话在 Kiki 总览里是一张卡片：在做、等你（要批准或在提问）、做完了（带最后一段回答）、出错。子代理不报。Kiki 没开时什么都不发。
- **给模型三个 Kiki 工具**：`kiki_ask` 把活交给 Kiki 的成员（回一个单号，不等结果），`kiki_services` / `kiki_query` 只读查你在 Kiki 登记的本机服务。

## 安装

```sh
dsh plugin --profile web add dsh-kiki
```

然后重启 `dsh web`。桌面客户端在它的插件管理里搜 `dsh-kiki`。

## 「安装 Kiki」做了什么

只在你点按钮时、只在 macOS 上：

1. 从 `dl.kikibao.com` 下载最新的 `Kiki-mac-<架构>.zip`（约 100MB），不通就从 [GitHub Releases](https://github.com/lkyxuan/kiki/releases) 下，按发布里的 `SHA256SUMS` 核对。跟 Kiki 自己的安装脚本是同一套步骤。
2. 把 `Kiki.app` 放进「应用程序」（没权限就放 `~/Applications`）并打开。已经有 `Kiki.app` 时不会覆盖。
3. 写一份 `~/kiki-data/edition.json`，说明这个 Kiki 是从 DSH 装的、这个 DSH 在哪、什么版本。Kiki 据此让新成员默认用 DSH 引擎，并且直接用这个 DSH，不再自己下载一份。只有全新的 Kiki 才写。

之后 Kiki 就是普通的 Mac App：开机自己启动、自己更新。Kiki App 本身闭源；这个插件是 MIT。

从 DSH 装的 Kiki、你在 DSH 里存过 DeepSeek 密钥时，Kiki 页面会问一句要不要把这把密钥给 Kiki。密钥只发给这台电脑上的 Kiki（`127.0.0.1`），而且只在你点「好」时发。

## 设置

| 变量 | 作用 |
| --- | --- |
| `KIKI_URL` | Kiki 地址，默认 `http://127.0.0.1:4567` |
| `KIKI_MCP_TOKEN` | 连别的电脑上的 Kiki 用的口令。本机的 Kiki 第一次用时自动给，存在 `$DSH_HOME/kiki.json`（只有你能读） |
| `KIKI_DSH_KIKI=off` | 整个关掉 |

报进度也能在 Kiki 页面上关。Kiki 自己给成员起的 DSH 不报（Kiki 本来就看得到）。

## 安全

跟所有 DSH 插件一样，它用你的权限运行。除了点安装时从 `dl.kikibao.com` / `github.com` 下载 Kiki，只连 `127.0.0.1`。只有在你点「好」时才读 DSH 里的 DeepSeek 密钥。

MIT
