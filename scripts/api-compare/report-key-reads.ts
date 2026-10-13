#!/usr/bin/env npx tsx
/**
 * Report-only (RFC 0190): a matched pair whose Rails body reads a literal
 * Symbol key off a named receiver (`options[:only_path]`) and whose port reads
 * no such key off that receiver.
 *
 *   pnpm parity:api:key-reads              # the per-package table and the rows
 *   pnpm parity:api:key-reads --all        # also the receiver-unread rows
 *
 * No call gate sees the read on either side: Ruby `h[k]` is an `:aref` node
 * and never enters `calls`, and both extractors spell it `ref:get` in the
 * skeleton, which no gate compares. `extract-key-reads.rb` is the Ruby half.
 * The TS half is {@link tsKeyReads}: `h.k`, `h["k"]`, `h[k]`, `hashAref(h, k)`,
 * `const { k } = h` and a ported `[]` member (`h.get("k")`) are all the read,
 * and a computed key answers every key on its receiver.
 *
 * A Ruby read lands in one of three buckets. `matched`: the port reads the key
 * off the same receiver. `key-unread`: the port reads other keys off that
 * receiver and not this one, which is the row the report lists.
 * `receiver-unread`: the port reads nothing off a receiver of that name, which
 * is a renamed local or a destructured parameter far more often than a dropped
 * read, so it is counted and listed only under `--all`.
 *
 * The population is the skeleton artifact's pairs. There is no gate and no
 * baseline. Run `pnpm parity:api --calls` first so call-skeletons.json is fresh.
 */
import * as path from "path";
import { execFile } from "child_process";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { promisify } from "util";
import ts from "typescript-5";
import { snakeToCamel } from "@blazetrails/parity/conventions";
import { libPathsManifest } from "../../vendor/sources.js";
import { OUTPUT_DIR, ROOT_DIR, SCRIPT_DIR, packageSrcDir } from "./config.js";
import { normalizeRubyKey } from "./options-keys.js";
import type { SkeletonArtifact, SkeletonRow } from "./report-arms.js";

/** `extract-key-reads.rb`: Ruby file → def name → `[receiver, key | null]`. */
export type RubyKeyReads = Record<string, Record<string, [string, string | null][]>>;

/** Function name → receiver → the keys read off it; `*` is a computed key. */
export type TsKeyReads = Map<string, Map<string, Set<string>>>;

export type Bucket = "matched" | "key-unread" | "receiver-unread";

export interface KeyReadRow {
  package: string;
  rubyFile: string;
  rubyName: string;
  tsFile: string;
  tsName: string;
  receiver: string;
  key: string;
  bucket: Bucket;
}

const ANY_KEY = "*";

const tsKey = (key: string) => snakeToCamel(key.replace(/^:/, ""));

function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

/**
 * `options`, `this.options`, `this._options` and `this.options()` are all
 * `options`, and `match.groups` is `match`: a MatchData named capture
 * (`match[:host]`) is read off the groups object.
 */
function receiverName(node: ts.Expression): string | undefined {
  let expr = unwrap(node);
  if (ts.isPropertyAccessExpression(expr) && expr.name.text === "groups") {
    expr = unwrap(expr.expression);
  }
  if (ts.isCallExpression(expr) && expr.arguments.length === 0) expr = unwrap(expr.expression);
  if (ts.isIdentifier(expr)) return expr.text.replace(/^_+/, "");
  if (ts.isPropertyAccessExpression(expr) && expr.expression.kind === ts.SyntaxKind.ThisKeyword) {
    return expr.name.text.replace(/^_+/, "");
  }
  return undefined;
}

function isWriteTarget(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    parent.left === node
  );
}

function functionName(node: ts.Node): string | undefined {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return node.name && !ts.isComputedPropertyName(node.name) ? node.name.text : undefined;
  }
  if (
    (ts.isVariableDeclaration(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isPropertyAssignment(node)) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
    !ts.isComputedPropertyName(node.name) &&
    !ts.isObjectBindingPattern(node.name) &&
    !ts.isArrayBindingPattern(node.name)
  ) {
    return node.name.text;
  }
  return undefined;
}

