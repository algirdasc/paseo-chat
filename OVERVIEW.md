# Chat Markdown

Renders chat messages that contain fenced code blocks as Markdown with syntax-highlighted code, folds each run of thinking and tool calls into one expandable merged row, and can draw an animated ASCII background (the Asciify engine's curated fields) beside the chat content. All of it is adjustable from Settings → Plugins → Chat Markdown.

## Settings

Chat: syntax highlighting on/off, merged steps on/off, and a chat width override in px (0 follows Paseo's own content width). Background: enable, animation (Constellation, Swell, Drift, Halo, Caustics, Contour, Ripple, Mesh, Interference, Cascade, Fluid), speed, opacity, cell size, ink color, and a "sides only" mode that keeps the field out from behind chat content on wide windows. Values persist on the host and sync across connected clients. The background runs on desktop and web only.

## Steps grouping

The thoughts and tool calls between two replies collapse into a single row, such as "Thought 1 time, ran 1 command, and read 1 file · 3s". While the agent works, the row names the step in progress; a failed step turns the row red. Open the row to see each step. Plan approval cards and Paseo's own todo and subagent rows are left native. The plugin follows the timelines of the agents on screen to place steps into runs.

## Markdown and code

Assistant replies and your own messages normally keep Paseo's native rendering. When a message contains a ``` fence, this plugin draws it itself: prose renders through Paseo's Markdown (headings, lists, tables, links), and each code block gets a header with the language name, a copy button, and regex-based syntax coloring that follows the active theme (dark palette on dark themes, light on light).

The coloring is a single regex tokenizer that covers C-family languages, JS/TS, JSON, Python and shell-ish code. It is not a full parser, so exotic grammars may color approximately. Messages without code blocks are left untouched.
