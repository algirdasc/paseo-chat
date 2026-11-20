# Pretty Chat for Paseo

A [Paseo](https://paseo.sh) plugin that polishes the agent chat: syntax-highlighted code blocks, thinking and tool calls folded into one quiet row, annotations you can comment on and send back to the agent, quick prompts above the composer, and the host's CPU/RAM usage in the sidebar — all adjustable from a settings page.

## Features

- **Markdown with syntax-highlighted code.** Messages containing fenced code blocks render as Markdown; code gets a header with the language, a copy button, and theme-aware coloring (regex tokenizer, covering C-family/JS/TS/Python/JSON plus a shell tokenizer with command, flag and operator colors). Your own messages keep their native chat bubble.
- **Merged steps.** The thoughts and tool calls between two replies fold into one muted row — "Thought 1 time, ran 1 command, and read 1 file · 3s" — with the live step while working and red failure counts. Open it for each step, with shell commands syntax-highlighted. Plan approvals, todos, and subagent rows stay native.
- **Annotations.** Select any passage in a chat, leave a comment, and every waiting comment goes out with your next message — or ask about the passage in a new chat. Annotated passages stay tinted with a numbered badge; a composer pill lists what's waiting. Desktop and web only.
- **Quick prompts.** Your repeated prompts as pills above every agent's composer — tap to send. One pill each or a single Prompts menu; managed from their own settings page.
- **Host monitor.** The daemon host's CPU, RAM, load, uptime, and network speed as a quiet centered line at the bottom of the sidebar, refreshed on a configurable interval.
- **Settings page** under Settings → Plugins → Pretty Chat: toggles for highlighting and step merging, a chat width override in px, and the host monitor. Persisted on the host, synced across clients.

## Screenshots

![Merged steps and highlighted code](images/chat.png)
![Settings page](images/settings.png)

## Install

Requires Paseo 0.13.2 or later.

From the Paseo app: **Settings → Plugins**, enable plugins, paste into **Plugin source**:

```text
https://github.com/algirdasc/paseo-pretty-chat
```

From the command line:

```sh
paseo plugin add git:algirdasc/paseo-pretty-chat
```

## Update

```sh
paseo plugin update pretty-chat
```

## Development

```sh
npm install
npm run typecheck
paseo plugin install /path/to/paseo-pretty-chat   # or: paseo plugin reload pretty-chat
paseo plugin logs pretty-chat
```

The steps grouping is adapted from [paseo-chat-polish](https://github.com/lthieu96/paseo-chat-polish) (MIT), reduced and restyled. The annotations are adapted from [paseo-annotations](https://github.com/neunzig-zehn/paseo-annotations) (MIT, itself adapting [paseo-quote](https://github.com/keefeere/paseo-quote)); the quick prompts are adapted from [paseo-quick-prompts](https://github.com/kingsleydon/paseo-plugins) (MIT); see [NOTICE.md](NOTICE.md). The host monitor's memory accounting follows [paseo-kit](https://github.com/a31521424/paseo-kit)'s host-monitor (Apache-2.0).

## License

[MIT](LICENSE)
