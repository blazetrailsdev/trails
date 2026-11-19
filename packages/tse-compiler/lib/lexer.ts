export type TokenKind =
  | "text"
  | "code"
  | "expr"
  | "blockExpr"
  | "rawExpr"
  | "comment"
  | "typesMagic";

const BLOCK_EXPR_RE = /((\s|\))do|\{)(\s*\|[^|]*\|)?\s*$/;
export interface Token {
  kind: TokenKind;
  value: string;
  srcLine: number;
  srcCol?: number;
}
export class TseSyntaxError extends Error {}

const TAG_RE = /<%!([\s\S]*?)!%>|<%(==|=|-|#|%)?([\s\S]*?)([-=])?%>([ \t]*\r?\n)?/g;
const ERB_TAG_RE = /<%!([\s\S]*?)!%>|<%%|<%(==|=|-|#)?((?:%%>|[\s\S])*?)([-=])?%>([ \t]*\r?\n)?/g;
const KIND: Record<string, TokenKind> = { "=": "expr", "==": "rawExpr", "#": "comment" };

function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function lineAt(lineStarts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lineStarts[mid] <= offset) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

const text = (value: string, srcLine: number): Token => ({
  kind: "text",
  value,
  srcLine,
});

export function tokenize(
  source: string,
  trim = true,
  erb = false,
  trimMode: string | null = null,
): Token[] {
  if (trimMode === "-") return tokenizeExplicitTrim(source);
  const tokens: Token[] = [];
  const starts = buildLineStarts(source);
  const line = (offset: number): number => lineAt(starts, offset);
  let buf = "";
  let last = 0;
  let bufStartOffset = 0;
  let isBol = true;
  const flush = (): void => {
    if (buf.length > 0) tokens.push(text(buf, line(bufStartOffset)));
    buf = "";
  };

  for (const m of source.matchAll(erb ? ERB_TAG_RE : TAG_RE)) {
    if (buf.length === 0) bufStartOffset = last;
    buf += source.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      flush();
      tokens.push({
        kind: "typesMagic",
        value: m[1],
        srcLine: line(m.index),
      });
      isBol = false;
    } else if (m[0] === "<%%") {
      buf += "<%";
      isBol = false;
      continue;
    } else {
      const tailch = m[4];
      let rspace: string | undefined = m[5];
      const baseKind = KIND[m[2] ?? ""] ?? "code";
      const kind: TokenKind =
        baseKind === "expr" && BLOCK_EXPR_RE.test(m[3] ?? "") ? "blockExpr" : baseKind;
      const isExpression = baseKind === "expr" || baseKind === "rawExpr";
      let lspace: string | undefined;
      if (!isExpression) {
        if (buf.length === 0) {
          if (isBol) lspace = "";
        } else if (buf.endsWith("\n")) {
          lspace = "";
        } else {
          const rindex = buf.lastIndexOf("\n");
          const s = rindex === -1 ? buf : buf.slice(rindex + 1);
          if ((rindex !== -1 || isBol) && /^[ \t]*$/.test(s)) {
            lspace = s;
            buf = buf.slice(0, buf.length - s.length);
          }
        }
      }
      isBol = rspace !== undefined;
      if (m[2] === "%") {
        buf += `${lspace ?? ""}<%${m[3]}${tailch ?? ""}%>${rspace ?? ""}`;
        continue;
      }
      const trimmed = !isExpression && trim && lspace !== undefined && rspace !== undefined;
      if (!trimmed && lspace !== undefined) buf += lspace;
      flush();
      tokens.push({
        kind,
        value: erb ? m[3].replaceAll("%%>", "%>") : m[3],
        srcLine: line(m.index),
        srcCol: m.index + 2 + (m[2]?.length ?? 0) - starts[line(m.index)],
      });
      if (isExpression && tailch !== undefined) rspace = undefined;
      if (!trimmed && rspace !== undefined) {
        bufStartOffset = last - rspace.length;
        buf += rspace;
        continue;
      }
    }
    if (buf.length === 0) bufStartOffset = last;
  }
  buf += source.slice(last);
  flush();

  return tokens;
}

const EXPLICIT_TRIM_TAG_RE =
  /<%!([\s\S]*?)!%>|<%%|(^[ \t]*)?<%(?!%)(-)?(==|=|#)?((?:%%>|[\s\S])*?)(-)?%>(\r?\n)?/gm;

/**
 * ERB's `trim_mode: "-"`, `ERB::Compiler::TrimScanner#explicit_trim_line`
 * (`vendor/ruby/v3.3.11/lib/erb/compiler.rb:204-220`): `<%-` at the head of a
 * line drops the indentation before it, `-%>` followed by a newline drops the
 * newline, and every other tag keeps its surrounding whitespace.
 */
function tokenizeExplicitTrim(source: string): Token[] {
  const tokens: Token[] = [];
  const starts = buildLineStarts(source);
  const line = (offset: number): number => lineAt(starts, offset);
  let buf = "";
  let last = 0;
  let bufStartOffset = 0;
  const flush = (): void => {
    if (buf.length > 0) tokens.push(text(buf, line(bufStartOffset)));
    buf = "";
  };

  for (const m of source.matchAll(EXPLICIT_TRIM_TAG_RE)) {
    if (buf.length === 0) bufStartOffset = last;
    buf += source.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      flush();
      tokens.push({ kind: "typesMagic", value: m[1], srcLine: line(m.index) });
      continue;
    }
    if (m[0] === "<%%") {
      buf += "<%";
      continue;
    }
    const indent = m[2] ?? "";
    if (m[3] === undefined) buf += indent;
    const tagOffset = m.index + indent.length;
    const baseKind = KIND[m[4] ?? ""] ?? "code";
    const kind: TokenKind =
      baseKind === "expr" && BLOCK_EXPR_RE.test(m[5]) ? "blockExpr" : baseKind;
    flush();
    tokens.push({
      kind,
      value: m[5].replaceAll("%%>", "%>"),
      srcLine: line(tagOffset),
      srcCol: tagOffset + 2 + (m[3]?.length ?? 0) + (m[4]?.length ?? 0) - starts[line(tagOffset)],
    });
    if (m[7] !== undefined && m[6] === undefined) {
      bufStartOffset = last - m[7].length;
      buf += m[7];
    }
  }
  buf += source.slice(last);
  flush();

  return tokens;
}
