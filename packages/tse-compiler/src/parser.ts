/** Builds a TseAst from the token stream. Lifts `<%# locals: (...) %>` and
 * `<%! types: ... !%>` magic comments onto the AST root — mirrors Rails'
 * `Template#strict_locals!` mutating source before Erubi compiles it. */

import { tokenize, TseSyntaxError } from "./lexer.js";

export type TseNode =
  | { kind: "text"; value: string; srcLine: number }
  | { kind: "code"; value: string; srcLine: number }
  | { kind: "expr"; value: string; srcLine: number }
  | { kind: "blockExpr"; value: string; srcLine: number }
  | { kind: "rawExpr"; value: string; srcLine: number };

export interface TseAst {
  nodes: TseNode[];
  localsSignature: string | null;
  typesAnnotation: string | null;
  /** Format override from `<%! format: "json" !%>`. Overrides filename-derived format. */
  formatAnnotation: string | null;
}

const LOCALS_RE = /^\s*locals:\s*\((.*)\)\s*$/s;
const FORMAT_RE = /^\s*format:\s*"([^"]+)"\s*$/;

export function parse(source: string): TseAst {
  const nodes: TseNode[] = [];
  let localsSignature: string | null = null;
  let typesAnnotation: string | null = null;
  let formatAnnotation: string | null = null;

  for (const tok of tokenize(source)) {
    if (tok.kind === "text") {
      if (tok.value.length > 0)
        nodes.push({ kind: "text", value: tok.value, srcLine: tok.srcLine });
    } else if (tok.kind === "comment") {
      const m = LOCALS_RE.exec(tok.value);
      if (m && localsSignature === null) localsSignature = m[1].trim() || "**nil";
    } else if (tok.kind === "typesMagic") {
      const typesMatch = /^\s*types:\s*/.exec(tok.value);
      const formatMatch = FORMAT_RE.exec(tok.value);
      if (formatMatch) {
        if (formatAnnotation === null) formatAnnotation = formatMatch[1]!;
      } else if (typesMatch) {
        if (typesAnnotation === null)
          typesAnnotation = tok.value.slice(typesMatch[0].length).trim();
      } else {
        throw new TseSyntaxError(`unknown <%! ... !%> directive: ${tok.value.trim()}`);
      }
    } else {
      nodes.push({ kind: tok.kind, value: tok.value.trim(), srcLine: tok.srcLine } as TseNode);
    }
  }
  return { nodes, localsSignature, typesAnnotation, formatAnnotation };
}
