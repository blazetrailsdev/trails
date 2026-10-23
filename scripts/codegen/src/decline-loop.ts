/**
 * Pass 8: the diagnostic decline loop. Typecheck the generated tree; for every
 * diagnostic, find the innermost statement containing it and replace that
 * statement with a `declined(site, "tsc-diagnostic", code)` marker; repeat until
 * the tree typechecks or no progress is made. A statement that declares a local
 * keeps the declaration (`let x: any = declined(...)`) so later uses still bind.
 *
 *   pnpm tsx scripts/codegen/src/decline-loop.ts <generated-out-dir> [--rounds 6]
 *
 * Prints, per round, the diagnostic count and statements declined, and writes
 * <dir>/decline-loop.json with the total and per-file counts.
 */
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GEN_DIR, ROOT } from "./gem.js";
import { promisify } from "node:util";
import * as ts from "typescript-5";

const run = promisify(execFile);
const TSC = path.join(ROOT, "node_modules/.bin/tsc");
const dir = path.resolve(process.argv[2] ?? GEN_DIR);
const ri = process.argv.indexOf("--rounds");
const rounds = ri >= 0 ? Number(process.argv[ri + 1]) : 6;

interface Diag {
  file: string;
  line: number;
  col: number;
  code: string;
}

async function diagnostics(): Promise<Diag[]> {
  let out = "";
  try {
    await run(TSC, ["-p", path.join(dir, "tsconfig.json")], { maxBuffer: 64 << 20, cwd: ROOT });
  } catch (e) {
    out = (e as { stdout?: string }).stdout ?? "";
  }
  const diags: Diag[] = [];
  for (const l of out.split("\n")) {
    const m = l.match(/^(.*?)\((\d+),(\d+)\): error (TS\d+)/);
    if (m) diags.push({ file: path.resolve(ROOT, m[1]), line: +m[2], col: +m[3], code: m[4] });
  }
  return diags;
}

/** Innermost statement (inside a block / source file) that contains `pos`. */
function statementAt(sf: ts.SourceFile, pos: number): ts.Statement | undefined {
  let best: ts.Statement | undefined;
  const visit = (n: ts.Node) => {
    if (pos < n.getStart(sf) || pos >= n.getEnd()) return;
    if (
      ts.isStatement(n) &&
      !ts.isBlock(n) &&
      (ts.isBlock(n.parent) ||
        ts.isSourceFile(n.parent) ||
        ts.isCaseClause(n.parent) ||
        ts.isDefaultClause(n.parent))
    ) {
      // Don't replace whole compound statements when an inner one contains it.
      best = n;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return best;
}

function replacement(stmt: ts.Statement, sf: ts.SourceFile, site: string, code: string): string {
  const call = `declined(${JSON.stringify(site)}, "tsc-diagnostic", ${JSON.stringify(code)})`;
  if (ts.isVariableStatement(stmt)) {
    const names = stmt.declarationList.declarations.flatMap((d) =>
      ts.isIdentifier(d.name)
        ? [d.name.text]
        : d.name.elements.flatMap((e) =>
            ts.isBindingElement(e) && ts.isIdentifier(e.name) ? [e.name.text] : [],
          ),
    );
    return `let ${names.map((n) => `${n}: any`).join(", ")};\n${names.length ? names.join(" = ") + " = " : ""}${call};`;
  }
  if (ts.isReturnStatement(stmt)) return `return ${call};`;
  if (ts.isClassDeclaration(stmt) || ts.isFunctionDeclaration(stmt) || ts.isImportDeclaration(stmt))
    return "";
  return `${call};`;
}

function declinedImport(file: string, outSrc: string): string {
  const rel = path
    .relative(path.dirname(file), path.join(outSrc, "codegen-declined.js"))
    .replace(/\\/g, "/");
  return `import { declined } from "${rel.startsWith(".") ? rel : "./" + rel}";\n`;
}

async function main() {
  const src = path.join(dir, "src");
  let total = 0;
  const perFile: Record<string, number> = {};
  const log: { round: number; diagnostics: number; declined: number }[] = [];
  for (let round = 1; round <= rounds; round++) {
    const diags = (await diagnostics()).filter((d) => d.file.startsWith(src));
    if (!diags.length) {
      log.push({ round, diagnostics: 0, declined: 0 });
      break;
    }
    const byFile = new Map<string, Diag[]>();
    for (const d of diags) byFile.set(d.file, [...(byFile.get(d.file) ?? []), d]);
    let declinedThisRound = 0;
    for (const [file, ds] of byFile) {
      const text = readFileSync(file, "utf8");
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const cands = new Map<number, { st: ts.Statement; d: Diag }>();
      for (const d of ds) {
        const pos = sf.getPositionOfLineAndCharacter(d.line - 1, Math.max(0, d.col - 1));
        const st = statementAt(sf, pos);
        if (st && !cands.has(st.getStart(sf))) cands.set(st.getStart(sf), { st, d });
      }
      // Innermost first; never two overlapping edits.
      const edits = new Map<number, { end: number; text: string }>();
      for (const { st, d } of [...cands.values()].sort(
        (a, b) => a.st.getWidth(sf) - b.st.getWidth(sf),
      )) {
        const site = `${path.relative(src, file)}:${d.line}`;
        const pos = sf.getPositionOfLineAndCharacter(d.line - 1, Math.max(0, d.col - 1));
        // An error in a compound statement's header declines only the header
        // expression, keeping the body.
        const header =
          ts.isIfStatement(st) ||
          ts.isWhileStatement(st) ||
          ts.isDoStatement(st) ||
          ts.isSwitchStatement(st)
            ? st.expression
            : ts.isForOfStatement(st) || ts.isForInStatement(st)
              ? st.expression
              : undefined;
        let s = st.getStart(sf);
        let e = st.getEnd();
        let txt = replacement(st, sf, site, d.code);
        if (header && pos >= header.getStart(sf) && pos < header.getEnd()) {
          s = header.getStart(sf);
          e = header.getEnd();
          txt = `declined(${JSON.stringify(site)}, "tsc-diagnostic", ${JSON.stringify(d.code)})`;
        }
        if ([...edits.entries()].some(([s2, x]) => s < x.end && s2 < e)) continue;
        edits.set(s, { end: e, text: txt });
      }
      if (!edits.size) continue;
      let out = text;
      for (const [start, e] of [...edits.entries()].sort((a, b) => b[0] - a[0]))
        out = out.slice(0, start) + e.text + out.slice(e.end);
      if (!/import \{ declined \}/.test(out)) out = declinedImport(file, src) + out;
      writeFileSync(file, out);
      declinedThisRound += edits.size;
      perFile[path.relative(src, file)] = (perFile[path.relative(src, file)] ?? 0) + edits.size;
    }
    total += declinedThisRound;
    log.push({ round, diagnostics: diags.length, declined: declinedThisRound });
    console.log(
      `round ${round}: ${diags.length} diagnostics → ${declinedThisRound} statements declined`,
    );
    if (!declinedThisRound) break;
  }
  const final = (await diagnostics()).filter((d) => d.file.startsWith(src)).length;
  const res = { totalDeclinedStatements: total, finalDiagnostics: final, rounds: log, perFile };
  writeFileSync(path.join(dir, "decline-loop.json"), JSON.stringify(res, null, 2));
  console.log(JSON.stringify({ totalDeclinedStatements: total, finalDiagnostics: final }));
}

void main();