export function tsKeyReads(text: string, fileName = "file.ts"): TsKeyReads {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const out: TsKeyReads = new Map();
  const collect = (node: ts.Node, reads: Map<string, Set<string>>): void => {
    const add = (receiver: ts.Expression, key: string) => {
      const name = receiverName(receiver);
      if (name === undefined) return;
      if (!reads.has(name)) reads.set(name, new Set());
      reads.get(name)!.add(key === ANY_KEY ? key : tsKey(key));
    };
    const keyOf = (arg: ts.Expression | undefined) =>
      arg !== undefined && ts.isStringLiteralLike(arg) ? arg.text : ANY_KEY;
    if (ts.isPropertyAccessExpression(node) && !isWriteTarget(node)) {
      add(node.expression, node.name.text);
    } else if (ts.isElementAccessExpression(node) && !isWriteTarget(node)) {
      add(node.expression, keyOf(node.argumentExpression));
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "hashAref" &&
      node.arguments.length > 0
    ) {
      add(node.arguments[0], keyOf(node.arguments[1]));
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "get" &&
      node.arguments.length === 1
    ) {
      add(node.expression.expression, keyOf(node.arguments[0]));
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      for (const el of node.name.elements) {
        const name = el.propertyName ?? el.name;
        add(node.initializer, el.dotDotDotToken || !ts.isIdentifier(name) ? ANY_KEY : name.text);
      }
    }
    ts.forEachChild(node, (child) => collect(child, reads));
  };
  const visit = (node: ts.Node): void => {
    const name = functionName(node);
    if (name !== undefined) {
      if (!out.has(name)) out.set(name, new Map());
      collect(node, out.get(name)!);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** One row per distinct literal-Symbol `(receiver, key)` the Rails body reads. */
export function keyReadRows(
  row: SkeletonRow,
  ruby: readonly [string, string | null][],
  tsReads: Map<string, Set<string>>,
): KeyReadRow[] {
  const seen = new Set<string>();
  const rows: KeyReadRow[] = [];
  for (const [recv, sym] of ruby) {
    if (sym === null || seen.has(`${recv}\u0000${sym}`)) continue;
    seen.add(`${recv}\u0000${sym}`);
    const keys = tsReads.get(snakeToCamel(recv.replace(/^@/, "")).replace(/^_+/, ""));
    const key = tsKey(normalizeRubyKey(sym.replace(/\?$/, "")));
    const predicate = sym.endsWith("?") && keys?.has(`is${key[0].toUpperCase()}${key.slice(1)}`);
    const bucket: Bucket =
      keys === undefined
        ? "receiver-unread"
        : keys.has(ANY_KEY) || keys.has(key) || predicate
          ? "matched"
          : "key-unread";
    const { package: pkg, rubyFile, rubyName, tsFile, tsName } = row;
    rows.push({
      package: pkg,
      rubyFile,
      rubyName,
      tsFile,
      tsName,
      receiver: recv,
      key: sym,
      bucket,
    });
  }
  return rows;
}

export interface PackageTally {
  pairs: number;
  arefs: number;
  literal: number;
  matched: number;
  keyUnread: number;
  receiverUnread: number;
}

export function renderReport(
  rows: readonly KeyReadRow[],
  tallies: ReadonlyMap<string, PackageTally>,
  all: boolean,
): string {
  const head = ["package", "pairs", "arefs", "literal", "matched", "key-unread", "recv-unread"];
  const table = [...tallies]
    .filter(([, t]) => t.arefs > 0)
    .map(([pkg, t]) => [
      pkg,
      t.pairs,
      t.arefs,
      t.literal,
      t.matched,
      t.keyUnread,
      t.receiverUnread,
    ]);
  const line = (cells: readonly (string | number)[]) =>
    `  ${String(cells[0]).padEnd(16)}${cells
      .slice(1)
      .map((c) => String(c).padStart(12))
      .join("")}`;
  const listed = rows.filter((r) => r.bucket === "key-unread" || (all && r.bucket !== "matched"));
  return [
    "key-read report: Rails reads of a literal Symbol key off a named receiver, against the " +
      "port's reads off that receiver — report-only (RFC 0190)",
    "  pairs: matched pairs whose Rails body has a named-receiver `[]`; arefs: those reads;",
    "  literal: distinct (receiver, Symbol key) among them",
    line(head),
    ...table.map(line),
    `\nRows (${listed.length})`,
    ...listed.map(
      (r) =>
        `  ${r.bucket.padEnd(15)} ${r.package}/${r.tsFile}#${r.tsName}  <-  ` +
        `${r.rubyFile}#${r.rubyName}  ${r.receiver}[:${r.key}]`,
    ),
  ].join("\n");
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return undefined;
  }
}

async function main(argv: string[]): Promise<number> {
  const file = path.join(OUTPUT_DIR, "call-skeletons.json");
  const artifact = await readJson<SkeletonArtifact>(file);
  if (artifact === undefined) {
    console.error(
      `key-read report: ${path.relative(ROOT_DIR, file)} must exist — run \`pnpm parity:api --calls\` first.`,
    );
    return 2;
  }
  const libs = libPathsManifest();
  const roots = Object.fromEntries(
    artifact.packages.filter((pkg) => libs[pkg] !== undefined).map((pkg) => [pkg, libs[pkg]]),
  );
  const { stdout } = await promisify(execFile)(
    "ruby",
    [path.join(SCRIPT_DIR, "extract-key-reads.rb"), JSON.stringify(roots)],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  const ruby = JSON.parse(stdout) as Record<string, RubyKeyReads>;
  const tsFiles = new Map<string, TsKeyReads>();
  const rows: KeyReadRow[] = [];
  const tallies = new Map<string, PackageTally>();
  for (const row of artifact.skeletons) {
    const reads = ruby[row.package]?.[row.rubyFile]?.[row.rubyName];
    if (reads === undefined) continue;
    const tsPath = path.join(packageSrcDir(row.package), row.tsFile);
    if (!tsFiles.has(tsPath)) {
      const text = await readFile(tsPath, "utf8").catch(() => undefined);
      tsFiles.set(tsPath, text === undefined ? new Map() : tsKeyReads(text, tsPath));
    }
    const pairRows = keyReadRows(row, reads, tsFiles.get(tsPath)!.get(row.tsName) ?? new Map());
    rows.push(...pairRows);
    const t = tallies.get(row.package) ?? {
      pairs: 0,
      arefs: 0,
      literal: 0,
      matched: 0,
      keyUnread: 0,
      receiverUnread: 0,
    };
    t.pairs += 1;
    t.arefs += reads.length;
    t.literal += pairRows.length;
    t.matched += pairRows.filter((r) => r.bucket === "matched").length;
    t.keyUnread += pairRows.filter((r) => r.bucket === "key-unread").length;
    t.receiverUnread += pairRows.filter((r) => r.bucket === "receiver-unread").length;
    tallies.set(row.package, t);
  }
  console.log(renderReport(rows, tallies, argv.includes("--all")));
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  process.exit(await main(process.argv.slice(2)));
}

void runAsScript();
