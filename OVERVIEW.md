# Pretty Chat

Renders chat messages that contain fenced code blocks as Markdown with syntax-highlighted code, folds each run of thinking and tool calls into one expandable merged row, lets you annotate passages of a chat and send the comments to the agent, keeps your repeated prompts as pills above every agent's composer, and shows the daemon host's CPU and RAM usage at the bottom of the sidebar. All of it is adjustable from Settings → Plugins → Pretty Chat.

## Settings

Chat: syntax highlighting on/off, merged steps on/off, and a chat width override in px (0 follows Paseo's own content width). Host monitor: sidebar line with the daemon host's CPU, RAM, load, uptime, and network speed on/off, and the refresh interval in seconds (default 5). Quick prompts live on their own settings page: up to 20 prompts with a label and text, reordered and shown as separate pills or one Prompts menu. Values persist on the host and sync across connected clients.

## Steps grouping

The thoughts and tool calls between two replies collapse into a single row, such as "Thought 1 time, ran 1 command, and read 1 file · 3s". While the agent works, the row names the step in progress; a failed step turns the row red. Open the row to see each step. Plan approval cards and Paseo's own todo and subagent rows are left native. The plugin follows the timelines of the agents on screen to place steps into runs.

## Annotations

Select any passage in a chat to annotate it: leave a comment, and every waiting comment goes out with your next message to that agent, formatted the way Paseo's own browser annotations are. "Ask in new chat" starts a fresh agent in the same workspace with the recent conversation as context and the passage plus your question as its first message. Waiting annotations keep their passage tinted with a numbered badge; clicking the badge or the passage opens the comment. A composer pill lists what's waiting and can send or clear it.

Annotations persist on the host in `<PASEO_HOME>/plugin-data/pretty-chat/annotations.json` and sync to every connected client. The selection toolbar, badges, and send hook run on desktop and web; elsewhere the composer pill is the whole feature.

## Markdown and code

Assistant replies and your own messages normally keep Paseo's native rendering. When a message contains a ``` fence, this plugin draws it itself: prose renders through Paseo's Markdown (headings, lists, tables, links), and each code block gets a header with the language name, a copy button, and regex-based syntax coloring that follows the active theme (dark palette on dark themes, light on light).

The coloring is a single regex tokenizer that covers C-family languages, JS/TS, JSON, Python and shell-ish code. It is not a full parser, so exotic grammars may color approximately. Messages without code blocks are left untouched.
