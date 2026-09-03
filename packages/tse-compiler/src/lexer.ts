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
  trimLeft: boolean;
  trimRight: boolean;
  srcLine: number;
}
export class TseSyntaxError extends Error {}

const TAG_RE = /<%%|%%>|<%!([\s\S]*?)!%>|<%(-)?(==|=|#)?([\s\S]*?)(-)?%>/g;
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
  trimLeft: false,
  trimRight: false,
  srcLine,
});

export function tokenize(source: string): Token[] {
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

  for (const m of source.matchAll(TAG_RE)) {
    if (buf.length === 0) bufStartOffset = last;
    buf += source.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[0] === "<%%") buf += "<%";
    else if (m[0] === "%%>") buf += "%>";
    else if (m[1] !== undefined) {
      flush();
      tokens.push({
        kind: "typesMagic",
        value: m[1],
        trimLeft: false,
        trimRight: false,
        srcLine: line(m.index),
      });
    } else {
      const trimLeft = m[2] === "-";
      const trimRight = m[5] === "-";
      if (trimLeft) buf = buf.replace(/[ \t]*$/, "");
      flush();
      const baseKind = KIND[m[3] ?? ""] ?? "code";
      const kind: TokenKind =
        baseKind === "expr" && BLOCK_EXPR_RE.test(m[4] ?? "") ? "blockExpr" : baseKind;
      tokens.push({ kind, value: m[4], trimLeft, trimRight, srcLine: line(m.index) });
      if (trimRight) last += (/^[ \t]*\r?\n/.exec(source.slice(last))?.[0] ?? "").length;
    }
    if (buf.length === 0) bufStartOffset = last;
  }
  buf += source.slice(last);
  flush();

  if (/<%/.test(source.replace(TAG_RE, ""))) throw new TseSyntaxError("unterminated TSE tag");
  return tokens;
}
