/**
 * receipt-audit — the receipts no gate examines (RFC 0130).
 *
 * `parity:api:extra:gate` judges a `@noRailsEquivalent` receipt only where it
 * reaches the scorer, and `gateRedundant` only a WRITTEN per-name tag a
 * same-file allowed set covers. Three populations fall between them:
 *
 *  1. **Covering nothing.** The scorer checks the tag BEFORE the interface kind
 *     exemption (`collectInterfaceOnlyNames`), so a receipt on an exempt name
 *     always "matches"; and an interface tag's inherited member entries are
 *     never judged redundant. {@link receiptsCoveringNothing} strips every
 *     receipt from the manifest in memory, re-scores, and reports each one whose
 *     name is allowed or exempt without it.
 *  2. **Unverifiable.** A tag on a declaration the extractor does not surface —
 *     a module-private function, a type alias, a local, a class member marked
 *     `private`, a file outside the extracted tree — never reaches
 *     `collectTaggedEntries`, so it is neither matched, stale nor redundant.
 *     {@link unverifiableReceipts} reads the source and reports it per
 *     file:line.
 *  3. **Suppressing no call flag.** `staleCallTags` (compare.ts) skips a
 *     `@missingRailsCall` / `@missingRailsArgs` tag on a pair nothing compared.
 *     compare.ts now writes those as `uncomparedTags` beside `staleTags`; both
 *     are listed here.
 *
 * Report-only: the populations are not yet burnt down, so a gate would be red
 * on arrival. Requires `pnpm parity:api --calls` to have written the artifacts.
 */
import * as fsp from "fs/promises";
import * as path from "path";
import type { ApiManifest, MethodInfo } from "@blazetrails/parity/types";
import { OUTPUT_DIR, packageSrcDir } from "./config.js";
import {
  FILE_TAG_NAME,
  allowKeyOf,
  buildReport,
  collectTaggedEntries,
  type TaggedEntry,
} from "./extra-surface.js";
import { classifyReason } from "./missing-rails-call-tags.js";

/** The manifest with every `@noRailsEquivalent` receipt removed. */
export function stripReceipts(ts: ApiManifest): ApiManifest {
  const out = structuredClone(ts);
  const strip = (m: MethodInfo): void => {
    delete m.noRailsEquivalent;
    delete m.noRailsEquivalentInherited;
  };
  for (const pkg of Object.values(out.packages)) {
    delete pkg.fileNoRailsEquivalent;
    for (const c of [...Object.values(pkg.classes), ...Object.values(pkg.modules)]) {
      delete c.noRailsEquivalent;
      for (const m of [...c.instanceMethods, ...c.classMethods]) strip(m);
    }
    for (const fns of Object.values(pkg.fileFunctions ?? {})) for (const m of fns) strip(m);
  }
  return out;
}

/**
 * Every receipt the scorer reached — written or inherited from a tagged
 * interface — whose name is NOT extra surface once all receipts are stripped.
 * A file-level tag covers something while its file has any extra left.
 */
export function receiptsCoveringNothing(
  ruby: ApiManifest,
  ts: ApiManifest,
  filterPkg: string | null,
): TaggedEntry[] {
  const opts = { filterPkg, excludeGlobs: [], novelOnly: false, topN: 0 };
  const { tagged } = buildReport(ruby, ts, opts);
  const stripped = buildReport(ruby, stripReceipts(ts), opts);
  const extras = new Set<string>();
  for (const f of stripped.packages.flatMap((p) => p.extraFiles)) {
    extras.add(allowKeyOf({ package: f.package, tsFile: f.tsFile, name: FILE_TAG_NAME }));
    for (const e of f.extras) {
      extras.add(allowKeyOf({ package: f.package, tsFile: f.tsFile, name: e.name }));
    }
  }
  return tagged.scored.filter((e) => !extras.has(allowKeyOf(e)));
}

export interface SourceFile {
  package: string;
  /** Relative to the package's extracted source root, as the manifest keys it. */
  file: string;
  text: string;
}

export interface UnverifiableReceipt {
  package: string;
  file: string;
  /** 1-based line of the declaration the JSDoc block sits on. */
  line: number;
  /** The declared identifier, or `null` when none could be read off the line. */
  name: string | null;
  reason: string;
}

