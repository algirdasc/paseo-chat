// Tokenizer adapted from github.com/lthieu96/paseo-chat-polish (MIT).
// shortcut: one regex for C-family, JS/TS, JSON, Python and shell-ish code, not a real grammar; upgrade to a per-language tokenizer if coloring accuracy becomes a complaint.

export type SyntaxKind =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "constant"
  | "function"
  | "punctuation"
  | "operator"
  | "parameter"
  | "variable";

export type SyntaxColors = Record<SyntaxKind, string>;

export interface Span {
  text: string;
  kind?: SyntaxKind;
}

const DARK: SyntaxColors = {
  comment: "#7f848e",
  string: "#98c379",
  number: "#d19a66",
  keyword: "#c678dd",
  constant: "#d19a66",
  function: "#61afef",
  punctuation: "#abb2bf",
  operator: "#56b6c2",
  parameter: "#d19a66",
  variable: "#e06c75",
};

const LIGHT: SyntaxColors = {
  comment: "#6e7781",
  string: "#0a3069",
  number: "#0550ae",
  keyword: "#cf222e",
  constant: "#0550ae",
  function: "#8250df",
  punctuation: "#24292f",
  operator: "#953800",
  parameter: "#953800",
  variable: "#953800",
};

export function syntaxColors(background: string): SyntaxColors {
  const match = /^#([0-9a-f]{6})$/i.exec(background.trim());
  if (!match) return DARK;
  const value = parseInt(match[1]!, 16);
  const luminance = (0.299 * (value >> 16) + 0.587 * ((value >> 8) & 0xff) + 0.114 * (value & 0xff)) / 255;
  return luminance < 0.5 ? DARK : LIGHT;
}

const KEYWORDS =
  "abstract|as|async|await|break|case|catch|class|const|continue|def|default|delete|do|elif|else|enum|export|extends|finally|fn|for|from|func|function|if|implements|import|in|instanceof|interface|let|match|new|of|package|private|protected|pub|public|readonly|return|static|struct|switch|throw|try|type|typeof|use|var|void|while|with|yield";

const TOKEN = new RegExp(
  [
    String.raw`(\/\/.*$|\/\*.*?\*\/|#.*$)`,
    String.raw`("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|\`(?:[^\`\\]|\\.)*\`?)`,
    String.raw`\b(\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?|0x[\da-f]+)\b`,
    String.raw`\b(${KEYWORDS})\b`,
    String.raw`\b(true|false|null|undefined|None|True|False|nil|this|self)\b`,
    String.raw`([A-Za-z_$][\w$]*)(?=\s*\()`,
    String.raw`([{}()[\];,.])`,
    String.raw`([=+\-*/<>!&|?:%^~]+)`,
  ].join("|"),
  "gi",
);

const KINDS: SyntaxKind[] = [
  "comment",
  "string",
  "number",
  "keyword",
  "constant",
  "function",
  "punctuation",
  "operator",
];

export function highlightLine(line: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) spans.push({ text: line.slice(last, at) });
    const group = match.slice(1).findIndex((value) => value !== undefined);
    spans.push({ text: match[0], kind: KINDS[group] });
    last = at + match[0].length;
  }
  if (last < line.length) spans.push({ text: line.slice(last) });
  return spans;
}

export function highlightCode(code: string): Span[] {
  const spans: Span[] = [];
  code.split("\n").forEach((line, index) => {
    if (index > 0) spans.push({ text: "\n" });
    spans.push(...highlightLine(line));
  });
  return spans;
}

const SHELL_KEYWORDS = new Set(["if", "then", "else", "elif", "fi", "for", "in", "do", "done", "while", "until", "case", "esac", "function", "export", "local", "return", "sudo", "time", "exec", "env", "xargs", "command"]);
// Words after which the next word is a command again.
const SHELL_LEADS = new Set(["then", "else", "do", "sudo", "time", "exec", "env", "xargs", "command"]);
const SHELL_TOKEN = /("(?:[^"\\]|\\.)*"?|'[^']*'?|\s+|\|\||&&|[0-9]*>>?&?[0-9]*|[|;&<()]|[^\s|;&<>()"']+)/g;

/** Splits one shell command line into colored spans: commands, flags, variables, strings, operators. */
export function highlightShell(line: string): Span[] {
  const spans: Span[] = [];
  let atCommand = true;
  let consumed = 0;
  const push = (text: string, kind?: SyntaxKind) => {
    spans.push({ text, kind });
    consumed += text.length;
  };
  for (const [token] of line.matchAll(SHELL_TOKEN)) {
    if (/^\s/.test(token)) {
      push(token);
    } else if (token.startsWith("#") && (consumed === 0 || /\s$/.test(line.slice(0, consumed)))) {
      push(line.slice(consumed), "comment");
      break;
    } else if (token[0] === '"' || token[0] === "'") {
      push(token, "string");
      atCommand = false;
    } else if (/^(\|\||&&|[|;&(])$/.test(token)) {
      push(token, "operator");
      atCommand = true;
    } else if (/^[0-9]*>>?&?[0-9]*$|^[<)]$/.test(token)) {
      push(token, "operator");
    } else if (atCommand && SHELL_KEYWORDS.has(token)) {
      push(token, "keyword");
      atCommand = SHELL_LEADS.has(token) || token === "if" || token === "while";
    } else if (atCommand && /^[A-Za-z_]\w*=/.test(token)) {
      const eq = token.indexOf("=");
      push(token.slice(0, eq), "variable");
      push("=", "operator");
      if (eq + 1 < token.length) push(token.slice(eq + 1));
    } else if (atCommand) {
      push(token, "function");
      atCommand = false;
    } else if (/^--?[A-Za-z]/.test(token)) {
      push(token, "parameter");
    } else if (token.includes("$")) {
      push(token, "variable");
    } else {
      push(token, /^\d+(\.\d+)?$/.test(token) ? "number" : undefined);
    }
  }
  return spans;
}

/** A whole shell command: each line is its own command, and heredoc bodies (`<<'EOF'` … `EOF`) are colored as code. */
export function highlightShellBlock(text: string): Span[] {
  const spans: Span[] = [];
  let heredocEnd: string | undefined;
  text.split("\n").forEach((line, index) => {
    if (index > 0) spans.push({ text: "\n" });
    if (heredocEnd === undefined) {
      spans.push(...highlightShell(line));
      heredocEnd = /<<-?\s*['"]?(\w+)['"]?/.exec(line)?.[1];
    } else if (line.trim() === heredocEnd) {
      spans.push({ text: line, kind: "keyword" });
      heredocEnd = undefined;
    } else {
      spans.push(...highlightLine(line));
    }
  });
  return spans;
}

const SHELL_LANGS = new Set(["sh", "bash", "zsh", "shell", "shellscript", "console"]);

export function highlightFor(lang: string, code: string): Span[] {
  return SHELL_LANGS.has(lang.toLowerCase()) ? highlightShellBlock(code) : highlightCode(code);
}
