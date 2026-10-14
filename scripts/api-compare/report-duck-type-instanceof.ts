#!/usr/bin/env npx tsx
/**
 * Report-only (RFC 0156): a matched pair whose Rails body DUCK-types — asks
 * `respond_to?` or `acts_like?` — and whose port enumerates classes with
 * `instanceof` instead, so a value outside the list falls through uncast or
 * raises. `value.respond_to?(:to_date)` (`active_model/type/date.rb:39-48`)
 * ported as three `instanceof` checks is the shape.
 *
 *   pnpm parity:api:duck-types            # every row
 *
 * A row is a skeleton pair whose Ruby stream carries `ref:respond_to?` or
 * `ref:acts_like?`, whose TS body has an `instanceof` outside a `catch`
 * clause (a `catch`'s `instanceof` is Ruby's `rescue` arm, not a duck test)
 * and not against `Promise` (async plumbing), and whose TS stream — its
 * same-file helpers spliced in, the way the arms report forgives an extracted
 * helper — leaves one of them unported in kind: a `respond_to?` with no
 * `rbObjRespondTo`, or an `acts_like?` with no `actsLike`. `actsLike` takes
 * its receiver as `this`, and the stream spells `actsLike.call(x, "time")` as
 * a bare `ref:call`, so that form is read off the source, through the name the
 * file imports it under.
 *
 * The skeleton stream carries no `instanceof` token, so the TS half re-reads
 * the source: every declaration in `tsFile` named `tsName` is searched, which
 * over-reports only where one file declares the name on two classes.
 *
 * Report-only by the RFC 0113 tripwire: the first run's hand audit measured
 * this stratum below the ⅓-non-real bar a gate needs (see the PR that added
 * this file), so nothing gates and no mark is kept.
 *
 * Run `pnpm parity:api --calls` first so output/call-skeletons.json is fresh.
 */
import * as path from "path";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import ts from "typescript-5";
import { OUTPUT_DIR, ROOT_DIR, packageSrcDir } from "./config.js";
import { section, tally } from "./lint-call-mismatches.js";
import { spliceHelperSkeletons, type SkeletonArtifact, type SkeletonRow } from "./report-arms.js";

const DUCK_TESTS: ReadonlySet<string> = new Set(["ref:respond_to?", "ref:acts_like?"]);
const DUCK_PORT_OF: ReadonlyMap<string, string> = new Map([
  ["ref:respond_to?", "ref:rbObjRespondTo"],
  ["ref:acts_like?", "ref:actsLike"],
]);

export function asksDuckType(row: SkeletonRow): boolean {
  return row.ruby.some((token) => DUCK_TESTS.has(token));
}

/**
 * The duck tests the Rails body asks that the TS stream does not port in
 * kind: `respond_to?` by `rbObjRespondTo`, `acts_like?` by `actsLike`. A body
 * that asks both and ports one is still listed for the other.
 */
export function unportedDuckTests(row: SkeletonRow): string[] {
  const stream = new Set(spliceHelperSkeletons(row.ts, row.tsHelpers));
  return [...DUCK_PORT_OF]
    .filter(([ask, port]) => row.ruby.includes(ask) && !stream.has(port))
    .map(([ask]) => ask);
}

function declarationName(node: ts.Node): string | undefined {
  if (
    ts.isMethodDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return node.name && !ts.isComputedPropertyName(node.name) ? node.name.getText() : undefined;
  }
  if (
    ts.isPropertyDeclaration(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isVariableDeclaration(node)
  ) {
    const init = node.initializer;
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
      return ts.isIdentifier(node.name) ? node.name.text : undefined;
    }
  }
  return undefined;
}

function hasGuardInstanceof(body: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found || ts.isCatchClause(n)) return;
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
      n.right.getText() !== "Promise"
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return found;
}

/** The local names `source` imports `actsLike` under, the bare name included. */
function actsLikeNames(file: ts.SourceFile): Set<string> {
  const names = new Set(["actsLike"]);
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === "actsLike") names.add(element.name.text);
    }
  }
  return names;
}

function callsActsLike(body: ts.Node, names: ReadonlySet<string>): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const target = ts.isPropertyAccessExpression(callee) ? callee.expression : callee;
      const dispatch = ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
      if (
        ts.isIdentifier(target) &&
        names.has(target.text) &&
        (dispatch === undefined || dispatch === "call" || dispatch === "apply")
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return found;
}

/**
 * Whether any declaration of `name` in `source` calls `actsLike`, under
 * whatever name the file imports it and through `.call` / `.apply`.
 */
export function declaresActsLikeCall(source: string, name: string): boolean {
  const file = ts.createSourceFile("x.ts", source, ts.ScriptTarget.Latest, true);
  const names = actsLikeNames(file);
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (declarationName(n) === name && callsActsLike(n, names)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(file);
  return found;
}

/** Whether any declaration of `name` in `source` guards with `instanceof`. */
export function declaresInstanceofGuard(source: string, name: string): boolean {
  const file = ts.createSourceFile("x.ts", source, ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (declarationName(n) === name && hasGuardInstanceof(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(file);
  return found;
}

export async function duckTypeRows(artifact: SkeletonArtifact): Promise<SkeletonRow[]> {
  const sources = new Map<string, Promise<string | undefined>>();
  const read = (file: string): Promise<string | undefined> => {
    let text = sources.get(file);
    if (text === undefined) {
      text = readFile(file, "utf8").catch(() => undefined);
      sources.set(file, text);
    }
    return text;
  };
  const rows: SkeletonRow[] = [];
  for (const row of artifact.skeletons) {
    const unported = unportedDuckTests(row);
    if (unported.length === 0) continue;
    const source = await read(path.join(packageSrcDir(row.package), row.tsFile));
    if (source === undefined || !declaresInstanceofGuard(source, row.tsName)) continue;
    if (
      unported.every((ask) => ask === "ref:acts_like?") &&
      declaresActsLikeCall(source, row.tsName)
    )
      continue;
    rows.push(row);
  }
  return rows;
}

export function renderReport(rows: readonly SkeletonRow[], compared: number): string {
  return [
    `duck-type instanceof report: ${rows.length} pair(s) of ${compared} whose Rails body asks ` +
      "`respond_to?` / `acts_like?` and whose port guards with `instanceof` instead" +
      " — report-only (RFC 0156)",
    section(
      "By package",
      tally(rows, (r) => r.package),
    ),
    section(
      "Pairs",
      rows.map((r): [string, number] => [
        `${r.package}/${r.tsFile}#${r.tsName}  <-  ${r.rubyFile}#${r.rubyName}`,
        r.ruby.filter((t) => DUCK_TESTS.has(t)).length,
      ]),
    ),
  ].join("\n");
}

async function main(): Promise<number> {
  const file = path.join(OUTPUT_DIR, "call-skeletons.json");
  let artifact: SkeletonArtifact;
  try {
    artifact = JSON.parse(await readFile(file, "utf8")) as SkeletonArtifact;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    console.error(
      `duck-type instanceof report: ${path.relative(ROOT_DIR, file)} is missing — ` +
        "run `pnpm parity:api --calls` first.",
    );
    return 2;
  }
  const compared = artifact.skeletons.filter(asksDuckType).length;
  console.log(renderReport(await duckTypeRows(artifact), compared));
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  process.exit(await main());
}

void runAsScript();
