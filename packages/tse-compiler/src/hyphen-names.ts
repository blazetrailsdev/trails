export interface HyphenOptions {
  resolve: "literal" | "alias";
  positions: "property" | "identifier";
}

export interface HyphenEdit {
  srcStart: number;
  srcEnd: number;
  genStart: number;
  genEnd: number;
}

export interface HyphenIssue {
  offset: number;
  length: number;
  code:
    | "one-sided"
    | "unspaced-minus"
    | "digit-segment"
    | "bare-name"
    | "private-name"
    | "consecutive-hyphens";
  message: string;
}

export interface HyphenResult {
  code: string;
  edits: HyphenEdit[];
  issues: HyphenIssue[];
}

type Kind = "name" | "private" | "number" | "string" | "template" | "regex" | "punct";

interface Tok {
  kind: Kind;
  text: string;
  start: number;
  end: number;
}

const OPERATOR_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);
const BLOCK_HEAD_KEYWORDS = new Set(["else", "do", "try", "finally"]);
const DECLARATION_KEYWORDS = new Set(["const", "let", "var"]);
const PUNCTUATORS = [
  ">>>=",
  "...",
  "===",
  "!==",
  "**=",
  "<<=",
  ">>=",
  ">>>",
  "&&=",
  "||=",
  "??=",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "?.",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "<<",
  ">>",
  "**",
];
const ID_START = /[A-Za-z_$\u00a0-\uffff]/;
const ID_PART = /[\w$\u00a0-\uffff]/;

function tokenizeJs(code: string, from: number, to: number, out: Tok[]): void {
  let i = from;
  const prev = (): Tok | undefined => out[out.length - 1];
  const regexAllowed = (): boolean => {
    const p = prev();
    if (p === undefined) return true;
    if (p.kind === "name")
      return OPERATOR_KEYWORDS.has(p.text) && !isPropertyName(out, out.length - 1);
    if (p.kind !== "punct") return false;
    return p.text !== ")" && p.text !== "]" && p.text !== "}" && p.text !== "++" && p.text !== "--";
  };
  while (i < to) {
    const ch = code[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "/" && code[i + 1] === "/") {
      while (i < to && code[i] !== "\n") i++;
    } else if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end === -1 || end + 2 > to ? to : end + 2;
    } else if (ch === '"' || ch === "'") {
      const start = i++;
      while (i < to && code[i] !== ch) i += code[i] === "\\" ? 2 : 1;
      i = Math.min(i + 1, to);
      out.push({ kind: "string", text: code.slice(start, i), start, end: i });
    } else if (ch === "`") {
      const start = i++;
      while (i < to && code[i] !== "`") {
        if (code[i] === "\\") {
          i += 2;
        } else if (code[i] === "$" && code[i + 1] === "{") {
          const open = i + 1;
          let depth = 1;
          let j = i + 2;
          const inner: Tok[] = [];
          tokenizeJs(code, j, to, inner);
          let close = to;
          for (const t of inner) {
            if (t.kind !== "punct") continue;
            if (t.text === "{") depth++;
            else if (t.text === "}" && --depth === 0) {
              close = t.start;
              break;
            }
          }
          out.push({ kind: "punct", text: "${", start: i, end: open + 1 });
          for (const t of inner) if (t.end <= close) out.push(t);
          if (close < to) out.push({ kind: "punct", text: "}$", start: close, end: close + 1 });
          j = Math.min(close + 1, to);
          i = j;
        } else {
          i++;
        }
      }
      i = Math.min(i + 1, to);
      out.push({ kind: "template", text: "`", start, end: i });
    } else if (ch === "/" && regexAllowed()) {
      const start = i++;
      let inClass = false;
      while (i < to && (code[i] !== "/" || inClass) && code[i] !== "\n") {
        if (code[i] === "\\") i++;
        else if (code[i] === "[") inClass = true;
        else if (code[i] === "]") inClass = false;
        i++;
      }
      i = Math.min(i + 1, to);
      while (i < to && ID_PART.test(code[i])) i++;
      out.push({ kind: "regex", text: code.slice(start, i), start, end: i });
    } else if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(code[i + 1] ?? ""))) {
      const start = i;
      const m = /^(?:0[xXoObB][\w]+|(?:\d[\d_]*)?\.?[\d_]*(?:[eE][+-]?\d+)?n?)/.exec(
        code.slice(i, to),
      );
      i += Math.max(1, m?.[0].length ?? 1);
      out.push({ kind: "number", text: code.slice(start, i), start, end: i });
    } else if (ID_START.test(ch) || (ch === "#" && ID_START.test(code[i + 1] ?? ""))) {
      const start = i++;
      while (i < to && ID_PART.test(code[i])) i++;
      out.push({
        kind: ch === "#" ? "private" : "name",
        text: code.slice(start, i),
        start,
        end: i,
      });
    } else {
      const p = PUNCTUATORS.find((op) => code.startsWith(op, i)) ?? ch;
      const text = p === "?." && /[0-9]/.test(code[i + 2] ?? "") ? "?" : p;
      out.push({ kind: "punct", text, start: i, end: i + text.length });
      i += text.length;
    }
  }
}

