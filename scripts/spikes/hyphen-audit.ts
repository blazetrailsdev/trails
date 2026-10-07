// SPIKE (do not merge): measures what the hyphen-name whitespace rule would
// reinterpret or reject in existing code. See docs/spikes/hyphen-case-properties.md.
//
//   pnpm tsx scripts/spikes/hyphen-audit.ts [extra-tse-root ...]
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript-5";
import prettier from "prettier";
import { parse } from "../../packages/tse-compiler/src/parser.js";
import { rewriteHyphenNames } from "../../packages/tse-compiler/src/hyphen-names.js";

type Category =
  | "unspaced name-name, property position (silently becomes one name)"
  | "unspaced name-name, bare identifiers (error; one name in full-identifier mode)"
  | "unspaced name-digit (error: digit segment)"
  | "unspaced, other operands (error: needs spaces)"
  | "one-sided spacing (error)";

interface Hit {
  file: string;
  line: number;
  text: string;
  category: Category;
}

const isTest = (f: string): boolean =>
  /\.test\.[cm]?[jt]sx?$|\/test-helpers\/|\/dx-tests\/|\/__fixtures__\/|\/fixtures\/|\/__tests__\//.test(
    f,
  );

function lastLeaf(node: ts.Node, sf: ts.SourceFile): ts.Node {
  let n = node;
  for (;;) {
    const t = n.getLastToken(sf);
    if (t === undefined || t === n) return n;
    n = t;
  }
}
function firstLeaf(node: ts.Node, sf: ts.SourceFile): ts.Node {
  let n = node;
  for (;;) {
    const t = n.getFirstToken(sf);
    if (t === undefined || t === n) return n;
    n = t;
  }
}
const isNameLike = (n: ts.Node): boolean =>
  ts.isIdentifier(n) ||
  (n.kind >= ts.SyntaxKind.FirstKeyword && n.kind <= ts.SyntaxKind.LastKeyword);

const tsHits: Hit[] = [];
let inlineTemplates = 0;
let inlineTags = 0;
const inlineHits: TseHit[] = [];
let tsFiles = 0;
let tsMinus = 0;
let tsMappedMinus = 0;
let tsParseErrors = 0;

