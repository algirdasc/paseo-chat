# AGENTS.md

Pretty Chat — a [Paseo](https://paseo.sh) plugin (id `pretty-chat`, manifest `paseo-plugin.json`) that polishes the agent chat. Five features: syntax-highlighted Markdown messages, thinking/tool calls merged into one row, passage annotations sent back to the agent, quick prompts above the composer, and the host's CPU/RAM in the sidebar footer. React Native Web components on the client, plain DOM pokes for what the plugin API doesn't cover.

## Commands

```sh
npm install
npm run typecheck                       # tsc for the client, then tsconfig.server.json (Node types) for the server
paseo plugin install "$PWD"             # dev install; then: paseo plugin reload pretty-chat
paseo plugin logs pretty-chat
```

There are no tests; the typecheck is the check. Both tsconfigs run with `lib: ES2023` and no DOM types — web code declares the browser APIs it uses by hand (`client/web.ts` top, `client/annotations/web/dom.ts`).

## Layout

| Path | Runtime | Role |
| --- | --- | --- |
| `index.client.tsx` | App | Entry: timeline transformers/renderers, settings screen, annotations |
| `index.server.ts` | Daemon | Entry: `registerSettings`, annotation RPC handlers |
| `shared/config.ts` | Both | Settings schema (`defineSettings`, host scope, versioned with `migrate`) |
| `shared/prompts.ts` | Both | Quick prompts settings schema (own settings id `prompts`) |
| `shared/annotations.ts` | Both | Annotation schema and RPC contracts (`pretty-chat.annotations.*`) |
| `client/config.ts` | App | Module-level config store + `useConfigBridge()` |
| `client/markdown.tsx`, `blocks.ts`, `highlight.ts` | App | Message renderer, fence splitter, regex syntax tokenizer |
| `client/steps.ts`, `steps-view.tsx` | App | Step-run engine (follows agent timelines) and the merged row |
| `client/settings.tsx` | App | Settings screen |
| `client/web.ts` | App | Web only: chat-width override |
| `client/quick-prompts/` | App | Quick prompts: `pills.ts` (composer pills), `follow.ts` (settings sync), `settings-screen.tsx` (CRUD) |
| `client/host-monitor.tsx`, `server/host-stats.ts`, `shared/host-stats.ts` | Both | Sidebar CPU/RAM line; `pretty-chat.host.stats` RPC, polled per config |
| `client/annotations/` | App | Annotations: `store.ts` (client copy), `pill.tsx` (composer pill), `agents.ts` (this host's agents), `actions.ts` (send/new chat via SDK), `format.ts` (outgoing text) |
| `client/annotations/web/` | App | Desktop/web only: `dom.ts`, `popover.ts`, `markers.ts`, `send-hook.ts`, `theme.ts` |
| `server/annotations.ts` | Daemon | `<PASEO_HOME>/plugin-data/pretty-chat/annotations.json`, mode 0600, atomic writes |

## Things that break if you're not careful

- **Paseo DOM contract.** Paseo has no plugin API for selections, the composer, or chat decorations, so the annotation web code drives the app's own markup. Every host selector lives at the top of `client/annotations/web/dom.ts` (checked against Paseo 0.11.1); `client/web.ts` has its own few. When a Paseo release renames a `data-testid`, those two files are the fix. Page-global names (`pretty-chat-annotation-*` CSS highlights, `data-pretty-chat-annotations-*` attributes, RPC names) are prefixed so this plugin can coexist with the standalone `annotations` plugin — keep the prefix.
- **Settings sync.** Transformers and the chat-width style run outside React and read a module store (`getConfig()`). Nothing plugin-mounted is always on screen (the sidebar item was removed), so every surface the plugin renders — the settings screen and both timeline renderers — calls `useConfigBridge()` to push host settings into that store. shortcut: with no plugin row mounted and settings closed, a change made from *another* client isn't picked up until one renders. Changing what transformers claim means re-registering them (`subscribeConfig` in `index.client.tsx`) so Paseo transforms again.
- **Merged steps.** A transformer sees one item at a time, so runs are rebuilt per agent in `client/steps.ts` from fetched + live timelines; the transformer just looks up its item. Plan approvals, todo, and subagent tool calls must stay native (see `TODO_TOOLS`/`DROPPED_TOOLS`). Removed items must be dropped from the list, never hidden in place — that crashed Paseo's virtual list.
- **Settings schema.** Host-persisted; bump `version` in `shared/config.ts` and extend `migrate` for any shape change.
- **Attribution.** Steps grouping is from paseo-chat-polish, annotations from paseo-annotations/paseo-quote, quick prompts from paseo-quick-prompts — all MIT, see `NOTICE.md`. Keep the file-header credits when touching those files.
