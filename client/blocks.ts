export type Block = { kind: "text"; text: string } | { kind: "code"; lang: string; code: string };

// shortcut: only ``` fences, not ~~~ or indented code blocks; add them if someone asks.
export function splitBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let textLines: string[] = [];
  let codeLines: string[] | null = null;
  let lang = "";
  const flushText = () => {
    if (textLines.length === 0) return;
    blocks.push({ kind: "text", text: textLines.join("\n") });
    textLines = [];
  };
  for (const line of markdown.split("\n")) {
    if (codeLines) {
      if (/^```\s*$/.test(line)) {
        blocks.push({ kind: "code", lang, code: codeLines.join("\n") });
        codeLines = null;
      } else {
        codeLines.push(line);
      }
    } else if (line.startsWith("```")) {
      flushText();
      lang = line.slice(3).trim();
      codeLines = [];
    } else {
      textLines.push(line);
    }
  }
  if (codeLines) blocks.push({ kind: "code", lang, code: codeLines.join("\n") });
  flushText();
  return blocks;
}