const JSDOC = /\/\*\*[\s\S]*?\*\//g;
const RECEIPT = /(?:^|\s)@noRailsEquivalent\b([^@]*)/;
const DECLARED_NAME =
  /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:(?:abstract|public|private|protected|static|readonly|override|async|accessor|get|set)\s+)*(?:(?:class|interface|namespace|module|function\*?|const|let|var|type|enum)\s+)?\*?\s*(#?[A-Za-z_$][\w$]*|\[[^\]]+\])/;

/**
 * Every `@noRailsEquivalent` written in `sources` whose declaration is not a
 * written entry in `collectTaggedEntries(ts)` for that file — the extractor
 * never harvested it, so no gate can judge it. A block opening the file is a
 * file-level tag when the manifest records one (`fileNoRailsEquivalent`).
 */
export function unverifiableReceipts(
  ts: ApiManifest,
  sources: readonly SourceFile[],
): UnverifiableReceipt[] {
  // Inherited entries count as harvested: a mixin property's copy of a written
  // tag (`noRailsEquivalentInherited`) can win the dedup over the written one.
  const harvested = new Set(collectTaggedEntries(ts).map(allowKeyOf));
  const out: UnverifiableReceipt[] = [];
  for (const src of sources) {
    for (const block of src.text.matchAll(JSDOC)) {
      const receipt = RECEIPT.exec(block[0].slice(3, -2).replace(/^\s*\*/gm, " "));
      if (receipt === null) continue;
      const end = block.index + block[0].length;
      const lines = src.text.slice(end).split("\n");
      let offset = 0;
      while (
        offset < lines.length &&
        /^\s*(?:$|\/\/|\/\*|\*(?:\s|\/|$)|@)/.test(lines[offset] ?? "")
      ) {
        offset++;
      }
      const decl = (lines[offset] ?? "").trim();
      const fileLevel =
        src.text.slice(0, block.index).trim() === "" &&
        (/^import\b/.test(decl) ||
          ts.packages[src.package]?.fileNoRailsEquivalent?.[src.file] !== undefined);
      const name = fileLevel ? FILE_TAG_NAME : (DECLARED_NAME.exec(decl)?.[1] ?? null);
      const key =
        name === null ? null : allowKeyOf({ package: src.package, tsFile: src.file, name });
      if (key !== null && harvested.has(key)) continue;
      out.push({
        package: src.package,
        file: src.file,
        line: src.text.slice(0, end).split("\n").length + offset,
        name: fileLevel ? null : name,
        reason: receipt[1].replace(/\s+/g, " ").trim(),
      });
    }
  }
  return out;
}

export interface UnsuppressingCallTag {
  package: string;
  tsFile: string;
  tsClass?: string;
  tsName: string;
  call: string;
}

export interface CallTagArtifact {
  staleTags?: UnsuppressingCallTag[];
  uncomparedTags?: UnsuppressingCallTag[];
}

/**
 * Every tag in a call artifact that suppressed no flag, whether or not its
 * pair was compared — `staleTags` (compared; already gated) and
 * `uncomparedTags` (never compared; gated by nothing).
 */
export function callTagsSuppressingNothing(
  artifact: CallTagArtifact,
  filterPkg: string | null,
): (UnsuppressingCallTag & { compared: boolean })[] {
  return [
    ...(artifact.staleTags ?? []).map((t) => ({ ...t, compared: true })),
    ...(artifact.uncomparedTags ?? []).map((t) => ({ ...t, compared: false })),
  ].filter((t) => filterPkg === null || t.package === filterPkg);
}

async function readSources(ts: ApiManifest, filterPkg: string | null): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for (const pkg of Object.keys(ts.packages)) {
    if (filterPkg !== null && pkg !== filterPkg) continue;
    const root = packageSrcDir(pkg);
    const entries = await fsp.readdir(root, { recursive: true }).catch(() => [] as string[]);
    for (const file of entries.sort()) {
      if (!file.endsWith(".ts") || file.endsWith(".d.ts") || file.endsWith(".test.ts")) continue;
      const rel = file.split(path.sep).join("/");
      out.push({
        package: pkg,
        file: rel,
        text: await fsp.readFile(path.join(root, file), "utf-8"),
      });
    }
  }
  return out;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fsp.readFile(path.join(OUTPUT_DIR, file), "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function main(argv: readonly string[]): Promise<void> {
  const pkgAt = argv.indexOf("--package");
  const filterPkg = pkgAt === -1 ? null : (argv[pkgAt + 1] ?? null);
  const ruby = await readJson<ApiManifest>("rails-api.json");
  const ts = await readJson<ApiManifest>("ts-api.json");
  if (ruby === null || ts === null) {
    console.error("Missing manifests. Run `pnpm parity:api --calls` first.");
    return;
  }
  const coveringNothing = receiptsCoveringNothing(ruby, ts, filterPkg);
  const unverifiable = unverifiableReceipts(ts, await readSources(ts, filterPkg));
  const [calls, args] = await Promise.all(
    ["call-mismatches.json", "call-arg-mismatches.json"].map(async (file) =>
      callTagsSuppressingNothing((await readJson<CallTagArtifact>(file)) ?? {}, filterPkg),
    ),
  );
  const claim = (reason: string): string => classifyReason(reason).toUpperCase();
  console.log(
    `\nReceipts covering nothing (allowed or exempt without the tag): ${coveringNothing.length}`,
  );
  for (const e of coveringNothing) {
    const what = e.fileLevel ? "(file-level tag)" : e.name;
    const via = e.inherited ? "  [inherited from interface]" : "";
    console.log(`  - ${e.package}  ${e.tsFile}  ${what}  ${claim(e.reason)}${via}`);
  }
  console.log(`\nReceipts on declarations the extractor does not surface: ${unverifiable.length}`);
  for (const r of unverifiable) {
    console.log(`  - ${r.package}  ${r.file}:${r.line}  ${r.name ?? "?"}  ${claim(r.reason)}`);
  }
  for (const [label, tags] of [
    ["@missingRailsCall", calls],
    ["@missingRailsArgs", args],
  ] as const) {
    console.log(`\n${label} receipts suppressing no flag: ${tags.length}`);
    for (const t of tags) {
      const where = t.compared ? "stale" : "uncompared";
      console.log(`  - ${t.package}  ${t.tsFile}  ${t.tsName}  ${t.call}  (${where})`);
    }
  }
}

if (path.basename(process.argv[1] ?? "") === "receipt-audit.ts") void main(process.argv.slice(2));