function auditTs(file: string): void {
  const text = readFileSync(file, "utf8");
  const kind = /\.[cm]?tsx$|\.jsx$/.test(file) ? ts.ScriptKind.TSX : undefined;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, kind);
  tsFiles++;
  if ((sf as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length > 0) {
    tsParseErrors++;
  }
  const visit = (node: ts.Node): void => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      /<%[\s\S]*%>/.test(node.text)
    ) {
      inlineTemplates++;
      const { hits, tags } = auditTseSource(node.text, file);
      inlineTags += tags;
      inlineHits.push(...hits);
    }
    if (ts.isMappedTypeNode(node)) {
      if (node.readonlyToken?.kind === ts.SyntaxKind.MinusToken) tsMappedMinus++;
      if (node.questionToken?.kind === ts.SyntaxKind.MinusToken) tsMappedMinus++;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.MinusToken) {
      tsMinus++;
      const op = node.operatorToken;
      const spaceL = op.getStart(sf) > node.left.end;
      const spaceR = node.right.getStart(sf) > op.end;
      if (!(spaceL && spaceR)) {
        const l = lastLeaf(node.left, sf);
        const r = firstLeaf(node.right, sf);
        let category: Category;
        if (spaceL !== spaceR) category = "one-sided spacing (error)";
        else if (isNameLike(l) && isNameLike(r)) {
          category =
            ts.isPropertyAccessExpression(l.parent) && l.parent.name === l
              ? "unspaced name-name, property position (silently becomes one name)"
              : "unspaced name-name, bare identifiers (error; one name in full-identifier mode)";
        } else if (isNameLike(l) && ts.isNumericLiteral(r)) {
          category = "unspaced name-digit (error: digit segment)";
        } else category = "unspaced, other operands (error: needs spaces)";
        const { line } = sf.getLineAndCharacterOfPosition(op.getStart(sf));
        tsHits.push({
          file,
          line: line + 1,
          text: text.slice(node.getStart(sf), node.end).replace(/\s+/g, " ").slice(0, 80),
          category,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "vendor") continue;
    const full = path.join(dir, e);
    const stat = statSync(full, { throwIfNoEntry: false });
    if (stat === undefined) continue;
    if (stat.isDirectory()) walk(full, out);
    else if (e.endsWith(".tse")) out.push(full);
  }
}

interface TseHit {
  file: string;
  line: number;
  code: string;
  kind: string;
}
function auditTseSource(source: string, file: string): { hits: TseHit[]; tags: number } {
  const hits: TseHit[] = [];
  let tags = 0;
  let nodes;
  try {
    nodes = parse(source).nodes;
  } catch {
    return { hits, tags: -1 };
  }
  for (const node of nodes) {
    if (node.kind === "text") continue;
    tags++;
    const at = { file, line: node.srcLine + 1, code: node.value.trim() };
    const strict = rewriteHyphenNames(node.value, { resolve: "literal", positions: "property" });
    const full = rewriteHyphenNames(node.value, { resolve: "alias", positions: "identifier" });
    for (const i of strict.issues) hits.push({ ...at, kind: `error:${i.code}` });
    for (let k = 0; k < strict.edits.length; k++) hits.push({ ...at, kind: "silent:property" });
    for (let k = strict.edits.length; k < full.edits.length; k++) {
      hits.push({ ...at, kind: "silent:identifier-mode-only" });
    }
  }
  return { hits, tags };
}
function auditTse(files: string[]): { hits: TseHit[]; tags: number; errors: number } {
  const hits: TseHit[] = [];
  let tags = 0;
  let errors = 0;
  for (const file of files) {
    const r = auditTseSource(readFileSync(file, "utf8"), file);
    if (r.tags === -1) errors++;
    else tags += r.tags;
    hits.push(...r.hits);
  }
  return { hits, tags, errors };
}

async function main(): Promise<void> {
  const tracked = execFileSync(
    "git",
    ["ls-files", "*.ts", "*.tsx", "*.mts", "*.cts", "*.js", "*.mjs", "*.cjs", "*.jsx"],
    { encoding: "utf8", maxBuffer: 1 << 28 },
  )
    .split("\n")
    .filter((f) => f !== "" && !f.startsWith("vendor/"));
  for (const f of process.env.HYPHEN_AUDIT_ONLY?.split(",") ?? tracked) auditTs(f);

  console.log(`## .ts/.js: ${tsFiles} tracked files, ${tsMinus} binary-minus expressions`);
  console.log(`files with parse diagnostics: ${tsParseErrors}`);
  console.log(`mapped-type \`-?\` / \`-readonly\` modifiers: ${tsMappedMinus}`);
  const rows = new Map<string, number>();
  for (const h of tsHits) {
    const info = await prettier.getFileInfo(h.file, { ignorePath: ".prettierignore" });
    const key = [
      h.category,
      isTest(h.file) ? "test" : "source",
      /\.[cm]?tsx?$/.test(h.file) ? "ts" : "js",
      info.ignored ? "prettier-ignored" : "prettier-formatted",
    ].join(" | ");
    rows.set(key, (rows.get(key) ?? 0) + 1);
    console.log(`  ${h.file}:${h.line}  [${key}]  ${h.text}`);
  }
  console.log("\ncategory | test? | lang | prettier | count");
  for (const [k, v] of [...rows].sort()) console.log(`${k} | ${v}`);
  console.log(`total sites the rule touches: ${tsHits.length} of ${tsMinus}`);

  console.log(
    `\n## inline templates in .ts string literals: ${inlineTemplates} strings, ${inlineTags} code tags`,
  );
  const inlineCounts = new Map<string, number>();
  for (const h of inlineHits) {
    inlineCounts.set(h.kind, (inlineCounts.get(h.kind) ?? 0) + 1);
    console.log(`  ${h.file}  [${h.kind}]  ${h.code.slice(0, 80)}`);
  }
  for (const [k, v] of [...inlineCounts].sort()) console.log(`${k} | ${v}`);

  const roots: [string, string[]][] = [["this repo", []]];
  walk(".", roots[0][1]);
  for (const extra of process.argv.slice(2)) {
    const files: string[] = [];
    walk(extra, files);
    roots.push([extra, files]);
  }
  for (const [name, files] of roots) {
    for (const [label, subset] of [
      ["test/fixture", files.filter(isTest)],
      ["non-test", files.filter((f) => !isTest(f))],
    ] as const) {
      const { hits, tags, errors } = auditTse(subset);
      console.log(
        `\n## .tse (${name}, ${label}): ${subset.length} files, ${tags} code tags, ${errors} unparseable`,
      );
      const counts = new Map<string, number>();
      for (const h of hits) {
        counts.set(h.kind, (counts.get(h.kind) ?? 0) + 1);
        console.log(`  ${h.file}:${h.line}  [${h.kind}]  ${h.code.slice(0, 80)}`);
      }
      for (const [k, v] of [...counts].sort()) console.log(`${k} | ${v}`);
      if (counts.size === 0) console.log("no sites");
    }
  }
}
void main();
