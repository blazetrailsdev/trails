/** TSE lexer. Rails analogue: the `erubi` gem scanner. Single divergence:
 * `<%! ... !%>` magic blocks for TS-only type annotations (plan §2.10.1). */

export type TokenKind = "text" | "code" | "expr" | "rawExpr" | "comment" | "typesMagic";
export interface Token {
  kind: TokenKind;
  value: string;
  trimLeft: boolean;
  trimRight: boolean;
}
export class TseSyntaxError extends Error {}

const TAG_RE = /<%%|%%>|<%!([\s\S]*?)!%>|<%(-)?(==|=|#)?([\s\S]*?)(-)?%>/g;
const KIND: Record<string, TokenKind> = { "=": "expr", "==": "rawExpr", "#": "comment" };
const text = (value: string): Token => ({ kind: "text", value, trimLeft: false, trimRight: false });

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let buf = "";
  let last = 0;
  const flush = (): void => {
    if (buf.length > 0) tokens.push(text(buf));
    buf = "";
  };

  for (const m of source.matchAll(TAG_RE)) {
    buf += source.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[0] === "<%%") buf += "<%";
    else if (m[0] === "%%>") buf += "%>";
    else if (m[1] !== undefined) {
      flush();
      tokens.push({ kind: "typesMagic", value: m[1], trimLeft: false, trimRight: false });
    } else {
      const trimLeft = m[2] === "-";
      const trimRight = m[5] === "-";
      if (trimLeft) buf = buf.replace(/[ \t]*$/, "");
      flush();
      tokens.push({ kind: KIND[m[3] ?? ""] ?? "code", value: m[4], trimLeft, trimRight });
      if (trimRight) last += (/^[ \t]*\r?\n/.exec(source.slice(last))?.[0] ?? "").length;
    }
  }
  buf += source.slice(last);
  flush();

  if (/<%/.test(source.replace(TAG_RE, ""))) throw new TseSyntaxError("unterminated TSE tag");
  return tokens;
}