function isPropertyName(toks: readonly Tok[], i: number): boolean {
  const before = toks[i - 1];
  return before?.kind === "punct" && (before.text === "." || before.text === "?.");
}

type Brace = "object" | "block" | "template" | "paren" | "bracket";

function braceKind(toks: readonly Tok[], i: number): Brace {
  const p = toks[i - 1];
  if (p === undefined) return "block";
  if (p.kind === "name") {
    if (isPropertyName(toks, i - 1)) return "block";
    if (BLOCK_HEAD_KEYWORDS.has(p.text)) return "block";
    if (OPERATOR_KEYWORDS.has(p.text) || DECLARATION_KEYWORDS.has(p.text)) return "object";
    return "block";
  }
  if (p.kind !== "punct") return "block";
  if (p.text === ")" || p.text === "=>" || p.text === "{" || p.text === "}" || p.text === ";") {
    return "block";
  }
  return "object";
}

export function camelize(parts: readonly string[]): string {
  return (
    parts[0] +
    parts
      .slice(1)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("")
  );
}

export function rewriteHyphenNames(code: string, options: HyphenOptions): HyphenResult {
  const toks: Tok[] = [];
  tokenizeJs(code, 0, code.length, toks);
  const issues: HyphenIssue[] = [];
  const replacements: { start: number; end: number; text: string }[] = [];
  const issue = (code_: HyphenIssue["code"], start: number, end: number, message: string): void => {
    issues.push({ offset: start, length: end - start, code: code_, message });
  };

  const stack: Brace[] = [];
  const closedObject = new Set<number>();
  const kinds = new Map<number, Brace>();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== "punct") continue;
    if (t.text === "{") stack.push(braceKind(toks, i));
    else if (t.text === "${") stack.push("template");
    else if (t.text === "(") stack.push("paren");
    else if (t.text === "[") stack.push("bracket");
    else if (t.text === "}" || t.text === "}$" || t.text === ")" || t.text === "]") {
      if (stack.pop() === "object") closedObject.add(i);
      continue;
    } else continue;
    kinds.set(i, stack[stack.length - 1]);
  }
  const enclosing: (number | undefined)[] = [];
  {
    const open: number[] = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const closes =
        t.kind === "punct" &&
        (t.text === "}" || t.text === "}$" || t.text === ")" || t.text === "]");
      if (closes) open.pop();
      enclosing[i] = open[open.length - 1];
      if (kinds.has(i)) open.push(i);
    }
  }

  const isOperand = (i: number): boolean => {
    const t = toks[i];
    if (t === undefined) return false;
    if (t.kind === "name") return !OPERATOR_KEYWORDS.has(t.text) || isPropertyName(toks, i);
    if (t.kind !== "punct") return true;
    if (t.text === ")" || t.text === "]" || t.text === "++" || t.text === "--") return true;
    return t.text === "}" && closedObject.has(i);
  };
  const isKeyPosition = (i: number): boolean => {
    const open = enclosing[i];
    if (open === undefined || kinds.get(open) !== "object") return false;
    const p = toks[i - 1];
    return p.kind === "punct" && (i - 1 === open || p.text === ",");
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== "punct") continue;
    if (t.text === "--") {
      const l = toks[i - 1];
      const r = toks[i + 1];
      if (l?.kind === "name" && r?.kind === "name" && l.end === t.start && r.start === t.end) {
        issue(
          "consecutive-hyphens",
          l.start,
          r.end,
          `\`${l.text}--${r.text}\`: a name cannot contain consecutive hyphens`,
        );
      }
      continue;
    }
    if (t.text !== "-" || !isOperand(i - 1)) continue;
    const l = toks[i - 1];
    const r = toks[i + 1];
    const spaceL = l.end < t.start;
    const spaceR = r === undefined || r.start > t.end;
    if (spaceL && spaceR) continue;
    if (spaceL !== spaceR) {
      issue(
        "one-sided",
        t.start,
        t.end,
        "whitespace on only one side of `-`: write `a - b` to subtract or `a-b` for one name",
      );
      continue;
    }
    if (l.kind === "private") {
      issue("private-name", l.start, r.end, "a #private name cannot be hyphenated");
      continue;
    }
    if (l.kind !== "name" || (r.kind !== "name" && r.kind !== "number")) {
      issue("unspaced-minus", t.start, t.end, "subtraction needs a space on both sides of `-`");
      continue;
    }

    let j = i;
    let bad: HyphenIssue["code"] | null = null;
    while (
      toks[j]?.kind === "punct" &&
      toks[j].text === "-" &&
      toks[j].start === toks[j - 1].end &&
      toks[j + 1] !== undefined &&
      toks[j + 1].start === toks[j].end &&
      (toks[j + 1].kind === "name" || toks[j + 1].kind === "number")
    ) {
      if (toks[j + 1].kind === "number") bad = "digit-segment";
      j += 2;
    }
    const first = i - 1;
    const last = j - 1;
    const src = code.slice(toks[first].start, toks[last].end);
    i = last;
    if (bad !== null) {
      issue(
        bad,
        toks[first].start,
        toks[last].end,
        `\`${src}\`: a name segment cannot start with a digit; write \`a - 1\` to subtract`,
      );
      continue;
    }
    const parts = src.split("-");
    const camel = camelize(parts);
    const quoted = JSON.stringify(src);
    const after = toks[last + 1];
    const afterText = after?.kind === "punct" ? after.text : "";
    const dot = toks[first - 1];
    let text: string;
    let start = toks[first].start;
    if (isPropertyName(toks, first)) {
      if (options.resolve === "alias") text = camel;
      else {
        start = dot.start;
        text = dot.text === "?." ? `?.[${quoted}]` : `[${quoted}]`;
      }
    } else if (isKeyPosition(first)) {
      if (options.resolve === "alias") text = camel;
      else if (afterText === ":" || afterText === "(") text = quoted;
      else text = `${quoted}: ${camel}`;
    } else if (options.positions === "identifier") {
      text = camel;
    } else {
      issue(
        "bare-name",
        toks[first].start,
        toks[last].end,
        `\`${src}\`: a hyphenated name is only allowed as a property name; write \`${parts.join(" - ")}\` to subtract`,
      );
      continue;
    }
    replacements.push({ start, end: toks[last].end, text });
  }

  let out = "";
  let at = 0;
  const edits: HyphenEdit[] = [];
  for (const r of replacements) {
    out += code.slice(at, r.start);
    edits.push({
      srcStart: r.start,
      srcEnd: r.end,
      genStart: out.length,
      genEnd: out.length + r.text.length,
    });
    out += r.text;
    at = r.end;
  }
  out += code.slice(at);
  return { code: out, edits, issues };
}

export function sourceOffset(edits: readonly HyphenEdit[], genOffset: number): number {
  let delta = 0;
  for (const e of edits) {
    if (genOffset < e.genStart) break;
    if (genOffset < e.genEnd) return e.srcStart;
    delta = e.srcEnd - e.genEnd;
  }
  return genOffset + delta;
}
