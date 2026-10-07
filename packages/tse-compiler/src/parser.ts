import { tokenize, TseSyntaxError } from "./lexer.js";
import {
  rewriteHyphenNames,
  type HyphenEdit,
  type HyphenIssue,
  type HyphenOptions,
} from "./hyphen-names.js";

export interface HyphenRewrite {
  source: string;
  edits: HyphenEdit[];
}

export type TseNode =
  | { kind: "text"; value: string; srcLine: number }
  | { kind: "code"; value: string; srcLine: number; srcCol?: number; hyphen?: HyphenRewrite }
  | { kind: "expr"; value: string; srcLine: number; srcCol?: number; hyphen?: HyphenRewrite }
  | { kind: "blockExpr"; value: string; srcLine: number; srcCol?: number; hyphen?: HyphenRewrite }
  | { kind: "rawExpr"; value: string; srcLine: number; srcCol?: number; hyphen?: HyphenRewrite };

export interface TseAst {
  nodes: TseNode[];
  localsSignature: string | null;
  typesAnnotation: string | null;
  formatAnnotation: string | null;
}

const LOCALS_RE = /^\s*locals:\s*\((.*)\)\s*$/s;
const FORMAT_RE = /^\s*format:\s*"([^"]+)"\s*$/;
const HYPHEN_RE = /^\s*hyphen-names:\s*(literal|alias|off)\s*$/;

export function hyphenPragma(source: string): HyphenOptions | null | undefined {
  const mode = /<%!\s*hyphen-names:\s*(literal|alias|off)\s*!%>/.exec(source)?.[1];
  if (mode === undefined) return undefined;
  return mode === "off" ? null : { resolve: mode as "literal" | "alias", positions: "property" };
}

function hyphenError(
  node: { value: string; srcLine: number; srcCol?: number },
  issue: HyphenIssue,
): TseSyntaxError {
  const before = node.value.slice(0, issue.offset).split("\n");
  const line = node.srcLine + before.length - 1;
  const col =
    before.length === 1 ? (node.srcCol ?? 0) + issue.offset : before[before.length - 1].length;
  const err = new TseSyntaxError(`${line + 1}:${col + 1}: ${issue.message}`);
  err.srcLine = line;
  err.srcCol = col;
  err.srcLength = issue.length;
  return err;
}

export function parse(source: string, trim = true, hyphenNames?: HyphenOptions | null): TseAst {
  const nodes: TseNode[] = [];
  let localsSignature: string | null = null;
  let typesAnnotation: string | null = null;
  let formatAnnotation: string | null = null;

  for (const tok of tokenize(source, trim)) {
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
      } else if (HYPHEN_RE.test(tok.value)) {
        const mode = HYPHEN_RE.exec(tok.value)![1];
        hyphenNames =
          mode === "off" ? null : { resolve: mode as "literal" | "alias", positions: "property" };
      } else if (typesMatch) {
        if (typesAnnotation === null)
          typesAnnotation = tok.value.slice(typesMatch[0].length).trim();
      } else {
        throw new TseSyntaxError(`unknown <%! ... !%> directive: ${tok.value.trim()}`);
      }
    } else {
      nodes.push({
        kind: tok.kind,
        value: tok.value,
        srcLine: tok.srcLine,
        srcCol: tok.srcCol,
      } as TseNode);
    }
  }
  if (hyphenNames != null) {
    for (const node of nodes) {
      if (node.kind === "text") continue;
      const result = rewriteHyphenNames(node.value, hyphenNames);
      if (result.issues.length > 0) throw hyphenError(node, result.issues[0]);
      if (result.edits.length === 0) continue;
      node.hyphen = { source: node.value, edits: result.edits };
      node.value = result.code;
    }
  }
  return { nodes, localsSignature, typesAnnotation, formatAnnotation };
}
