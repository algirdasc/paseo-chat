# Chat Markdown for Paseo

A [Paseo](https://paseo.sh) plugin that polishes the agent chat: syntax-highlighted code blocks, thinking and tool calls folded into one quiet row, and an optional animated ASCII background beside the chat content — all adjustable from a settings page.

## Features

- **Markdown with syntax-highlighted code.** Messages containing fenced code blocks render as Markdown; code gets a header with the language, a copy button, and theme-aware coloring (regex tokenizer, covering C-family/JS/TS/Python/JSON plus a shell tokenizer with command, flag and operator colors). Your own messages keep their native chat bubble.
- **Merged steps.** The thoughts and tool calls between two replies fold into one muted row — "Thought 1 time, ran 1 command, and read 1 file · 3s" — with the live step while working and red failure counts. Open it for each step, with shell commands syntax-highlighted. Plan approvals, todos, and subagent rows stay native.
- **ASCII background.** The [Asciify](https://asciify.org) engine's constellation (or Swell, Drift, Halo, Caustics, Contour, Ripple, Mesh, Interference, Cascade, Fluid) drawn behind the chat, with a lantern cursor glow. "Sides only" mode keeps it out from behind the content on wide windows. Desktop and web only.
- **Settings page** under Settings → Plugins → Chat Markdown: toggles for highlighting and step merging, chat width override in px, and background animation, speed, opacity, cell size, and ink color. Persisted on the host, synced across clients.

## Screenshots

![Merged steps and highlighted code](images/chat.png)
![ASCII background beside the chat](images/background.png)
![Settings page](images/settings.png)

## Install

Requires Paseo 0.13.2 or later.

From the Paseo app: **Settings → Plugins**, enable plugins, paste into **Plugin source**:

```text
https://github.com/algirdasc/paseo-chat
```

From the command line:

```sh
paseo plugin add git:algirdasc/paseo-chat
```

## Update

```sh
paseo plugin update paseo-chat-markdown
```

## Development

```sh
npm install
npm run typecheck
paseo plugin install /path/to/paseo-chat   # or: paseo plugin reload paseo-chat-markdown
paseo plugin logs paseo-chat-markdown
```

The steps grouping is adapted from [paseo-chat-polish](https://github.com/lthieu96/paseo-chat-polish) (MIT), reduced and restyled. The background is [asciify-engine](https://github.com/ayangabryl/asciify-engine).

## License

[MIT](LICENSE)
