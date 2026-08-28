#!/usr/bin/env npx tsx
/**
 * Extracts the public API surface from our TypeScript packages.
 * Uses the TypeScript Compiler API.
 * Outputs output/ts-api.json
 *
 * ## Adding a per-method field derived from a declaration
 *
 * A `MethodInfo` is constructed in ~10 places here. Whether a
 * declaration-derived field (`internal`, `noRailsEquivalent`, …) must be
 * copied at a given site is decided by ONE thing: whether
 * `collectTsFileNames` (extra-surface.ts) counts that entry as the file's own
 * surface. That function is the authority — read it, don't reason by analogy.
 *
 * - counted → the site MUST read the declaration's metadata.
 * - not counted → it MUST NOT: the copied value can never match this file's
 *   Rails surface, so it reads as stale on top of the correct match on the
 *   declaring file. Only two populations are uncounted: `__mixin` members
 *   carrying `declaredIn` (skipped via `synthesizedMixin`) and
 *   `extractFileLocalHelpers` output (always `internal: true`).
 *
 * Interface `extends`-resolved members are the trap: they carry no
 * `declaredIn`, so they ARE counted — the `__mixin` analogy gets it backwards.
 *
 * The full inventory is pinned by "MethodInfo emit-site inventory" in
 * extract-ts-api.test.ts; extend that fixture when you add a field.
 */

import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";
import { COMPARED_TS_FILES, walkTsFilesSync } from "./ts-file-walk.js";
import { createHash } from "node:crypto";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";
import type {
  ApiManifest,
  PackageInfo,
  ClassInfo,
  MethodInfo,
  ParamInfo,
  LiteralValue,
  CallSite,
} from "@blazetrails/parity/types";
import {
  ROOT_DIR,
  OUTPUT_DIR,
  PACKAGES,
  PACKAGE_DIR_OVERRIDES,
  packageSrcDir,
  overlappingSubDirs,
  apiComparePackageRoots,
} from "./config.js";
import {
  sharedCacheDir,
  contentFingerprint,
  readShared,
  writeShared,
  foreignAbsolutePath,
  normalizeReadSet,
  hashReadSet,
  readSetMatches,
  resolutionShape,
  dependencyKey,
  hashParts,
  type ReadSet,
} from "@blazetrails/parity/shared-cache";
import { extractorSchemaToken } from "./extractor-schema.js";
import { staleBuilds, staleBuildMessage } from "./build-freshness.js";
import { FOREIGN_READ_PREFIX, NEGATED_CALL_PREFIX } from "./enumerable-idioms.js";
import {
  ANY_TAG_LINE,
  TAG as MISSING_RAILS_CALL_TAG,
  suppressedCallReasonsIn,
  suppressedCallsIn,
} from "./missing-rails-call-tags.js";
import {
  TAG as MISSING_RAILS_ARGS_TAG,
  suppressedArgCallsIn,
  suppressedArgReasonsIn,
} from "./missing-rails-args-tags.js";

// Per-package cache: extracting all packages with the TS Compiler API
// takes ~16s; only a handful of packages typically change between
// runs. Each package's PackageInfo is cached at
// output/ts-api-cache/<package>.json keyed by `packageFingerprint`
// (SHA-1 over sorted (relPath, mtimeMs, size) triples) plus the
// extractor SCHEMA_VERSION token (see extractor-schema.ts), which changes
// whenever a new per-method output field is added so stale entries missing
// the field are evicted automatically. A package's extraction also resolves
// imports into sibling packages, which its own fingerprint can't see; each
// entry therefore records the RESOLVED READ-SET of the extraction that produced
// it (see shared-cache.ts) and is served only while every recorded input still
// hashes the same.
// Set `API_COMPARE_FORCE=1` to skip the cache entirely. The token is computed
// async (it hashes the extractor
// sources), so it lives on `main()` rather than as a module const.
const CACHE_DIR = path.join(OUTPUT_DIR, "ts-api-cache");
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Per-file map of local import name → original imported name, for relative
 * `import { original as local }` bindings. Set before each source file is
 * walked (see the per-file loop in extractFromProgram) so `extractCalls` can
 * credit `local(...)` and `local.call(...)` back to the ported `original`
 * name. Cleared between files to avoid leaking one file's aliases into another.
 */
let currentImportAliases: ReadonlyMap<string, string> | undefined;

interface CacheEntry {
  schemaVersion: string;
  fingerprint: string;
  /**
   * Cross-package inputs the compiler actually read during this extraction,
   * repo-relative → content hash. Files covered by `fingerprint` itself (the
   * package's own sources) are excluded, so this is exactly the remainder the
   * own-fingerprint can't see. Absent on a pre-read-set entry, which is then
   * treated as a miss.
   */
  inputs?: ReadSet;
  package: PackageInfo;
}

/**
 * Hash of `(relative path, mtimeMs, size)` triples for the package's
 * source files (and tsconfig). Sorting the inputs makes the digest
 * order-independent; folding the path in makes the fingerprint
 * sensitive to renames and moves — earlier `count + maxMtime + sum`
 * approach would silently keep a stale cache when same-sized files
 * were swapped or renamed without bumping any mtime.
 *
 * `baseDir` is the package root (e.g. `packages/arel`) so all inputs
 * — every src `.ts` file and the sibling `tsconfig.json` — appear as
 * forward paths in the digest, and absolute paths don't change the
 * result when the repo is moved or run from a worktree.
 */
export function packageFingerprint(files: string[], baseDir: string): string {
  const entries = files.map((f) => {
    const st = fs.statSync(f);
    const rel = path.relative(baseDir, f).replace(/\\/g, "/");
    return `${rel}\t${st.mtimeMs}\t${st.size}`;
  });
  entries.sort();
  const hash = createHash("sha1");
  for (const e of entries) {
    hash.update(e);
    hash.update("\n");
  }
  return hash.digest("hex");
}

// Worker entry: when this module loads inside a worker thread (after
// the .mjs bootstrap below has registered tsx's ESM loader on this
// thread — see WORKER_BOOTSTRAP), run the requested extraction
// synchronously and ship the result back to the parent.
interface WorkerInput {
  package: string;
  srcDir: string;
}
interface WorkerOutput {
  package: PackageInfo;
  /** Absolute file names of every source file the program read. */
  inputs: string[];
}
const fileHasMissingRailsCallTag = new WeakMap<ts.SourceFile, boolean>();
/** Same role for `@missingRailsArgs`; see the note on the one above. */
const fileHasMissingRailsArgsTag = new WeakMap<ts.SourceFile, boolean>();

/**
 * Tags a deliberate JSDoc block may legitimately carry *after*
 * `@noRailsEquivalent`: the structural ones that document the signature and
 * conventionally trail the description. Every other tag name after the reason
 * is prose that TypeScript mis-parsed — see `proseTagAfter`.
 *
 * Declared with the imports, above the `!isMainThread` block, for the same
 * reason as `fileHasMissingRailsCallTag`: a worker runs the whole extraction
 * during module evaluation, so a `const` declared next to its reader further
 * down the file is still in its temporal dead zone when that reader runs.
 */
const TAGS_ALLOWED_AFTER_NO_RAILS_EQUIVALENT = new Set([
  "param",
  "returns",
  "return",
  "throws",
  "example",
  "see",
  "template",
  "typeParam",
  "yields",
  "defaultValue",
  "remarks",
  "deprecated",
]);

if (!isMainThread && parentPort) {
  const { package: pkgName, srcDir } = workerData as WorkerInput;
  const out: WorkerOutput = extractPackage(pkgName, srcDir);
  parentPort.postMessage(out);
}

// tsx's ESM loader doesn't propagate from a parent that registered it
// via `--import tsx` to a spawned worker. The .mjs bootstrap below
// registers tsx inside the worker first, then imports this module —
// when it loads, the `!isMainThread` guard at the top dispatches into
// extractPackage and posts the result back.
const WORKER_BOOTSTRAP = path.join(SCRIPT_DIR, "extract-ts-api-worker.mjs");

/**
 * The name to record on `host.extends` for an `include()`/`extend()` module
 * argument.
 *
 * Following the import alias to the original symbol is deliberate — `import
 * { Math as MathMixin }` must still record `Math`. But a NAMESPACE import
 * (`import * as Querying from "./querying.js"`) aliases to the MODULE symbol,
 * whose `name` is TypeScript's quoted absolute path for the module
 * (`"/mnt/.../packages/activerecord/src/querying"`). That is not a name, it is
 * a machine-local path: it never resolves in `tsByShort`, and — because the
 * extracted manifest is published to the cross-worktree shared cache — it
 * leaks one worktree's absolute paths into every sibling worktree's run
 * (RFC 0126). The local binding is the name to use.
 */
export function extendsModuleName(sym: ts.Symbol | undefined, modArg: ts.Identifier): string {
  const name = sym?.name;
  if (name === undefined || name.startsWith('"') || name.startsWith("'")) return modArg.text;
  return name;
}

/**
 * Record where an `include()`/`extend()` edge's module was declared, so a
 * consumer resolving the bare short name is not left guessing between
 * same-named modules in sibling adapter directories.
 */
function recordExtendsFile(
  hostInfo: ClassInfo,
  modName: string,
  sym: ts.Symbol | undefined,
  srcDir: string,
): void {
  const declFile = declaringFile(sym, srcDir);
  if (!declFile) return;
  hostInfo.extendsFiles = { ...(hostInfo.extendsFiles ?? {}), [modName]: declFile };
}

/**
 * src-relative file a symbol was declared in, POSIX-normalized so it can be
 * compared against a manifest `ClassInfo.file`. Returns undefined for symbols
 * declared outside `srcDir` (node_modules, other packages) — those can't be
 * matched against this package's entities anyway.
 */
function declaringFile(sym: ts.Symbol | undefined, srcDir: string): string | undefined {
  const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
  if (!decl) return undefined;
  const declFile = path.relative(srcDir, decl.getSourceFile().fileName).replace(/\\/g, "/");
  if (declFile.startsWith("..")) return undefined;
  return declFile;
}

function resolveDeclarationSymbol(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
  const sym = checker.getSymbolAtLocation(node);
  return sym && sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
}

function extractInWorker(pkgName: string, srcDir: string): Promise<WorkerOutput> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_BOOTSTRAP, {
      workerData: { package: pkgName, srcDir } satisfies WorkerInput,
    });
    worker.once("message", (msg: WorkerOutput) => resolve(msg));
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0)
        reject(new Error(`extract-ts-api worker for ${pkgName} exited with code ${code}`));
    });
  });
}

/**
 * Run an array of async tasks with bounded concurrency.
 *
 * `worker_threads` is real CPU parallelism (each worker runs the
 * synchronous TS Compiler API on a separate JS isolate). We cap at
 * `min(packages, cpus())` so a small machine doesn't oversubscribe
 * and a large machine doesn't waste workers on packages that don't
 * exist. Order of resolution doesn't matter — results are keyed by
 * package name when merged into the manifest.
 */
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function lane() {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }
  const lanes = Array.from({ length: Math.min(limit, tasks.length) }, () => lane());
  await Promise.all(lanes);
  return results;
}

export async function main() {
  const manifest: ApiManifest = {
    source: "typescript",
    generatedAt: new Date().toISOString(),
    packages: {},
  };

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  // Fail before any extraction if a sibling package's `dist` predates its
  // sources: cross-package resolution reads those declarations, and `git
  // checkout` never updates them, so a checkout-based baseline would silently
  // mix two commits (see build-freshness.ts).
  if (process.env.API_COMPARE_ALLOW_STALE_BUILD !== "1") {
    const stale = await staleBuilds(apiComparePackageRoots());
    if (stale.length > 0) throw new Error(staleBuildMessage(stale));
  }
  const force = process.env.API_COMPARE_FORCE === "1";
  // Output-schema token folded into every cache key (local + shared). Stale
  // entries from a prior output shape carry a different token and are re-extracted.
  const SCHEMA_VERSION = await extractorSchemaToken(SCRIPT_DIR);
  // `Set` so the per-package summary loop's membership check is O(1).
  const cacheHits = new Set<string>();
  // Cross-worktree content-keyed cache layer (null if not a git checkout, or
  // disabled via FORCE). `tag` discriminates atomic-write tmp files per worktree.
  const sharedDir = force ? null : await sharedCacheDir(ROOT_DIR);
  const sharedTag = path.basename(ROOT_DIR);
  const sharedHits = new Set<string>();

  // Content hashes of read-set files, memoised per absolute path: sibling
  // packages resolve many of the same declarations, and validating every
  // package's read-set must not read the same file 13 times.
  const inputHashes = new Map<string, Promise<string | null>>();
  const shape = await resolutionShape(path.join(ROOT_DIR, "packages"));
  // Neither of those can see `node_modules`, which is most of what the compiler
  // reads; the lockfile stands in for all of it — coarse (any bump invalidates
  // every package) but ~2 ms a run against ~23 ms for the precise alternative,
  // and third-party declarations only move on an install. See dependencyKey.
  const depKey = await dependencyKey(ROOT_DIR);

  // Pass 1: serve every cache hit and record the metadata needed to extract the
  // misses below. `ownRel` is the package's own fingerprint inputs (already
  // covered by `fingerprint`), excluded from the recorded read-set.
  interface PendingExtract {
    pkg: string;
    srcDir: string;
    fingerprint: string;
    cachePath: string;
    ownRel: Set<string>;
    sharedKey: string | null;
  }
  const pending: PendingExtract[] = [];

  for (const pkg of PACKAGES) {
    const pkgDir = packageSrcDir(pkg);
    const files = walkTsFilesSync(pkgDir, COMPARED_TS_FILES, overlappingSubDirs(pkg));
    const dirName = PACKAGE_DIR_OVERRIDES[pkg] ?? pkg;
    const pkgRoot = path.join(ROOT_DIR, "packages", dirName);
    const tsConfigPath = path.join(pkgRoot, "tsconfig.json");
    const fingerprintInputs = [...files];
    if (fs.existsSync(tsConfigPath)) fingerprintInputs.push(tsConfigPath);
    const shapeKey = shape.keyFor(dirName);
    // Anchor relative paths at the package root so tsconfig.json
    // doesn't show up as `../tsconfig.json` (which it would if we
    // anchored at the src dir).
    const fingerprint = hashParts([
      packageFingerprint(fingerprintInputs, pkgRoot),
      shapeKey,
      depKey,
    ]);
    const ownRel = new Set(
      fingerprintInputs.map((file) => path.relative(ROOT_DIR, file).replace(/\\/g, "/")),
    );
    const cachePath = path.join(CACHE_DIR, `${pkg}.json`);

    if (!force && fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as CacheEntry;
        if (
          cached.schemaVersion === SCHEMA_VERSION &&
          cached.fingerprint === fingerprint &&
          cached.inputs &&
          (await readSetMatches(cached.inputs, ROOT_DIR, inputHashes))
        ) {
          manifest.packages[pkg] = cached.package;
          cacheHits.add(pkg);
          continue;
        }
      } catch {
        // Corrupt cache — fall through to re-extract.
      }
    }

    // Local miss. Before queueing an extraction, consult the cross-worktree
    // shared cache keyed by a content fingerprint (mtime-independent, so it
    // matches across checkouts). A shared hit is written back to the local
    // mtime-keyed cache so the next same-worktree run takes the fast path.
    let sharedKey: string | null = null;
    if (sharedDir) {
      const ownContent = await contentFingerprint(fingerprintInputs, pkgRoot);
      const contentKey = `${SCHEMA_VERSION}-${hashParts([ownContent, shapeKey, depKey])}`;
      const body = await readShared(sharedDir, `ts-${pkg}`, contentKey);
      // A payload naming a path outside THIS worktree was produced somewhere
      // else and is not worktree-independent; serving it replays another
      // checkout's measurements (see foreignAbsolutePath). Treat it as a miss.
      if (body && foreignAbsolutePath(body, ROOT_DIR) === null) {
        try {
          const cached = JSON.parse(body) as CacheEntry;
          if (cached.inputs && (await readSetMatches(cached.inputs, ROOT_DIR, inputHashes))) {
            manifest.packages[pkg] = cached.package;
            fs.writeFileSync(
              cachePath,
              JSON.stringify({
                schemaVersion: SCHEMA_VERSION,
                fingerprint,
                inputs: cached.inputs,
                package: cached.package,
              } satisfies CacheEntry),
            );
            cacheHits.add(pkg);
            sharedHits.add(pkg);
            continue;
          }
        } catch {
          // Corrupt shared entry — fall through to re-extract.
        }
      }
      sharedKey = contentKey;
    }

    pending.push({ pkg, srcDir: pkgDir, fingerprint, cachePath, ownRel, sharedKey });
  }

  // Pass 2: extract cache misses in parallel via worker threads.
  if (pending.length > 0) {
    const concurrency = Math.max(1, Math.min(pending.length, cpus().length));
    const tasks = pending.map((p) => async () => {
      const { package: data, inputs } = await extractInWorker(p.pkg, p.srcDir);
      const readSet = await hashReadSet(
        await normalizeReadSet(inputs, ROOT_DIR, p.ownRel),
        ROOT_DIR,
        inputHashes,
      );
      const entry: CacheEntry = {
        schemaVersion: SCHEMA_VERSION,
        fingerprint: p.fingerprint,
        inputs: readSet,
        package: data,
      };
      fs.writeFileSync(p.cachePath, JSON.stringify(entry));
      // Publish to the shared cache under the content key so sibling worktrees
      // reuse this extraction (the shared entry's fingerprint is the content key).
      // The key covers only the package's own files, so a worktree whose
      // dependencies differ can overwrite this entry — harmless, because the
      // recorded read-set is what decides whether a reader may serve it.
      if (sharedDir && p.sharedKey) {
        const shared: CacheEntry = {
          schemaVersion: SCHEMA_VERSION,
          fingerprint: p.sharedKey,
          inputs: readSet,
          package: data,
        };
        const payload = JSON.stringify(shared);
        // Never publish a payload carrying this worktree's absolute paths:
        // every linked worktree reads these entries.
        if (foreignAbsolutePath(payload, ROOT_DIR) === null) {
          await writeShared(sharedDir, `ts-${p.pkg}`, p.sharedKey, payload, sharedTag);
        }
      }
      return [p.pkg, data] as const;
    });
    const results = await runWithConcurrency(tasks, concurrency);
    for (const [pkg, data] of results) {
      manifest.packages[pkg] = data;
    }
  }

  // Print summary in PACKAGES order (not extraction order).
  for (const pkg of PACKAGES) {
    const data = manifest.packages[pkg];
    const classCount = Object.keys(data.classes).length;
    const moduleCount = Object.keys(data.modules).length;
    let methodCount = 0;
    for (const cls of Object.values(data.classes)) {
      methodCount += cls.instanceMethods.length + cls.classMethods.length;
    }
    const tag = sharedHits.has(pkg) ? " (shared)" : cacheHits.has(pkg) ? " (cached)" : "";
    console.log(
      `  ${pkg}: ${classCount} classes, ${moduleCount} modules, ${methodCount} methods${tag}`,
    );
  }
  if (cacheHits.size > 0) {
    const sharedNote =
      sharedHits.size > 0 ? ` (${sharedHits.size} from the shared cross-worktree cache)` : "";
    console.log(
      `\n  ${cacheHits.size}/${PACKAGES.length} packages served from cache${sharedNote} (set API_COMPARE_FORCE=1 to rebuild).`,
    );
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, "ts-api.json");
  const serialized = JSON.stringify(manifest, null, 2);
  // A manifest naming a path outside this worktree describes a tree that is
  // not the one being measured — the failure mode RFC 0126 was filed for,
  // where a replayed extraction reported another branch's ratchet numbers
  // with no error at all. Refuse the run rather than let a gate read it.
  const foreign = foreignAbsolutePath(serialized, ROOT_DIR);
  if (foreign !== null) {
    throw new Error(
      `extract-ts-api: refusing to write ${outputPath} — the extracted manifest names ` +
        `${foreign}, which is outside this worktree (${ROOT_DIR}).\n` +
        "Its measurements describe another checkout, so any gate verdict off it is " +
        "meaningless. Re-run with API_COMPARE_FORCE=1 to discard cached extractions.",
    );
  }
  fs.writeFileSync(outputPath, serialized);
  console.log(`Written to ${outputPath}`);
}

interface PendingReExport {
  fromFile: string; // relative path of the file that re-exports
  localName: string; // name exposed by `fromFile`
  sourceName: string; // original name in the source module
  moduleSpecifier: string; // e.g. "./migration-errors.js"
}

function extractPackage(pkgName: string, srcDir: string): WorkerOutput {
  const subPackageDirs = overlappingSubDirs(pkgName);
  const files = walkTsFilesSync(srcDir, COMPARED_TS_FILES, subPackageDirs);

  // Create a TypeScript program
  const dirName = PACKAGE_DIR_OVERRIDES[pkgName] ?? pkgName;
  const tsConfigPath = path.join(ROOT_DIR, "packages", dirName, "tsconfig.json");
  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    esModuleInterop: true,
    declaration: true,
    skipLibCheck: true,
  };

  if (fs.existsSync(tsConfigPath)) {
    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    if (configFile.config) {
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsConfigPath),
      );
      compilerOptions = { ...compilerOptions, ...parsed.options };
    }
  }

  const program = ts.createProgram(files, compilerOptions);
  return {
    package: extractFromProgram(program, srcDir, subPackageDirs),
    inputs: program.getSourceFiles().map((sourceFile) => sourceFile.fileName),
  };
}

/**
 * Walk `program`'s source files and produce a PackageInfo. Split out
 * from `extractPackage` so tests can drive it with synthetic in-memory
 * programs without needing a real package directory + tsconfig.
 */
export function extractFromProgram(
  program: ts.Program,
  srcDir: string,
  excludeDirs: readonly string[] = [],
): PackageInfo {
  // The program pulls in every file its entry points import, so a sub-package's
  // files reach it through the container's own imports even though the entry
  // list already skipped them — filter here too or the de-overlap is a no-op.
  const excludePrefixes = excludeDirs.map((dir) => dir.replace(/\\/g, "/") + "/");
  const info: PackageInfo &
    Required<Pick<PackageInfo, "fileFunctions" | "fileConstants" | "fileNoRailsEquivalent">> = {
    classes: {},
    modules: {},
    fileFunctions: {},
    fileConstants: {},
    fileNoRailsEquivalent: {},
  };
  const pendingReExports: PendingReExport[] = [];
  const checker = program.getTypeChecker();

  for (const sourceFile of program.getSourceFiles()) {
    const filePath = sourceFile.fileName;
    // Only process our source files (not node_modules or test files)
    if (!filePath.startsWith(srcDir)) continue;
    if (excludePrefixes.some((prefix) => filePath.startsWith(prefix))) continue;
    if (filePath.endsWith(".test.ts")) continue;
    if (filePath.endsWith(".d.ts")) continue;

    // POSIX-normalize relPath so manifest keys are platform-stable.
    // Windows path.relative() yields backslashes; api-compare keys —
    // and resolveRelModule below — assume forward slashes.
    const relPath = path.relative(srcDir, filePath).replace(/\\/g, "/");
    let fileHasClassOrModule = false;
    const fileFunctions: MethodInfo[] = [];
    // Local-name → source-module map for this file, used to resolve the
    // two-step re-export pattern (`import { X } ...; export { X };`).
    const localImports = new Map<string, { sourceName: string; moduleSpecifier: string }>();
    // Renamed-import aliases for this file, consumed by extractCalls below.
    currentImportAliases = collectImportAliases(sourceFile);

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        if (!isExported(node)) return;
        const classInfo = extractClass(node, checker, relPath, srcDir);
        if (classInfo) {
          const classKey = `${relPath}:${classInfo.name}`;
          info.classes[classKey] = classInfo;
          fileHasClassOrModule = true;
        }
      } else if (ts.isInterfaceDeclaration(node) && node.name) {
        if (!isExported(node)) return;
        const name = node.name.text;
        const modKey = `${relPath}:${name}`;
        const extracted = extractInterface(node, checker, relPath, srcDir);
        const existing = info.modules[modKey];
        if (existing) {
          // Merge declaration-merged interfaces (same name, same file)
          const existingNames = new Set(existing.instanceMethods.map((m) => m.name));
          for (const m of extracted.instanceMethods) {
            if (!existingNames.has(m.name)) existing.instanceMethods.push(m);
          }
          for (const e of extracted.extends) {
            if (!existing.extends.includes(e)) existing.extends.push(e);
          }
          if (extracted.extendsFiles) {
            existing.extendsFiles = { ...extracted.extendsFiles, ...(existing.extendsFiles ?? {}) };
          }
          // A declaration-merged interface only needs the tag on ONE of its
          // declarations; without this the reason is lost whenever the tagged
          // half is not the first one walked.
          existing.noRailsEquivalent ??= extracted.noRailsEquivalent;
          existing.isInterface = true;
          existing.interfaceMembers = [
            ...new Set([
              ...(existing.interfaceMembers ?? []),
              ...(extracted.interfaceMembers ?? []),
            ]),
          ];
        } else {
          info.modules[modKey] = extracted;
        }
        fileHasClassOrModule = true;
      } else if (ts.isModuleDeclaration(node) && node.name) {
        if (!isExported(node)) return;
        const name = node.name.text;
        const modKey = `${relPath}:${name}`;
        const extracted = extractNamespace(node, checker, relPath);
        if (node.body && ts.isModuleBlock(node.body)) {
          for (const stmt of node.body.statements) {
            if (!ts.isClassDeclaration(stmt) || !stmt.name || !isExported(stmt)) continue;
            const nested = extractClass(stmt, checker, relPath, srcDir);
            if (nested) {
              info.classes[`${relPath}:${nested.name}`] = nested;
            }
          }
        }
        const existing = info.modules[modKey];
        if (existing) {
          const existingNames = new Set(existing.instanceMethods.map((m) => m.name));
          for (const m of extracted.instanceMethods) {
            if (!existingNames.has(m.name)) existing.instanceMethods.push(m);
          }
          existing.noRailsEquivalent ??= extracted.noRailsEquivalent;
          // Merging into an `interface` half leaves `isInterface` true; record
          // the namespace half so consumers can still see it (see ClassInfo).
          existing.declaredAsNamespace = true;
        } else {
          info.modules[modKey] = extracted;
        }
        fileHasClassOrModule = true;
      } else if (ts.isExportDeclaration(node)) {
        // Handle `export * as Foo from "./bar.js"` — namespace re-exports
        // Only record if not already defined by an interface/namespace declaration
        if (node.exportClause && ts.isNamespaceExport(node.exportClause)) {
          const name = node.exportClause.name.text;
          const modKey = `${relPath}:${name}`;
          const existing = info.modules[modKey];
          if (existing) {
            // An interface/namespace declaration already owns the entry; keep
            // its members, but still record this namespace binding of the name
            // (same reason as the `export namespace` merge branch above).
            existing.declaredAsNamespace = true;
            return;
          }
          info.modules[modKey] = {
            name,
            file: relPath,
            includes: [],
            extends: [],
            instanceMethods: [],
            classMethods: [],
            declaredAsNamespace: true,
          };
          fileHasClassOrModule = true;
        } else if (
          node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          // Handle `export { X, Y } from "./z.js"` — single-step named
          // re-exports. Record each re-exported name as "pending" keyed
          // under this file's relPath; resolved in a post-pass once
          // every file has been walked (the source file may come later
          // in the list).
          for (const spec of node.exportClause.elements) {
            const localName = spec.name.text;
            const sourceName = spec.propertyName?.text ?? localName;
            pendingReExports.push({
              fromFile: relPath,
              localName,
              sourceName,
              moduleSpecifier: node.moduleSpecifier.text,
            });
          }
        } else if (
          node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          !node.moduleSpecifier
        ) {
          // Handle the two-step pattern:
          //   import { X } from "./y.js";
          //   export { X };
          // Look up each exported name in localImports (built during
          // the same forEachChild pass) to recover the source module.
          for (const spec of node.exportClause.elements) {
            const localName = spec.name.text;
            const sourceName = spec.propertyName?.text ?? localName;
            const imported = localImports.get(sourceName);
            if (!imported) continue;
            pendingReExports.push({
              fromFile: relPath,
              localName,
              sourceName: imported.sourceName,
              moduleSpecifier: imported.moduleSpecifier,
            });
          }
        }
      } else if (ts.isImportDeclaration(node)) {
        // Track local imports so the two-step re-export branch above
        // can resolve `export { X };` back to its source module.
        if (
          node.importClause?.namedBindings &&
          ts.isNamedImports(node.importClause.namedBindings) &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const spec = node.moduleSpecifier.text;
          if (spec.startsWith("./") || spec.startsWith("../")) {
            for (const el of node.importClause.namedBindings.elements) {
              const localName = el.name.text;
              const sourceName = el.propertyName?.text ?? localName;
              localImports.set(localName, { sourceName, moduleSpecifier: spec });
            }
          }
        }
      } else if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
        const line = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const fnOptionKeys = extractOptionKeys(node.parameters, checker);
        const fnCalls = extractCalls(node.body);
        const fnCallSeq = extractCallSeq(node.body);
        const fnCallArgs = extractCallArgs(node.body);
        const fnSkeleton = extractSkeleton(node.body);
        const internal = internalJsDocTagApplies(node);
        const noRailsEquivalent = noRailsEquivalentReason(node);
        const fnMissingRailsCalls = missingRailsCallTags(node);
        const fnMissingRailsArgs = missingRailsArgsTags(node);
        const fnMissingRailsCallReasons = missingRailsCallTagReasons(node);
        const fnMissingRailsArgsReasons = missingRailsArgsTagReasons(node);
        fileFunctions.push({
          name: node.name.text,
          visibility: "public",
          params: extractParameters(node.parameters),
          isStatic: false,
          line,
          file: relPath,
          ...(internal ? { internal: true } : {}),
          ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
          ...(fnOptionKeys !== undefined ? { optionKeys: fnOptionKeys } : {}),
          ...(fnCalls !== undefined ? { calls: fnCalls } : {}),
          ...(fnCallSeq !== undefined ? { callSeq: fnCallSeq } : {}),
          ...(fnCallArgs !== undefined ? { callArgs: fnCallArgs } : {}),
          ...(fnSkeleton !== undefined ? { skeleton: fnSkeleton } : {}),
          ...(fnMissingRailsCalls !== undefined ? { missingRailsCalls: fnMissingRailsCalls } : {}),
          ...(fnMissingRailsArgs !== undefined ? { missingRailsArgs: fnMissingRailsArgs } : {}),
          ...(fnMissingRailsCallReasons !== undefined
            ? { missingRailsCallReasons: fnMissingRailsCallReasons }
            : {}),
          ...(fnMissingRailsArgsReasons !== undefined
            ? { missingRailsArgsReasons: fnMissingRailsArgsReasons }
            : {}),
        });
      } else if (ts.isVariableStatement(node) && isExported(node)) {
        // Capture `export const X = { method() {...}, foo, bar: ... }`
        // as a module. This is the shape every `include(Host, Mod)`
        // mixin uses (see activesupport/src/include.ts).
        for (const decl of node.declarationList.declarations) {
          if (!decl.name || !ts.isIdentifier(decl.name)) continue;
          if (isConstantCaseName(decl.name.text)) continue;
          if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;
          const methods = harvestObjectLiteralMethods(decl.initializer, checker, relPath);
          if (methods.length === 0) continue;
          const modKey = `${relPath}:${decl.name.text}`;
          if (info.modules[modKey] || info.classes[modKey]) continue;
          const modReason = noRailsEquivalentReason(decl) ?? noRailsEquivalentReason(node);
          info.modules[modKey] = {
            name: decl.name.text,
            file: relPath,
            includes: [],
            extends: [],
            instanceMethods: methods,
            classMethods: [],
            ...(modReason !== undefined ? { noRailsEquivalent: modReason } : {}),
          };
          fileHasClassOrModule = true;
        }
      } else if (
        (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) &&
        !isExported(node)
      ) {
        // Non-exported file-local helpers map to Rails private methods
        // per the project mixin convention (CLAUDE.md). Record them as
        // internal so `--privates` mode can match them.
        for (const helper of extractFileLocalHelpers(node, relPath)) {
          fileFunctions.push(helper);
        }
      }
    });

    // Extract members from mixin functions that return a class (constructor type).
    // e.g., `export function Attributes<T>(Base: T) { class M { constructor(); get attributes() {} } return M; }`
    // The inner class is invisible to the top-level walker, but TypeScript's return
    // type inference gives us access to its members.
    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isFunctionDeclaration(node) || !node.name || !isExported(node)) return;
      const sig = checker.getSignatureFromDeclaration(node);
      if (!sig) return;
      const returnType = checker.getReturnTypeOfSignature(sig);
      const constructSigs = returnType.getConstructSignatures();
      if (constructSigs.length === 0) return;

      const instanceType = constructSigs[0].getReturnType();
      const mixinKey = `${relPath}:${node.name.text}__mixin`;
      const mixinMethods: MethodInfo[] = [];

      for (const prop of instanceType.getProperties()) {
        if (prop.flags & ts.SymbolFlags.Prototype) continue;
        const decl = prop.valueDeclaration ?? prop.declarations?.[0];
        if (!decl) continue;
        // `#private` fields surface in the symbol table with their
        // mangled name, not a literal leading `#`, so derive the flag
        // from the declaration's name node (same approach as `getVisibility`
        // below and the top-level class walker at line 707/727).
        const declNameNode = (decl as ts.NamedDeclaration).name;
        const isPrivateField = !!declNameNode && ts.isPrivateIdentifier(declNameNode);
        const hasPrivateMod = hasModifier(decl, ts.SyntaxKind.PrivateKeyword);
        const hasProtectedMod = hasModifier(decl, ts.SyntaxKind.ProtectedKeyword);
        const visibility: "public" | "private" | "protected" =
          isPrivateField || hasPrivateMod ? "private" : hasProtectedMod ? "protected" : "public";
        const internal = visibility !== "public" || internalJsDocTagApplies(decl);
        const line = decl.getSourceFile().getLineAndCharacterOfPosition(decl.getStart()).line + 1;
        const declFile = path.relative(srcDir, decl.getSourceFile().fileName).replace(/\\/g, "/");
        // Only a member DECLARED in this file carries its tag into the mixin
        // entry: `collectTsFileNames` skips foreign synthesized members, so a
        // tag copied off an inherited base-class method would never match here
        // and would read as stale on top of its correct match on the base file.
        const noRailsEquivalent = declFile === relPath ? noRailsEquivalentReason(decl) : undefined;
        mixinMethods.push({
          name: prop.name,
          visibility,
          ...declarationArity(decl, checker),
          isStatic: false,
          line,
          file: relPath,
          ...(declFile !== relPath ? { declaredIn: declFile } : {}),
          ...(internal ? { internal: true } : {}),
          ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
        });
      }

      // Add constructor. The inner class is invisible to the top-level walker,
      // so its `constructor` reaches this entry only through the construct
      // signature's declaration. Split the same way as the property loop
      // above: visibility comes off whichever declaration the signature
      // resolves to — its line points into that file too — a foreign one is
      // marked `declaredIn` so `collectTsFileNames` skips it as another file's
      // surface, and only the JSDoc reason is gated
      // on the declaration living in THIS file. An implicit constructor
      // resolves to no declaration at all, and that entry stays bare.
      if (constructSigs.length > 0) {
        const sigDecl = constructSigs[0].getDeclaration();
        const ctorDecl =
          sigDecl !== undefined && ts.isConstructorDeclaration(sigDecl) ? sigDecl : undefined;
        const ctorDeclFile =
          ctorDecl !== undefined
            ? path.relative(srcDir, ctorDecl.getSourceFile().fileName).replace(/\\/g, "/")
            : undefined;
        const ownCtor = ctorDeclFile === relPath ? ctorDecl : undefined;
        const ctorVisibility = ctorDecl !== undefined ? memberVisibility(ctorDecl) : "public";
        const ctorReason = ownCtor !== undefined ? noRailsEquivalentReason(ownCtor) : undefined;
        const ctorNode = ctorDecl ?? node;
        mixinMethods.push({
          name: "constructor",
          visibility: ctorVisibility,
          ...declarationArity(ctorDecl, checker),
          isStatic: false,
          line:
            ctorNode.getSourceFile().getLineAndCharacterOfPosition(ctorNode.getStart()).line + 1,
          file: relPath,
          ...(ctorDeclFile !== undefined && ctorDeclFile !== relPath
            ? { declaredIn: ctorDeclFile }
            : {}),
          ...(ctorVisibility !== "public" ||
          (ctorDecl !== undefined && internalJsDocTagApplies(ctorDecl))
            ? { internal: true }
            : {}),
          ...(ctorReason !== undefined ? { noRailsEquivalent: ctorReason } : {}),
        });
      }

      for (const own of factoryClassMembers(node, checker, relPath, srcDir)) {
        const at = mixinMethods.findIndex(
          (m) => m.name === own.name && !!m.isStatic === !!own.isStatic,
        );
        if (at === -1) mixinMethods.push(own);
        else mixinMethods[at] = { ...mixinMethods[at], ...own, declaredIn: undefined };
      }

      if (mixinMethods.length > 0) {
        info.modules[mixinKey] = {
          name: `${node.name.text}__mixin`,
          file: relPath,
          includes: [],
          extends: [],
          instanceMethods: mixinMethods,
          classMethods: [],
          synthesizedMixin: true,
        };
        fileHasClassOrModule = true;
      }
    });

    // Also capture functions exported via `export { foo, bar }` (named export lists).
    // Resolve aliases so ExportSpecifier nodes reach the underlying FunctionDeclaration.
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol) {
      const exports = checker.getExportsOfModule(moduleSymbol);
      for (const sym of exports) {
        // Keep _-prefixed exports — Rails has public methods like _load_from, _reflect_on_association
        if (fileFunctions.some((f) => f.name === sym.name)) continue;
        const resolved = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
        const decl = resolved.valueDeclaration ?? resolved.declarations?.[0];
        // A NAMED re-export — `export { parameterize } from "./transliterate.js"`
        // — is how TS spells a Ruby one-line delegation (`String#parameterize`
        // is `Inflector.parameterize(self, …)`, core_ext/string/inflections.rb:184).
        // The member really is part of this file's surface, so it counts here as
        // well as in the file that defines the body, exactly as Ruby counts it in
        // both `inflections.rb` and `transliterate.rb`. `export *` barrels declare
        // no specifier here and are unaffected.
        const namedReExport = sym.declarations?.some(
          (d) =>
            ts.isExportSpecifier(d) &&
            d.getSourceFile() === sourceFile &&
            d.parent.parent.moduleSpecifier !== undefined,
        );
        // Where that named re-export points, as a `<file>:<name>` key. The
        // barrel is a re-export site, not a port location, so extra-surface
        // scores the name against the DECLARING file's Rails counterpart.
        const reExportSpecifier = sym.declarations?.find(
          (d): d is ts.ExportSpecifier =>
            ts.isExportSpecifier(d) &&
            d.getSourceFile() === sourceFile &&
            d.parent.parent.moduleSpecifier !== undefined,
        );
        let reExportedFrom: string | undefined;
        if (reExportSpecifier !== undefined) {
          const spec = reExportSpecifier.parent.parent.moduleSpecifier;
          const targetRel =
            spec !== undefined && ts.isStringLiteral(spec)
              ? resolveRelModule(relPath, spec.text)
              : null;
          if (targetRel) {
            reExportedFrom = `${targetRel}:${(reExportSpecifier.propertyName ?? reExportSpecifier.name).text}`;
          }
        }
        if (decl && (decl.getSourceFile() === sourceFile || namedReExport === true)) {
          let params: ParamInfo[] = [];
          let isFunctionLike = false;

          if (ts.isFunctionDeclaration(decl)) {
            isFunctionLike = true;
            params = extractParameters(decl.parameters);
          } else if (ts.isVariableDeclaration(decl) && decl.initializer) {
            const init = decl.initializer;
            if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
              isFunctionLike = true;
              params = extractParameters(init.parameters);
            } else {
              // Handle `export const foo = existingFunction` aliases
              const type = checker.getTypeAtLocation(init);
              const signatures = type.getCallSignatures();
              if (signatures.length > 0) {
                isFunctionLike = true;
                const sigDecl = signatures[0].declaration;
                if (sigDecl && ts.isFunctionLike(sigDecl)) {
                  params = extractParameters(sigDecl.parameters);
                }
              }
            }
          }

          if (isFunctionLike) {
            const line =
              decl.getSourceFile().getLineAndCharacterOfPosition(decl.getStart()).line + 1;
            const body = ts.isFunctionDeclaration(decl)
              ? decl.body
              : ts.isVariableDeclaration(decl) &&
                  decl.initializer &&
                  (ts.isArrowFunction(decl.initializer) ||
                    ts.isFunctionExpression(decl.initializer))
                ? decl.initializer.body
                : undefined;
            const calls = extractCalls(body);
            const callSeq = extractCallSeq(body);
            const callArgs = extractCallArgs(body);
            const skeleton = extractSkeleton(body);
            const internal = internalJsDocTagApplies(decl);
            // A renamed export (`export { withRoutesHelpers as with }`) is its
            // own surface entry: the declaration's tag justifies the DECLARED
            // spelling, and inheriting it would manufacture a stale tag on the
            // alias whenever the alias is the Rails-matching name. So a renamed
            // alias carries only a tag written on the export itself — on the
            // specifier or on the `export { ... }` statement — which keeps an
            // alias that is genuinely extra surface taggable.
            const renamedSpecifier = sym.declarations?.find(
              (d): d is ts.ExportSpecifier =>
                ts.isExportSpecifier(d) && d.propertyName !== undefined,
            );
            const noRailsEquivalent =
              renamedSpecifier === undefined
                ? noRailsEquivalentReason(decl)
                : (noRailsEquivalentReason(renamedSpecifier) ??
                  noRailsEquivalentReason(renamedSpecifier.parent.parent));
            const exportedMissingRailsCalls =
              renamedSpecifier === undefined
                ? missingRailsCallTags(decl)
                : (missingRailsCallTags(renamedSpecifier) ??
                  missingRailsCallTags(renamedSpecifier.parent.parent));
            fileFunctions.push({
              name: sym.name,
              visibility: "public",
              params,
              isStatic: false,
              line,
              file: relPath,
              ...(internal ? { internal: true } : {}),
              ...(reExportedFrom !== undefined ? { reExportedFrom } : {}),
              ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
              ...(calls !== undefined ? { calls } : {}),
              ...(callSeq !== undefined ? { callSeq } : {}),
              ...(callArgs !== undefined ? { callArgs } : {}),
              ...(skeleton !== undefined ? { skeleton } : {}),
              ...(exportedMissingRailsCalls !== undefined
                ? { missingRailsCalls: exportedMissingRailsCalls }
                : {}),
            });
          }
        }
      }
    }

    // Always record file-level functions so compare.ts can match methods
    // against the file regardless of whether a class/interface wrapper exists.
    if (fileFunctions.length > 0) {
      info.fileFunctions[relPath] = fileFunctions;
    }

    const fileConstants = extractFileConstants(sourceFile);
    if (Object.keys(fileConstants).length > 0) info.fileConstants[relPath] = fileConstants;

    const fileReason = fileLevelNoRailsEquivalentReason(sourceFile);
    if (fileReason !== undefined) info.fileNoRailsEquivalent[relPath] = fileReason;

    // If a file has exported functions but no class/interface/namespace,
    // also create a module entry from the file name for backward compat.
    // Only count public functions: a file with only non-exported helpers
    // (all `internal: true`) shouldn't fabricate a module — there's no
    // public surface for the module to represent.
    // A function that only passes THROUGH this file (`export { buildQuoted }
    // from "./casted.js"`) is not a declaration here, so it cannot conjure a
    // module named after the barrel's filename — `nodes/index.ts` would
    // fabricate `Index`, a name nobody wrote and Rails does not have.
    const hasPublicFn = fileFunctions.some((fn) => !fn.internal && !fn.reExportedFrom);
    if (!fileHasClassOrModule && hasPublicFn) {
      const baseName = path.basename(relPath, ".ts");
      const moduleName = baseName
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
      const autoModKey = `${relPath}:${moduleName}`;
      if (!info.modules[autoModKey] && !info.classes[autoModKey]) {
        info.modules[autoModKey] = {
          name: moduleName,
          file: relPath,
          includes: [],
          extends: [],
          instanceMethods: fileFunctions,
          classMethods: [],
          synthesizedFileModule: true,
        };
      }
    }
    currentImportAliases = undefined;
  }

  // Post-pass: resolve named re-exports. For each `export { X } from
  // "./y.js"`, if ./y.js defined `X` (and we haven't already registered
  // `fromFile:X` via a local declaration), clone the class entry under
  // the re-exporting file's path so api-compare sees the class where
  // Rails expects it.
  for (const re of pendingReExports) {
    const key = `${re.fromFile}:${re.localName}`;
    if (info.classes[key] || info.modules[key]) continue;
    const targetRel = resolveRelModule(re.fromFile, re.moduleSpecifier);
    if (!targetRel) continue;
    const sourceKey = `${targetRel}:${re.sourceName}`;
    const sourceClass = info.classes[sourceKey];
    if (sourceClass) {
      info.classes[key] = {
        ...sourceClass,
        name: re.localName,
        file: re.fromFile,
        reExportedFrom: sourceKey,
      };
      continue;
    }
    const sourceModule = info.modules[sourceKey];
    if (sourceModule) {
      info.modules[key] = {
        ...sourceModule,
        name: re.localName,
        file: re.fromFile,
        reExportedFrom: sourceKey,
      };
    }
  }

  // Include-detection pass: every `include(Host, Mod)` call (from
  // `@blazetrails/activesupport`) is recorded as `Host.extends += Mod`,
  // so compare.ts's existing `getInherited` walker folds Mod's methods
  // into Host's TS surface. Without this the host class's file looks
  // empty of the mixed-in methods even when Rails reports them as part
  // of the host's effective surface (see arel #814).
  //
  // We walk the whole file (not just top-level expression statements):
  // some hosts apply their `include`s from inside a module-level helper
  // (e.g. `ensureAbstractAdapterMixinsApplied()` in abstract-adapter.ts,
  // added in PR #4458 to break a module-eval TDZ cycle). Those calls are
  // nested inside a function body but still describe the host's static
  // mixin surface, so they must be attributed too.
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.startsWith(srcDir)) continue;
    if (sourceFile.fileName.endsWith(".test.ts")) continue;
    if (sourceFile.fileName.endsWith(".d.ts")) continue;

    let importsInclude = false;
    ts.forEachChild(sourceFile, (n) => {
      if (
        !ts.isImportDeclaration(n) ||
        !ts.isStringLiteral(n.moduleSpecifier) ||
        n.moduleSpecifier.text !== "@blazetrails/activesupport" ||
        !n.importClause?.namedBindings ||
        !ts.isNamedImports(n.importClause.namedBindings)
      ) {
        return;
      }
      for (const el of n.importClause.namedBindings.elements) {
        if ((el.propertyName ?? el.name).text === "include") importsInclude = true;
      }
    });
    if (!importsInclude) continue;

    forEachCallNamed(sourceFile, "include", (call) => {
      if (call.arguments.length < 2) return;
      const [hostArg, modArg] = call.arguments;
      if (!ts.isIdentifier(hostArg)) return;

      const hostSym0 = checker.getSymbolAtLocation(hostArg);
      if (!hostSym0) return;
      const hostSym =
        hostSym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(hostSym0) : hostSym0;
      let hostDecl: ts.Declaration | undefined =
        hostSym.valueDeclaration ?? hostSym.declarations?.[0];
      let hostName: string = hostSym.name;
      // Some sites bind the class through a const cast first, e.g.
      // `const _NodeExpression = NodeExpression as unknown as new (...) => ...`.
      // Walk the type's construct signature back to the original class.
      if (!hostDecl || !ts.isClassDeclaration(hostDecl)) {
        const t = checker.getTypeAtLocation(hostArg);
        const ctorSigs = t.getConstructSignatures();
        const inst = ctorSigs[0]?.getReturnType();
        const sym = inst?.getSymbol();
        const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
        if (decl && ts.isClassDeclaration(decl) && sym) {
          hostDecl = decl;
          hostName = sym.name;
        } else {
          return;
        }
      }
      const hostFile = path.relative(srcDir, hostDecl.getSourceFile().fileName).replace(/\\/g, "/");
      const hostKey = `${hostFile}:${hostName}`;
      const hostInfo = info.classes[hostKey];
      if (!hostInfo) return;

      const pushMethods = (methods: MethodInfo[]): void => {
        for (const m of methods) {
          if (hostInfo.instanceMethods.some((existing) => existing.name === m.name)) continue;
          hostInfo.instanceMethods.push({ ...m, file: hostInfo.file });
        }
      };

      // Inline object literal: `include(Host, { foo() {...}, bar: ... })`.
      // No module name to reference — push methods straight onto the host.
      if (ts.isObjectLiteralExpression(modArg)) {
        pushMethods(harvestObjectLiteralMethods(modArg, checker, hostInfo.file ?? ""));
        return;
      }

      // Property access: `include(Host, NS.InstanceMethods)`. The bare
      // name "InstanceMethods" collides heavily across files (every
      // concern declares one), so we can't push it onto host.extends
      // and rely on path-proximity resolution. Resolve the property
      // symbol back to its declaration and push its methods directly.
      if (ts.isPropertyAccessExpression(modArg) && ts.isIdentifier(modArg.name)) {
        const sym0 = checker.getSymbolAtLocation(modArg);
        const resolved =
          sym0 && sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;
        const propDecl = resolved?.valueDeclaration ?? resolved?.declarations?.[0];
        if (
          propDecl &&
          ts.isVariableDeclaration(propDecl) &&
          propDecl.initializer &&
          ts.isObjectLiteralExpression(propDecl.initializer)
        ) {
          pushMethods(
            harvestObjectLiteralMethods(propDecl.initializer, checker, hostInfo.file ?? ""),
          );
        }
        return;
      }

      // Bare identifier: `include(Host, Mod)`. Two sub-cases:
      //
      // (a) Mod is a class / interface — push its name onto host.extends so
      //     compare.ts's getInherited() walker resolves it via tsByShort.
      //     Imports may rebind (`import { Math as MathMixin }`), so follow
      //     the alias to the original symbol's name.
      //
      // (b) Mod is a `const` object literal (e.g. `export const QueryMethodBangs
      //     = { foo, bar } as const`). The extractor never creates a class/module
      //     entry for plain objects, so pushing the name to extends would leave
      //     it unresolvable. Instead, harvest the object's method keys directly
      //     onto the host — same treatment as the inline-object and
      //     property-access branches above.
      if (ts.isIdentifier(modArg)) {
        const sym0 = checker.getSymbolAtLocation(modArg);
        const sym =
          sym0 && sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;

        // (b): const object literal → harvest directly, then fall through to
        // also push the name onto extends for compare.ts resolution.
        const valDecl = sym?.valueDeclaration ?? sym?.declarations?.[0];
        if (valDecl && ts.isVariableDeclaration(valDecl) && valDecl.initializer) {
          // Strip `as const` / other type assertions to reach the raw literal.
          let init = valDecl.initializer;
          while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) {
            init = init.expression;
          }
          if (ts.isObjectLiteralExpression(init)) {
            pushMethods(harvestObjectLiteralMethods(init, checker, hostInfo.file ?? ""));
          }
        }

        // (a): class / interface / module — push name for later resolution.
        const modName = extendsModuleName(sym, modArg);
        if (!hostInfo.extends.includes(modName)) hostInfo.extends.push(modName);
        recordExtendsFile(hostInfo, modName, sym, srcDir);
      }
    });
  }

  // Extend-detection pass: mirrors the include-detection pass above, but for
  // `extend(Host, Mod)` calls. `extend()` wires class-level (static) methods
  // whereas `include()` wires instance-level methods; both are tracked on the
  // same `extends` field because parity:api's expected set conflates them.
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.startsWith(srcDir)) continue;
    if (sourceFile.fileName.endsWith(".test.ts")) continue;
    if (sourceFile.fileName.endsWith(".d.ts")) continue;

    let importsExtend = false;
    ts.forEachChild(sourceFile, (n) => {
      if (
        !ts.isImportDeclaration(n) ||
        !ts.isStringLiteral(n.moduleSpecifier) ||
        n.moduleSpecifier.text !== "@blazetrails/activesupport" ||
        !n.importClause?.namedBindings ||
        !ts.isNamedImports(n.importClause.namedBindings)
      ) {
        return;
      }
      for (const el of n.importClause.namedBindings.elements) {
        if ((el.propertyName ?? el.name).text === "extend") importsExtend = true;
      }
    });
    if (!importsExtend) continue;

    forEachCallNamed(sourceFile, "extend", (call) => {
      if (call.arguments.length < 2) return;
      const [hostArg, modArg] = call.arguments;
      if (!ts.isIdentifier(hostArg)) return;

      const hostSym0 = checker.getSymbolAtLocation(hostArg);
      if (!hostSym0) return;
      const hostSym =
        hostSym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(hostSym0) : hostSym0;
      let hostDecl: ts.Declaration | undefined =
        hostSym.valueDeclaration ?? hostSym.declarations?.[0];
      let hostName: string = hostSym.name;
      if (!hostDecl || !ts.isClassDeclaration(hostDecl)) {
        const t = checker.getTypeAtLocation(hostArg);
        const ctorSigs = t.getConstructSignatures();
        const inst = ctorSigs[0]?.getReturnType();
        const sym = inst?.getSymbol();
        const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
        if (decl && ts.isClassDeclaration(decl) && sym) {
          hostDecl = decl;
          hostName = sym.name;
        } else {
          return;
        }
      }
      const hostFile = path.relative(srcDir, hostDecl.getSourceFile().fileName).replace(/\\/g, "/");
      const hostKey = `${hostFile}:${hostName}`;
      const hostInfo = info.classes[hostKey];
      if (!hostInfo) return;

      const pushMethods = (methods: MethodInfo[]): void => {
        for (const m of methods) {
          if (hostInfo.instanceMethods.some((existing) => existing.name === m.name)) continue;
          hostInfo.instanceMethods.push({ ...m, file: hostInfo.file });
        }
      };

      // Inline object literal: `extend(Host, { foo() {...}, bar: ... })`.
      if (ts.isObjectLiteralExpression(modArg)) {
        pushMethods(harvestObjectLiteralMethods(modArg, checker, hostInfo.file ?? ""));
        return;
      }

      // Property access: `extend(Host, NS.ClassMethods)`. "ClassMethods"
      // collides across files, so resolve to the declaration and push
      // methods directly rather than relying on name-based lookup.
      if (ts.isPropertyAccessExpression(modArg) && ts.isIdentifier(modArg.name)) {
        const sym0 = checker.getSymbolAtLocation(modArg);
        const resolved =
          sym0 && sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;
        const propDecl = resolved?.valueDeclaration ?? resolved?.declarations?.[0];
        if (
          propDecl &&
          ts.isVariableDeclaration(propDecl) &&
          propDecl.initializer &&
          ts.isObjectLiteralExpression(propDecl.initializer)
        ) {
          pushMethods(
            harvestObjectLiteralMethods(propDecl.initializer, checker, hostInfo.file ?? ""),
          );
        }
        return;
      }

      // Bare identifier: `extend(Host, Mod)`.
      // (a) Class/interface — push name onto host.extends for compare.ts resolution.
      // (b) Const object literal — harvest methods directly (same as include pass).
      if (ts.isIdentifier(modArg)) {
        const sym0 = checker.getSymbolAtLocation(modArg);
        const sym =
          sym0 && sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;

        const valDecl = sym?.valueDeclaration ?? sym?.declarations?.[0];
        if (valDecl && ts.isVariableDeclaration(valDecl) && valDecl.initializer) {
          let init = valDecl.initializer;
          while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) {
            init = init.expression;
          }
          if (ts.isObjectLiteralExpression(init)) {
            pushMethods(harvestObjectLiteralMethods(init, checker, hostInfo.file ?? ""));
          }
        }

        const modName = extendsModuleName(sym, modArg);
        if (!hostInfo.extends.includes(modName)) hostInfo.extends.push(modName);
        recordExtendsFile(hostInfo, modName, sym, srcDir);
      }
    });
  }

  // Object.defineProperty pass: detect two patterns that wire methods onto a
  // class prototype without going through include(). Both appear in base.ts:
  //
  //   Pattern A — string-literal key:
  //     Object.defineProperty(Cls.prototype, "methodName", { value: fn });
  //
  //   Pattern B — for-of loop over a [name, fn][] as-const array:
  //     for (const [name, fn] of [["m1", f1], ["m2", f2]] as const) {
  //       Object.defineProperty(Cls.prototype, name, { value: fn });
  //     }
  //
  // Without this pass, parity:api cannot see those methods on the host class.
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.startsWith(srcDir)) continue;
    if (sourceFile.fileName.endsWith(".test.ts")) continue;
    if (sourceFile.fileName.endsWith(".d.ts")) continue;

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isExpressionStatement(node)) {
        extractDefinePropertyDirect(node.expression, info, checker, srcDir);
      } else if (ts.isForOfStatement(node)) {
        extractDefinePropertyForOf(node, info, checker, srcDir);
      }
    });
  }

  return info;
}

/**
 * Recursively visit every `name(...)` call expression under `root` where the
 * callee is a bare identifier equal to `name`. Used by the include/extend
 * detection passes so calls nested inside a module-level helper function
 * (not just top-level expression statements) are still attributed to the host
 * class — see the include-detection pass for the abstract-adapter.ts case.
 */
function forEachCallNamed(
  root: ts.Node,
  name: string,
  visit: (call: ts.CallExpression) => void,
): void {
  const walk = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) {
      visit(n);
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(root, walk);
}

/**
 * Given a `Cls.prototype` expression, return the ClassInfo for Cls if it is
 * a known class in `info`. Returns null for any unrecognised shape.
 */
function classInfoForPrototype(
  expr: ts.Expression,
  info: PackageInfo,
  checker: ts.TypeChecker,
  srcDir: string,
): ClassInfo | null {
  if (!ts.isPropertyAccessExpression(expr)) return null;
  if (!ts.isIdentifier(expr.name) || expr.name.text !== "prototype") return null;
  const clsExpr = expr.expression;
  if (!ts.isIdentifier(clsExpr)) return null;
  const sym0 = checker.getSymbolAtLocation(clsExpr);
  if (!sym0) return null;
  const sym = sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;
  const decl = sym.valueDeclaration ?? sym.declarations?.[0];
  if (!decl || !ts.isClassDeclaration(decl)) return null;
  const file = path.relative(srcDir, decl.getSourceFile().fileName).replace(/\\/g, "/");
  return info.classes[`${file}:${sym.name}`] ?? null;
}

/** Push a method name onto classInfo if not already present. */
function pushDefinePropertyMethod(
  classInfo: ClassInfo,
  name: string,
  line: number,
  params: ParamInfo[] = [],
): void {
  if (classInfo.instanceMethods.some((m) => m.name === name)) return;
  classInfo.instanceMethods.push({
    name,
    visibility: "private",
    internal: true,
    params,
    line,
    file: classInfo.file,
  });
}

/** Params behind an `Object.defineProperty` `value:` — inline function or alias. */
function paramsOfDescriptorValue(value: ts.Expression, checker: ts.TypeChecker): ParamInfo[] {
  if (ts.isFunctionExpression(value) || ts.isArrowFunction(value)) {
    return extractParameters(value.parameters);
  }
  return paramsOfCallableRef(value, checker) ?? [];
}

/** The `value:` initializer of an `Object.defineProperty` descriptor, if any. */
function definePropertyValue(descriptor: ts.ObjectLiteralExpression): ts.Expression | null {
  for (const p of descriptor.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "value") {
      return p.initializer;
    }
  }
  return null;
}

/**
 * Pattern A: direct `Object.defineProperty(Cls.prototype, "name", { value: fn })`.
 * If the property name is a string literal and the descriptor has a `value` key,
 * the method is credited to Cls.
 */
function extractDefinePropertyDirect(
  expr: ts.Expression,
  info: PackageInfo,
  checker: ts.TypeChecker,
  srcDir: string,
): void {
  if (!ts.isCallExpression(expr)) return;
  if (!ts.isPropertyAccessExpression(expr.expression)) return;
  const pa = expr.expression;
  if (!ts.isIdentifier(pa.expression) || pa.expression.text !== "Object") return;
  if (!ts.isIdentifier(pa.name) || pa.name.text !== "defineProperty") return;
  if (expr.arguments.length < 3) return;
  const [target, propNameExpr, descriptor] = expr.arguments;
  if (!ts.isStringLiteral(propNameExpr)) return;
  if (!ts.isObjectLiteralExpression(descriptor)) return;
  const value = definePropertyValue(descriptor);
  if (!value) return;
  const classInfo = classInfoForPrototype(target, info, checker, srcDir);
  if (!classInfo) return;
  const line = expr.getSourceFile().getLineAndCharacterOfPosition(expr.getStart()).line + 1;
  pushDefinePropertyMethod(
    classInfo,
    propNameExpr.text,
    line,
    paramsOfDescriptorValue(value, checker),
  );
}

/**
 * Pattern B: for-of loop that calls `Object.defineProperty(Cls.prototype, nameVar, ...)`:
 *
 *   for (const [name, fn] of [["m1", f1], ["m2", f2]] as const) {
 *     Object.defineProperty(Cls.prototype, name, { value: fn });
 *   }
 *
 * Collects the string-literal first elements of the iterable and credits them
 * to the class whose prototype appears in the loop body.
 */
function extractDefinePropertyForOf(
  node: ts.ForOfStatement,
  info: PackageInfo,
  checker: ts.TypeChecker,
  srcDir: string,
): void {
  // Initializer must be `const [nameVar, ...]`.
  if (!ts.isVariableDeclarationList(node.initializer)) return;
  if (node.initializer.declarations.length !== 1) return;
  const bindingDecl = node.initializer.declarations[0];
  if (!ts.isArrayBindingPattern(bindingDecl.name) || bindingDecl.name.elements.length < 1) return;
  const firstBinding = bindingDecl.name.elements[0];
  if (!ts.isBindingElement(firstBinding) || !ts.isIdentifier(firstBinding.name)) return;
  const nameVar = firstBinding.name.text;

  // Iterable: [...] or [...] as const.
  let iterable = node.expression;
  if (ts.isAsExpression(iterable)) iterable = iterable.expression;
  if (!ts.isArrayLiteralExpression(iterable)) return;

  // Each element must be an array literal whose first element is a string literal.
  // The tuple's second element is the function bound to that name, so each
  // entry carries its own arity rather than sharing an empty list.
  const entries: { name: string; params: ParamInfo[] }[] = [];
  for (const el of iterable.elements) {
    if (!ts.isArrayLiteralExpression(el) || el.elements.length < 1) return;
    const first = el.elements[0];
    if (!ts.isStringLiteral(first)) return;
    const fn = el.elements[1];
    entries.push({ name: first.text, params: fn ? paramsOfDescriptorValue(fn, checker) : [] });
  }
  if (entries.length === 0) return;

  // Find `Object.defineProperty(Cls.prototype, nameVar, { value: ... })` in body.
  if (!ts.isBlock(node.statement)) return;
  let classInfo: ClassInfo | null = null;
  for (const stmt of node.statement.statements) {
    if (!ts.isExpressionStatement(stmt)) continue;
    const expr = stmt.expression;
    if (!ts.isCallExpression(expr)) continue;
    if (!ts.isPropertyAccessExpression(expr.expression)) continue;
    const pa = expr.expression;
    if (!ts.isIdentifier(pa.expression) || pa.expression.text !== "Object") continue;
    if (!ts.isIdentifier(pa.name) || pa.name.text !== "defineProperty") continue;
    if (expr.arguments.length < 3) continue;
    const [target, propNameExpr, descriptor] = expr.arguments;
    if (!ts.isIdentifier(propNameExpr) || propNameExpr.text !== nameVar) continue;
    if (!ts.isObjectLiteralExpression(descriptor)) continue;
    if (!definePropertyValue(descriptor)) continue;
    classInfo = classInfoForPrototype(target, info, checker, srcDir);
    break;
  }
  if (!classInfo) return;

  const line = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
  for (const entry of entries) {
    pushDefinePropertyMethod(classInfo, entry.name, line, entry.params);
  }
}

/**
 * Resolve a relative module specifier (e.g. "./migration-errors.js")
 * against a file's relative path. Returns the resolved file's path
 * in the same POSIX-normalized form used as PackageInfo keys, or
 * null if the specifier doesn't target a local file. Caller must
 * already have POSIX-normalized `fromRel`.
 */
/**
 * Extract file-local (non-exported) function helpers from a top-level
 * statement. These map to Rails private methods under the project's
 * mixin convention (CLAUDE.md): file-local helpers next to the class
 * that owns the Rails port. Returns one MethodInfo per helper found,
 * each tagged `internal: true` so `--privates` mode picks them up and
 * public mode filters them out.
 *
 * Handles two shapes:
 *   - `function helper(...) {}`
 *   - `const helper = (...) => {}` / `const helper = function (...) {}`
 *
 * Helpers whose body is just `throw new NotImplementedError(...)` are
 * skipped: they satisfy parity:api's name match but contribute no
 * behavior, and Rails reserves NotImplementedError for abstract methods
 * subclasses must override — they should not inflate the privates score.
 *
 * Caller must already have ensured `node` is not exported.
 */
/**
 * Params of the function an identifier / property-access reference points at,
 * or null when the expression isn't callable. Mirrors the alias resolution the
 * named-export path does for `export { foo }` so that a binding like
 * `isReadonlyAttribute: readonlyAttributeQ` reports the target's real arity
 * instead of an empty list. Returns `[]` for a callable with no reachable
 * declaration (a synthesized/ambient signature), which is what the pre-alias
 * behavior recorded.
 */
export function paramsOfCallableRef(
  expr: ts.Expression,
  checker: ts.TypeChecker,
): ParamInfo[] | null {
  const signatures = checker.getTypeAtLocation(expr).getCallSignatures();
  if (signatures.length === 0) return null;
  // An overloaded target exposes one signature per overload; take the widest so
  // the recorded arity spans every call the alias admits rather than silently
  // truncating to whichever overload was declared first.
  const widest = signatures.reduce((a, b) => (b.parameters.length > a.parameters.length ? b : a));
  const decl = widest.declaration;
  return decl && ts.isFunctionLike(decl) ? extractParameters(decl.parameters) : [];
}

/**
 * The Ruby calls a declaration's leading JSDoc tags as deliberately not made
 * (`@missingRailsCall <call> — <reason>`), or undefined when it carries none.
 *
 * Read from the RAW comment text through the shared `suppressedCallsIn` parser
 * rather than `ts.getJSDocTags`, so the tag means exactly what parity:api:build and
 * parity:api:reasons already mean by it — including the empty-reason contract (a bare
 * tag throws here too) and the continuation rules that keep a Ruby ivar in the
 * reason prose from re-parsing as a tag boundary.
 *
 * Called from every extraction path that records a `calls` array: class
 * members (methods, constructor, accessors), object-literal members, top-level
 * `export function` declarations, and the named-export-list path — where a
 * RENAMED alias (`export { foo as bar }`) is its own surface entry and so
 * reads a tag written on the specifier, exactly as `noRailsEquivalentReason`
 * does. The paths that record no call-set (namespace and interface members,
 * the mixin pseudo-module's constructor) need no wiring: `checkCalls` skips a
 * pair with no TS call-set, so a call there is never flagged, never tagged by
 * parity:api:build, and has nothing to suppress.
 *
 * `fileHasMissingRailsCallTag` is declared with the imports, not next to this
 * function: a worker thread runs the whole extraction from the
 * `!isMainThread` block during module evaluation, so a `const` declared
 * further down the file is still in its temporal dead zone when this runs.
 */
export function missingRailsCallTags(node: ts.Node): string[] | undefined {
  return taggedCallsOn(node, MISSING_RAILS_CALL_TAG, fileHasMissingRailsCallTag, suppressedCallsIn);
}

/**
 * The Ruby calls a declaration's JSDoc tags as deliberately made with a
 * different argument list (`@missingRailsArgs <call> — <reason>`, RFC 0099), or
 * undefined when it carries none. The call-ARGUMENT twin of
 * {@link missingRailsCallTags}, read the same way and recorded at the same
 * extraction sites; compare.ts's `checkCallArgs` is what makes it load-bearing.
 */
export function missingRailsArgsTags(node: ts.Node): string[] | undefined {
  return taggedCallsOn(
    node,
    MISSING_RAILS_ARGS_TAG,
    fileHasMissingRailsArgsTag,
    suppressedArgCallsIn,
  );
}

/**
 * The reasons behind {@link missingRailsCallTags}' suppressions, keyed by Ruby
 * call — the artifact half of the permanence report (RFC 0099): a receipt's
 * `PERMANENT` / `CONVERGEABLE` claim is only separable downstream if the reason
 * that makes it travels with the suppression.
 */
export function missingRailsCallTagReasons(node: ts.Node): Record<string, string> | undefined {
  return taggedReasonsOn(
    node,
    MISSING_RAILS_CALL_TAG,
    fileHasMissingRailsCallTag,
    suppressedCallReasonsIn,
  );
}

/** The call-ARGUMENT twin of {@link missingRailsCallTagReasons}. */
export function missingRailsArgsTagReasons(node: ts.Node): Record<string, string> | undefined {
  return taggedReasonsOn(
    node,
    MISSING_RAILS_ARGS_TAG,
    fileHasMissingRailsArgsTag,
    suppressedArgReasonsIn,
  );
}

/** The shared read: the last leading `/** ... *\/` comment, parsed by the
 *  family's parser, with a per-file fast path off the tag's raw text. */
function taggedCallsOn(
  node: ts.Node,
  tag: string,
  seen: WeakMap<ts.SourceFile, boolean>,
  parse: (comment: string, origin: { fileName: string; startLine: number }) => string[],
): string[] | undefined {
  const calls = taggedCommentOf(node, tag, seen, parse);
  return calls !== undefined && calls.length > 0 ? calls : undefined;
}

/** {@link taggedCallsOn} for the call → reason map; empty means untagged. */
function taggedReasonsOn(
  node: ts.Node,
  tag: string,
  seen: WeakMap<ts.SourceFile, boolean>,
  parse: (
    comment: string,
    origin: { fileName: string; startLine: number },
  ) => Record<string, string>,
): Record<string, string> | undefined {
  const reasons = taggedCommentOf(node, tag, seen, parse);
  return reasons !== undefined && Object.keys(reasons).length > 0 ? reasons : undefined;
}

/** Find the declaration's tag-bearing JSDoc and hand it to `parse`. */
function taggedCommentOf<T>(
  node: ts.Node,
  tag: string,
  seen: WeakMap<ts.SourceFile, boolean>,
  parse: (comment: string, origin: { fileName: string; startLine: number }) => T,
): T | undefined {
  const sf = node.getSourceFile();
  let present = seen.get(sf);
  if (present === undefined) {
    present = sf.text.includes(tag);
    seen.set(sf, present);
  }
  if (!present) return undefined;
  const ranges = ts.getLeadingCommentRanges(sf.text, node.getFullStart()) ?? [];
  const range = ranges.filter((r) => sf.text.slice(r.pos, r.pos + 3) === "/**").at(-1);
  if (!range) return undefined;
  const comment = sf.text.slice(range.pos, range.end);
  if (!comment.includes(tag)) return undefined;
  return parse(comment, {
    fileName: sf.fileName,
    startLine: sf.getLineAndCharacterOfPosition(range.pos).line + 1,
  });
}

/**
 * True when a declaration's leading JSDoc carries an `@internal` tag. An
 * exported top-level function has no `private`/`protected` modifier to carry
 * the "wiring seam, not Rails-facing surface" signal (CONTRIBUTING.md), so
 * the tag is its only marker; consumers filter on `internal: true`.
 */
export function hasInternalJsDocTag(node: ts.Node): boolean {
  return ts
    .getJSDocTags(node)
    .some((tag) => tag.tagName.text === "internal" && isLineLeadingJsDocTag(tag));
}

/**
 * Whether a declaration's `@internal` JSDoc tag confers `internal: true`.
 *
 * `@internal` keeps its TypeDoc meaning, but a declaration that ALSO carries
 * `@noRailsEquivalent` has a receipt for being extra surface, and RFC 0121
 * makes that receipt win: the member re-enters the measured surface so
 * `parity:api:extra` scores it `Allowed` (PERMANENT / CONVERGEABLE) instead of
 * dropping it unmeasured. Only the JSDoc tag yields — a real TS
 * `private`/`protected` modifier or a `#` identifier still confers `internal`
 * unconditionally, and every call site keeps that half of the disjunction.
 */
export function internalJsDocTagApplies(node: ts.Node): boolean {
  return hasInternalJsDocTag(node) && noRailsEquivalentReason(node) === undefined;
}

/**
 * Reason prose of a declaration's `@noRailsEquivalent` tag, or undefined when
 * the tag is absent. Unlike `@internal` (which removes the method from the
 * compared surface), this tag keeps the method counted and justifies it as
 * deliberate trails-only surface — extra-surface.ts reports it as allowlisted.
 * Read on members, statements and properties, and on class / interface /
 * namespace declarations (where it lands on `ClassInfo.noRailsEquivalent`) —
 * the latter is the only inline form available to an extra whose declaration
 * is the extra name itself, and on an `interface` it covers the members too
 * (see `collectTaggedEntries` in extra-surface.ts).
 * Continuation lines belong to the tag and are joined into one line; the prose
 * is otherwise preserved verbatim. An empty reason is a hard error: the tag is
 * the only thing standing between a name and the extra-surface count, so an
 * unjustified one would suppress drift with no argument for it (RFC 0080).
 * The family's empty-reason contract (shared with `@missingRailsCall`) is
 * stated in docs/infrastructure/api-build-stub-generation-plan.md.
 */
export function noRailsEquivalentReason(node: ts.Node): string | undefined {
  for (const tag of ts.getJSDocTags(node)) {
    if (tag.tagName.text !== "noRailsEquivalent" || !isLineLeadingJsDocTag(tag)) continue;
    const reason = (ts.getTextOfJSDocComment(tag.comment) ?? "").replace(/\s+/g, " ").trim();
    if (reason === "") {
      const sf = node.getSourceFile();
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      throw new Error(
        `@noRailsEquivalent needs a reason: ${sf.fileName}:${line} — ` +
          "state why this surface has no Rails counterpart.",
      );
    }
    const sf = node.getSourceFile();
    const line = sf.getLineAndCharacterOfPosition(tag.getStart()).line + 1;
    const proseTag = proseTagAfter(tag);
    if (proseTag !== undefined) {
      throw new Error(
        `@noRailsEquivalent reason is truncated by a bare \`@${proseTag.name}\` in its ` +
          `prose: ${sf.fileName}:${line} — TypeScript parses it as a real JSDoc tag, ` +
          "so the reason is cut short and the declaration can drop out of the " +
          "compared surface entirely. Reword the prose to avoid the tag form" +
          (proseTag.lineLeading
            ? `, or — if the \`@${proseTag.name}\` is deliberate — move it above ` +
              "`@noRailsEquivalent`, which every deliberate tag of its kind must precede."
            : "."),
      );
    }
    return reason;
  }
  return undefined;
}

/**
 * Reason prose of a FILE-level `@noRailsEquivalent` tag, or undefined when the
 * file carries none.
 *
 * The declaration-level tag answers "this NAME has no Rails counterpart". Some
 * whole files are in that position — `better-sqlite3-adapter.ts` exists because
 * the JS ecosystem has several interchangeable SQLite clients where Ruby binds
 * one gem — and writing the same reason on every declaration in them is pure
 * repetition (RFC 0072). The file-level form states it once.
 *
 * Two placements carry it, and both are ones TypeScript does NOT bind to a
 * declaration:
 *
 *   - a block above the IMPORTS, which TypeScript binds to that first import; and
 *   - a DETACHED block — one separated from whatever follows it by a blank line
 *     — which TypeScript binds to nothing at all.
 *
 * The invariant both preserve is the same: a block written directly ABOVE a
 * declaration is that declaration's own doc block (`noRailsEquivalentReason`
 * already reads it there), and reading it as file-level too would silently
 * widen every such tag into a blanket. The blank line is what separates the two
 * cases, which is why an import-less file could not carry the tag at all before
 * RFC 0121 — `temporal-tag.ts` and `ruby-truthy.ts` have no runtime imports by
 * design and nothing to hang it on.
 *
 * Both placements reach the SAME parse as the declaration-level tag, and so
 * inherit both of its hard errors: an empty reason, and a reason truncated by a
 * bare `@word` in its prose. A claim that could be silently cut short would not
 * be a checked one. The detached path gets there by re-parsing the file text up
 * to the end of the block with a synthetic declaration appended, so the tag is
 * read off a real node — the file name and line numbers in either error still
 * point at the real source.
 */
export function fileLevelNoRailsEquivalentReason(sourceFile: ts.SourceFile): string | undefined {
  const first = sourceFile.statements[0];
  if (first === undefined) return undefined;
  if (ts.isImportDeclaration(first)) return noRailsEquivalentReason(first);
  const detached = detachedLeadingJsDoc(sourceFile, first);
  if (detached === undefined) return undefined;
  const text = `${sourceFile.text.slice(0, detached.end)}\nexport const __fileLevelTag = 0;\n`;
  const reparsed = ts.createSourceFile(sourceFile.fileName, text, ts.ScriptTarget.Latest, true);
  const anchor = reparsed.statements[reparsed.statements.length - 1];
  return anchor === undefined ? undefined : noRailsEquivalentReason(anchor);
}

/**
 * The last JSDoc block in `first`'s leading trivia that a blank line separates
 * from what follows it — the detached form of the file-level tag.
 *
 * Walking from the end is what lets a file carry both: a detached overview
 * block AND a doc block bound to the first declaration. The first range that is
 * followed by a blank line is the detached one; anything after it abuts the
 * declaration and belongs to it.
 */
function detachedLeadingJsDoc(
  sourceFile: ts.SourceFile,
  first: ts.Statement,
): ts.CommentRange | undefined {
  const text = sourceFile.text;
  const ranges = ts.getLeadingCommentRanges(text, first.getFullStart()) ?? [];
  if (ranges.length === 0) return undefined;
  const followedBy = [...ranges.slice(1).map((r) => r.pos), first.getStart(sourceFile)];
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i];
    if (!text.startsWith("/**", range.pos)) continue;
    const gap = text.slice(range.end, followedBy[i]);
    // Two newlines is one blank line: the one ending the comment's own line and
    // the one ending the blank line itself.
    if ((gap.match(/\n/g) ?? []).length >= 2) return range;
  }
  return undefined;
}

/**
 * The first JSDoc tag that follows `tag` in the same comment and is a bare
 * `@word` from the reason prose rather than a deliberate tag. TypeScript parses
 * either shape as a real tag, which silently truncates the reason (and, for
 * `@internal`, drops the declaration from the extracted surface).
 *
 * A mid-line tag is prose by construction. A *line-leading* one is textually
 * identical to a deliberate tag, so it is judged by name: the structural tags
 * in `TAGS_ALLOWED_AFTER_NO_RAILS_EQUIVALENT` are accepted, and anything else
 * — `@internal` above all — is prose that wrapped onto a continuation line.
 * That makes tag order load-bearing: a deliberate `@internal` must precede
 * `@noRailsEquivalent`. `lineLeading` rides along so the caller can point at the fix that
 * actually applies.
 */
function proseTagAfter(tag: ts.JSDocTag): { name: string; lineLeading: boolean } | undefined {
  const jsDoc = tag.parent;
  if (!ts.isJSDoc(jsDoc) || jsDoc.tags === undefined) return undefined;
  const text = jsDoc.getSourceFile().text;
  for (const other of jsDoc.tags) {
    if (other.getStart() <= tag.getStart()) continue;
    const name = other.tagName.text;
    const lineLeading = isLineLeading(text, other.getStart());
    if (!lineLeading || !TAGS_ALLOWED_AFTER_NO_RAILS_EQUIVALENT.has(name)) {
      return { name, lineLeading };
    }
  }
  return undefined;
}

/**
 * True when a JSDoc tag OPENS its line, by the shared `ANY_TAG_LINE`
 * (`missing-rails-call-tags.ts`) — the single anchor every tag reader here
 * shares with the raw-text parser.
 *
 * TypeScript parses `@word` as a real tag wherever it appears, including
 * mid-sentence inside another tag's reason prose. A curated
 * `@missingRailsCall` reason naming another tag family — the reasons arguing a
 * language shortcoming routinely name `@noRailsEquivalent` — therefore minted a
 * PHANTOM tag on the enclosing declaration, with whatever prose followed it as
 * its "reason" (hit for real in trails#6898). `missing-rails-call-tags.ts`
 * already ends a reason only at a LINE-leading tag, so without this the two
 * halves of one tag family disagreed about what counts as a tag; a mid-line
 * mention is prose to both of them now.
 */
export function isLineLeadingJsDocTag(tag: ts.JSDocTag): boolean {
  return isLineLeading(tag.getSourceFile().text, tag.getStart());
}

/**
 * True when a tag at `pos` opens its line, by `ANY_TAG_LINE` — the rule
 * `missing-rails-call-tags.ts` already applies to the raw comment text, shared
 * rather than re-derived, so `*   @foo` is a continuation to both readers.
 *
 * The one normalization is the `/**` opener of a one-line comment, rewritten to
 * the `*` frame `ANY_TAG_LINE` expects: `splitCommentLines` lifts a one-line
 * comment's tags the same way before the parser walks them.
 */
function isLineLeading(text: string, pos: number): boolean {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  return ANY_TAG_LINE.test(text.slice(lineStart, pos + 2).replace(/^(\s*)\/\*\*/, "$1*"));
}

/**
 * `@noRailsEquivalent` reason reached through a symbol, for object-literal
 * bindings (`{ foo }` / `{ foo: NS.bar }`) whose tag lives on the referenced
 * declaration rather than the property. Mirrors `isInternalSymbol`.
 */
function noRailsEquivalentOfSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): string | undefined {
  let target = symbol;
  if (target && target.flags & ts.SymbolFlags.Alias) target = checker.getAliasedSymbol(target);
  for (const d of target?.declarations ?? []) {
    const reason = noRailsEquivalentReason(d);
    if (reason !== undefined) return reason;
  }
  return undefined;
}

/**
 * True when `symbol` resolves to a declaration tagged `@internal`. A mixin
 * object re-exports one declaration under many hosts (ClassMethods, the Base
 * class surface, the index re-export), so the tag is read once at the
 * declaration rather than re-applied at every install site. Callers must pass
 * the *value* symbol — a shorthand's own name resolves to the property symbol.
 */
function isInternalSymbol(symbol: ts.Symbol | undefined, checker: ts.TypeChecker): boolean {
  let target = symbol;
  if (target && target.flags & ts.SymbolFlags.Alias) target = checker.getAliasedSymbol(target);
  return (target?.declarations ?? []).some((d) => internalJsDocTagApplies(d));
}

function isInternalCallableRef(expr: ts.Expression, checker: ts.TypeChecker): boolean {
  if (isInternalSymbol(checker.getSymbolAtLocation(expr), checker)) return true;
  // A property access resolves to the property, not the function it holds;
  // fall through to the call signature's declaration, as paramsOfCallableRef does.
  return checker
    .getTypeAtLocation(expr)
    .getCallSignatures()
    .some((sig) => sig.declaration != null && internalJsDocTagApplies(sig.declaration));
}

/**
 * Extract method names from an object literal — covers the four shapes
 * Rails-style mixin modules use:
 *
 *   export const Mod = {
 *     foo() { ... },                         // MethodDeclaration
 *     bar: function () { ... },              // PropertyAssignment + FunctionExpression
 *     baz: () => { ... },                    // PropertyAssignment + ArrowFunction
 *     qux,                                   // ShorthandPropertyAssignment
 *     quux: SomeNamespace.qux,               // PropertyAssignment + identifier/property-access (callable)
 *   };
 *
 * Used both for `export const Mod = { ... }` module discovery and for
 * resolving inline / property-access mod args to `include(Host, Mod)`.
 */
/**
 * The members of the class a mixin factory returns —
 * `export function Fallbacks(Superclass) { abstract class Fallbacks extends
 * Superclass { ... } return Fallbacks; }`
 * (packages/i18n/src/backend/fallbacks.ts, the port of Ruby's
 * `include I18n::Backend::Fallbacks`).
 *
 * The class is a local declaration inside the function body, so the top-level
 * walker never sees it, and the factory's declared return type hides whatever
 * the class marks `protected`. Reading the declaration recovers both, with
 * `extractClass` so member shape (arity, visibility, calls, JSDoc tags) matches
 * every other class in the manifest.
 */
export function factoryClassMembers(
  fn: ts.FunctionDeclaration,
  checker: ts.TypeChecker,
  file: string,
  srcDir?: string,
): MethodInfo[] {
  if (!fn.body) return [];
  const out: MethodInfo[] = [];
  for (const stmt of fn.body.statements) {
    if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
    const info = extractClass(stmt, checker, file, srcDir);
    if (!info) continue;
    out.push(...info.instanceMethods, ...info.classMethods);
  }
  return out;
}

/**
 * True for a SCREAMING_SNAKE binding — a Ruby *constant* holding data rather
 * than a `module`. Ruby module names are CamelCase, so constant case is the
 * discriminator between a mixin object literal and a method table such as
 * `ActiveSupport::Deprecation::DEFAULT_BEHAVIORS` (deprecation/behaviors.rb:13-63),
 * whose keys are Symbols no Ruby caller invokes as methods. Counting those keys
 * as ported members makes `isPortedWithArgs("raise")` true package-wide and
 * turns every Rails `raise` in the package into a call-mismatch row (RFC 0108).
 * An acronym module name (`TSE`) is also all-caps, so the underscore is required.
 */
export function isConstantCaseName(name: string): boolean {
  return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(name);
}

export function harvestObjectLiteralMethods(
  obj: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
  file: string,
): MethodInfo[] {
  const out: MethodInfo[] = [];
  for (const prop of obj.properties) {
    let mname: string | null = null;
    // Params are recoverable for inline method/function forms; identifier
    // references (`qux,` / `foo: NS.bar`) are resolved through the checker to
    // the target function's signature, so an alias-only binding still carries
    // the real arity into the candidate pool.
    let params: ParamInfo[] = [];
    let optionKeys: string[] | null | undefined;
    let calls: string[] | undefined;
    let callSeq: string[] | undefined;
    let callArgs: CallSite[] | undefined;
    let writer = false;
    // `{ qux }` / `{ foo: NS.bar }` — see MethodInfo.bodyless.
    let bodyless = false;
    let internal = internalJsDocTagApplies(prop);
    let noRailsEquivalent = noRailsEquivalentReason(prop);
    const propMissingRailsCalls = missingRailsCallTags(prop);
    const propMissingRailsArgs = missingRailsArgsTags(prop);
    const propMissingRailsCallReasons = missingRailsCallTagReasons(prop);
    const propMissingRailsArgsReasons = missingRailsArgsTagReasons(prop);
    if (ts.isMethodDeclaration(prop) && prop.name && ts.isIdentifier(prop.name)) {
      mname = prop.name.text;
      params = extractParameters(prop.parameters);
      optionKeys = extractOptionKeys(prop.parameters, checker);
      calls = extractCalls(prop.body);
      callSeq = extractCallSeq(prop.body);
      callArgs = extractCallArgs(prop.body);
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      mname = prop.name.text;
      bodyless = true;
      params = paramsOfCallableRef(prop.name, checker) ?? [];
      const valueSymbol = checker.getShorthandAssignmentValueSymbol(prop);
      internal = isInternalSymbol(valueSymbol, checker);
      noRailsEquivalent ??= noRailsEquivalentOfSymbol(valueSymbol, checker);
    } else if (ts.isGetAccessorDeclaration(prop) && prop.name && ts.isIdentifier(prop.name)) {
      mname = prop.name.text;
      calls = extractCalls(prop.body);
      callSeq = extractCallSeq(prop.body);
      callArgs = extractCallArgs(prop.body);
    } else if (ts.isSetAccessorDeclaration(prop) && prop.name && ts.isIdentifier(prop.name)) {
      mname = prop.name.text;
      writer = true;
      params = extractParameters(prop.parameters);
      calls = extractCalls(prop.body);
      callSeq = extractCallSeq(prop.body);
      callArgs = extractCallArgs(prop.body);
    } else if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const init = prop.initializer;
      if (ts.isFunctionExpression(init) || ts.isArrowFunction(init)) {
        mname = prop.name.text;
        params = extractParameters(init.parameters);
        optionKeys = extractOptionKeys(init.parameters, checker);
        calls = extractCalls(init.body);
        callSeq = extractCallSeq(init.body);
        callArgs = extractCallArgs(init.body);
      } else {
        // `foo: bar` / `foo: NS.bar` — count if the RHS resolves to a
        // callable. Catches `readAttributeForValidation:
        // _Validations.readAttributeForValidation` etc.
        const resolved = paramsOfCallableRef(init, checker);
        if (resolved) {
          mname = prop.name.text;
          bodyless = true;
          params = resolved;
          internal = isInternalCallableRef(init, checker);
          noRailsEquivalent ??= noRailsEquivalentOfSymbol(
            checker.getSymbolAtLocation(init),
            checker,
          );
        }
      }
    }
    if (!mname) continue;
    // Load-bearing, not a restatement of the branches above: for a shorthand or
    // `foo: NS.bar`, `internal` comes from the TARGET declaration while the
    // reason may have been written on the PROPERTY. Without this the entry
    // carries `internal: true` alongside a receipt the scorer then never reads.
    if (noRailsEquivalent !== undefined) internal = false;
    const line = prop.getSourceFile().getLineAndCharacterOfPosition(prop.getStart()).line + 1;
    out.push({
      name: mname,
      visibility: "public",
      params,
      line,
      file,
      ...(internal ? { internal: true } : {}),
      ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
      ...(optionKeys !== undefined ? { optionKeys } : {}),
      ...(calls !== undefined ? { calls } : {}),
      ...(callSeq !== undefined ? { callSeq } : {}),
      ...(callArgs !== undefined ? { callArgs } : {}),
      ...(propMissingRailsCalls !== undefined ? { missingRailsCalls: propMissingRailsCalls } : {}),
      ...(propMissingRailsArgs !== undefined ? { missingRailsArgs: propMissingRailsArgs } : {}),
      ...(propMissingRailsCallReasons !== undefined
        ? { missingRailsCallReasons: propMissingRailsCallReasons }
        : {}),
      ...(propMissingRailsArgsReasons !== undefined
        ? { missingRailsArgsReasons: propMissingRailsArgsReasons }
        : {}),
      ...(writer ? { writer: true } : {}),
      ...(bodyless ? { bodyless: true } : {}),
    });
  }
  return out;
}

export function extractFileLocalHelpers(
  node: ts.FunctionDeclaration | ts.VariableStatement,
  relPath: string,
): MethodInfo[] {
  const out: MethodInfo[] = [];

  if (ts.isFunctionDeclaration(node)) {
    if (!node.name) return out;
    if (isNotImplementedStub(node.body)) return out;
    const line = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const callArgs = extractCallArgs(node.body);
    out.push({
      name: node.name.text,
      visibility: "private",
      params: extractParameters(node.parameters),
      isStatic: false,
      line,
      file: relPath,
      internal: true,
      ...(callArgs !== undefined ? { callArgs } : {}),
    });
    return out;
  }

  for (const decl of node.declarationList.declarations) {
    if (!ts.isIdentifier(decl.name)) continue;
    const init = decl.initializer;
    if (!init) continue;
    if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) continue;
    if (isNotImplementedStub(init.body)) continue;
    const line = decl.getSourceFile().getLineAndCharacterOfPosition(decl.getStart()).line + 1;
    const callArgs = extractCallArgs(init.body);
    out.push({
      name: decl.name.text,
      visibility: "private",
      params: extractParameters(init.parameters),
      isStatic: false,
      line,
      file: relPath,
      internal: true,
      ...(callArgs !== undefined ? { callArgs } : {}),
    });
  }
  return out;
}

export function isNotImplementedStub(body: ts.Node | undefined): boolean {
  if (!body || !ts.isBlock(body)) return false;
  if (body.statements.length !== 1) return false;
  const stmt = body.statements[0];
  if (!ts.isThrowStatement(stmt)) return false;
  const expr = stmt.expression;
  if (!ts.isNewExpression(expr)) return false;
  const callee = expr.expression;
  return ts.isIdentifier(callee) && callee.text === "NotImplementedError";
}

export function resolveRelModule(fromRel: string, spec: string): string | null {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  const fromDir = path.posix.dirname(fromRel);
  // Strip .js / .ts extension; api-compare keys use .ts paths.
  const withoutExt = spec.replace(/\.(js|ts)$/, "");
  return path.posix.normalize(path.posix.join(fromDir, withoutExt)) + ".ts";
}

/**
 * Extract one exported class into a `ClassInfo`.
 *
 * `srcDir` is what lets the `extends` clause be recorded as a declaring file
 * (`superclassFile`) and not just a bare short name — sibling adapter
 * directories declare same-named classes, and a consumer given only the name
 * has to guess. Omit it (tests compiling a single virtual file) and the
 * superclass is still recorded by name, without the file.
 */
export function extractClass(
  node: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  file: string,
  srcDir?: string,
): ClassInfo | null {
  const name = node.name?.text;
  if (!name) return null;

  let superclass: string | undefined;
  let superclassFile: string | undefined;
  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        const expr = clause.types[0]?.expression;
        if (!expr) continue;
        superclass = expr.getText();
        if (srcDir !== undefined) {
          superclassFile = declaringFile(resolveDeclarationSymbol(checker, expr), srcDir);
        }
      }
    }
  }

  const instanceMethods: MethodInfo[] = [];
  const classMethods: MethodInfo[] = [];
  const includes: string[] = [];
  const extendsArr: string[] = [];
  // One-level helper-delegation resolution: `method → helper it delegates to`
  // (filled during the member loop) plus every same-class INSTANCE method's
  // direct calls, unioned in a post-pass below so a delegating method inherits
  // its helper's call-set. Keyed instance-only because `this.helper(...)`
  // dispatches to an instance method — a same-named static method has a separate
  // `Class.helper(...)` call site and must not be merged in.
  const delegations: { method: MethodInfo; helper: string }[] = [];
  const instanceCallsByName = new Map<string, string[]>();
  const delegationTargets = new Set<string>();

  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
        for (const type of clause.types) {
          includes.push(type.expression.getText());
        }
      }
    }
  }

  for (const member of node.members) {
    const memberName = getMemberName(member);
    const visibility = memberVisibility(member);
    const internal = visibility !== "public" || internalJsDocTagApplies(member);
    const noRailsEquivalent = noRailsEquivalentReason(member);
    const memberMissingRailsCalls = missingRailsCallTags(member);
    const memberMissingRailsArgs = missingRailsArgsTags(member);
    const memberMissingRailsCallReasons = missingRailsCallTagReasons(member);
    const memberMissingRailsArgsReasons = missingRailsArgsTagReasons(member);
    const tagged = {
      ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
      ...(memberMissingRailsCalls !== undefined
        ? { missingRailsCalls: memberMissingRailsCalls }
        : {}),
      ...(memberMissingRailsArgs !== undefined ? { missingRailsArgs: memberMissingRailsArgs } : {}),
      ...(memberMissingRailsCallReasons !== undefined
        ? { missingRailsCallReasons: memberMissingRailsCallReasons }
        : {}),
      ...(memberMissingRailsArgsReasons !== undefined
        ? { missingRailsArgsReasons: memberMissingRailsArgsReasons }
        : {}),
    };
    const isStatic = hasModifier(member, ts.SyntaxKind.StaticKeyword);
    const line = member.getSourceFile().getLineAndCharacterOfPosition(member.getStart()).line + 1;

    if (ts.isMethodDeclaration(member) && memberName) {
      const params = extractParameters(member.parameters);
      const optionKeys = extractOptionKeys(member.parameters, checker);
      // A host-class method whose whole body is a trivial delegation to a
      // same-named module function pulled in via a namespace import — e.g.
      // `buildJoins(arel) { _qm.buildJoins.call(this, arel); }` in relation.ts,
      // where the real port lives in relation/query-methods.ts — is a Rails-layout
      // wrapper (kept so parity:api finds the method where Rails declares it,
      // see PR #4676), NOT a second body. Its extracted call-set is just the
      // delegate name, so comparing it flags every Ruby call as phantom-missing
      // (double-attribution). Suppress the wrapper's call-set so the canonical
      // module-function candidate is the one compared; the method name still
      // counts for presence/arity parity.
      const suppressed = namespaceSelfDelegationName(member.body, checker) === memberName;
      const calls = suppressed ? undefined : extractCalls(member.body);
      const callSeq = suppressed ? undefined : extractCallSeq(member.body);
      const callArgs = suppressed ? undefined : extractCallArgs(member.body);
      const skeleton = suppressed ? undefined : extractSkeleton(member.body);
      const delegatesTo = delegationTargetName(member.body, memberName, name, checker);
      if (delegatesTo) delegationTargets.add(delegatesTo);
      const method: MethodInfo = {
        name: memberName,
        visibility,
        params,
        line,
        file,
        isStatic,
        ...(internal ? { internal: true } : {}),
        ...tagged,
        ...(optionKeys !== undefined ? { optionKeys } : {}),
        ...(calls !== undefined ? { calls } : {}),
        ...(callSeq !== undefined ? { callSeq } : {}),
        ...(callArgs !== undefined ? { callArgs } : {}),
        ...(skeleton !== undefined ? { skeleton } : {}),
        ...(delegatesTo !== undefined ? { delegatesTo } : {}),
      };
      // Only instance methods are reachable via `this.helper(...)` and only
      // instance methods delegate through it — record both on the instance side.
      if (!isStatic) {
        if (calls !== undefined) instanceCallsByName.set(memberName, calls);
        const helper = delegatedHelper(member.body);
        if (helper) delegations.push({ method, helper });
      }
      if (isStatic) {
        classMethods.push(method);
      } else {
        instanceMethods.push(method);
      }
    } else if (ts.isConstructorDeclaration(member)) {
      const params = extractParameters(member.parameters);
      // Constructor bodies are the home of bare `super(...)` chains — capture
      // calls here so calls-parity can flag a ported constructor that drops it.
      const calls = extractCalls(member.body);
      const callSeq = extractCallSeq(member.body);
      const callArgs = extractCallArgs(member.body);
      const skeleton = extractSkeleton(member.body);
      instanceMethods.push({
        name: "constructor",
        visibility,
        params,
        line,
        file,
        ...(internal ? { internal: true } : {}),
        ...tagged,
        ...(calls !== undefined ? { calls } : {}),
        ...(callSeq !== undefined ? { callSeq } : {}),
        ...(callArgs !== undefined ? { callArgs } : {}),
        ...(skeleton !== undefined ? { skeleton } : {}),
      });
      for (const param of member.parameters) {
        if (!ts.isIdentifier(param.name)) continue;
        const paramVisibility = parameterPropertyVisibility(param);
        if (paramVisibility === undefined) continue;
        instanceMethods.push({
          name: param.name.text,
          visibility: paramVisibility,
          params: [],
          line: param.getSourceFile().getLineAndCharacterOfPosition(param.getStart()).line + 1,
          file,
          isStatic: false,
          ...(paramVisibility !== "public" || internalJsDocTagApplies(param)
            ? { internal: true }
            : {}),
        });
      }
    } else if (ts.isGetAccessorDeclaration(member) && memberName) {
      const calls = extractCalls(member.body);
      const callSeq = extractCallSeq(member.body);
      const callArgs = extractCallArgs(member.body);
      const skeleton = extractSkeleton(member.body);
      const method: MethodInfo = {
        name: memberName,
        visibility,
        params: [],
        line,
        file,
        isStatic,
        ...(internal ? { internal: true } : {}),
        ...tagged,
        ...(calls !== undefined ? { calls } : {}),
        ...(callSeq !== undefined ? { callSeq } : {}),
        ...(callArgs !== undefined ? { callArgs } : {}),
        ...(skeleton !== undefined ? { skeleton } : {}),
      };
      if (isStatic) {
        classMethods.push(method);
      } else {
        instanceMethods.push(method);
      }
    } else if (ts.isSetAccessorDeclaration(member) && memberName) {
      const params = extractParameters(member.parameters);
      const calls = extractCalls(member.body);
      const callSeq = extractCallSeq(member.body);
      const callArgs = extractCallArgs(member.body);
      const skeleton = extractSkeleton(member.body);
      const method: MethodInfo = {
        name: memberName,
        visibility,
        params,
        line,
        file,
        isStatic,
        writer: true,
        ...(internal ? { internal: true } : {}),
        ...tagged,
        ...(calls !== undefined ? { calls } : {}),
        ...(callSeq !== undefined ? { callSeq } : {}),
        ...(callArgs !== undefined ? { callArgs } : {}),
        ...(skeleton !== undefined ? { skeleton } : {}),
      };
      if (isStatic) {
        classMethods.push(method);
      } else {
        instanceMethods.push(method);
      }
    } else if (ts.isPropertyDeclaration(member) && memberName) {
      // Public properties are like attr_reader/attr_accessor
      // Only record them if they're not readonly (readonly = getter only conceptually)
      const method: MethodInfo = {
        name: memberName,
        visibility,
        params: [],
        line,
        file,
        isStatic,
        ...(internal ? { internal: true } : {}),
        ...tagged,
      };
      if (isStatic) {
        classMethods.push(method);
      } else {
        instanceMethods.push(method);
      }
    }
  }

  // Post-pass: union each delegating method's helper call-set into its own
  // (one level — the helper's DIRECT calls only, no transitive chasing). The
  // helper's instantiations are already recorded as `constructor`, so a method
  // delegating to a one-line `new Foo(...)` helper still credits the ctor call.
  for (const { method, helper } of delegations) {
    const helperCalls = instanceCallsByName.get(helper);
    if (!helperCalls) continue;
    const merged = new Set([...(method.calls ?? []), ...helperCalls]);
    method.calls = [...merged].sort();
  }

  const noRailsEquivalent = noRailsEquivalentReason(node);

  return {
    name,
    superclass,
    ...(superclassFile !== undefined ? { superclassFile } : {}),
    file,
    includes,
    extends: extendsArr,
    ...(delegationTargets.size > 0 ? { delegatesTo: [...delegationTargets].sort() } : {}),
    instanceMethods,
    classMethods,
    ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
  };
}

/**
 * Parameters of a property signature whose type has call signatures — the
 * `find: (id) => T` spelling of `find(id): T`. Resolved through the checker so
 * a property typed by an alias or a named function type reports the same arity
 * as the method spelling. Non-callable properties have no parameters.
 */
function propertySignatureParams(
  member: ts.PropertySignature,
  checker: ts.TypeChecker,
): ParamInfo[] {
  if (!member.type) return [];
  if (ts.isFunctionTypeNode(member.type)) return extractParameters(member.type.parameters);
  try {
    const signatures = checker.getTypeAtLocation(member.type).getCallSignatures();
    const decl = signatures[0]?.declaration;
    if (decl && ts.isFunctionLike(decl)) return extractParameters(decl.parameters);
  } catch {
    // Unresolvable type: fall back to no parameters, as for a plain property.
  }
  return [];
}

/**
 * Extract an interface as a ClassInfo.
 *
 * Member rule: every method signature AND every property signature counts,
 * callable or not. `find(id): T` and `find: (id) => T` are interchangeable in
 * TypeScript, so recording only method signatures would make a member's
 * visibility to parity:api / parity:api:extra depend on the author's syntax choice.
 * Non-callable properties count for the same reason class property
 * declarations do (see extractClass) — a Rails attr_reader ports as a plain
 * property, so skipping them would be its own divergence. A property whose
 * type has call signatures carries that signature's parameters, so arity
 * comparison sees the same thing for both spellings.
 */
function extractInterface(
  node: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  file: string,
  srcDir?: string,
): ClassInfo {
  const name = node.name.text;
  const instanceMethods: MethodInfo[] = [];
  const extendsArr: string[] = [];
  let extendsFiles: Record<string, string> | undefined;

  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        for (const type of clause.types) {
          const exprText = type.expression.getText();
          extendsArr.push(exprText);
          if (srcDir !== undefined) {
            const declFile = declaringFile(
              resolveDeclarationSymbol(checker, type.expression),
              srcDir,
            );
            if (declFile) extendsFiles = { ...(extendsFiles ?? {}), [exprText]: declFile };
          }

          // Resolve mapped/generic types (e.g. Included<typeof X>) via
          // the type checker so their computed properties appear as methods.
          try {
            const resolved = checker.getTypeAtLocation(type);
            for (const prop of resolved.getProperties()) {
              const propName = prop.getName();
              const propDecl = prop.declarations?.[0];
              const propFlags = propDecl !== undefined ? ts.getCombinedModifierFlags(propDecl) : 0;
              const propVisibility =
                propFlags & ts.ModifierFlags.Private
                  ? "private"
                  : propFlags & ts.ModifierFlags.Protected
                    ? "protected"
                    : "public";
              // Keep _-prefixed properties — Rails has public methods like _reflect_on_association
              const propType = checker.getTypeOfSymbolAtLocation(prop, type);
              const signatures = propType.getCallSignatures();
              if (signatures.length > 0) {
                // These entries carry the resolved declaration's tag, visibility
                // and `@internal` flag so a member declared in THIS file (a
                // mapped type over a local class, `Included<typeof X>`) is
                // scored the way that declaration is.
                // `getProperties()` returns protected and private members, and
                // the copy pushed below carries no modifier of its own.
                //
                // A member resolved from a base declared in ANOTHER file is that
                // file's surface, not this one's: `interface SchemaStatements
                // extends DatabaseAdapter {}` would otherwise re-score every
                // AbstractAdapter method here, where no tag can reach it — the
                // member's own file is where it matches, so a receipt written
                // there is stale, and the file-level form is refused for a file
                // that has a Rails counterpart. `declaredIn` is how
                // `collectTsFileNames` already skips exactly this, and this is
                // the promise its docblock makes ("no inherited surface").
                const propDeclFile =
                  srcDir !== undefined && propDecl !== undefined
                    ? path.relative(srcDir, propDecl.getSourceFile().fileName).replace(/\\/g, "/")
                    : undefined;
                const foreign = propDeclFile !== undefined && propDeclFile !== file;
                // Only an own member carries its tag here, the same split the
                // `__mixin` walker makes: a tag copied off a foreign base would
                // never match at this file and would read as stale on top of its
                // correct match on the declaring one.
                const noRailsEquivalent = foreign
                  ? undefined
                  : noRailsEquivalentOfSymbol(prop, checker);
                instanceMethods.push({
                  name: propName,
                  visibility: propVisibility,
                  params: [],
                  line: 0,
                  file,
                  ...(foreign ? { declaredIn: propDeclFile } : {}),
                  ...(propVisibility !== "public" ||
                  (propDecl !== undefined && internalJsDocTagApplies(propDecl))
                    ? { internal: true }
                    : {}),
                  ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
                });
              }
            }
          } catch {
            // If type resolution fails, fall back to extends-based resolution
          }
        }
      }
    }
  }

  for (const member of node.members) {
    const memberName = member.name && ts.isIdentifier(member.name) ? member.name.text : undefined;
    if (!memberName) continue;

    const line = member.getSourceFile().getLineAndCharacterOfPosition(member.getStart()).line + 1;

    if (ts.isMethodSignature(member)) {
      const noRailsEquivalent = noRailsEquivalentReason(member);
      instanceMethods.push({
        name: memberName,
        visibility: "public",
        params: member.parameters ? extractParameters(member.parameters) : [],
        line,
        file,
        bodyless: true,
        ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
      });
    } else if (ts.isPropertySignature(member)) {
      const noRailsEquivalent = noRailsEquivalentReason(member);
      instanceMethods.push({
        name: memberName,
        visibility: "public",
        params: propertySignatureParams(member, checker),
        line,
        file,
        bodyless: true,
        ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
      });
    }
  }

  const noRailsEquivalent = noRailsEquivalentReason(node);

  return {
    name,
    file,
    includes: [],
    extends: extendsArr,
    ...(extendsFiles !== undefined ? { extendsFiles } : {}),
    instanceMethods,
    classMethods: [],
    isInterface: true,
    interfaceMembers: instanceMethods.map((m) => m.name),
    ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
  };
}

function extractNamespace(
  node: ts.ModuleDeclaration,
  checker: ts.TypeChecker,
  file: string,
): ClassInfo {
  const name = node.name.text;
  const instanceMethods: MethodInfo[] = [];

  if (node.body && ts.isModuleBlock(node.body)) {
    for (const stmt of node.body.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name && isExported(stmt)) {
        const line = stmt.getSourceFile().getLineAndCharacterOfPosition(stmt.getStart()).line + 1;
        const noRailsEquivalent = noRailsEquivalentReason(stmt);
        instanceMethods.push({
          name: stmt.name.text,
          visibility: "public",
          params: extractParameters(stmt.parameters),
          line,
          file,
          ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
        });
      } else if (ts.isVariableStatement(stmt) && isExported(stmt)) {
        const line = stmt.getSourceFile().getLineAndCharacterOfPosition(stmt.getStart()).line + 1;
        // JSDoc attaches to the statement, not the individual declarator.
        const stmtReason = noRailsEquivalentReason(stmt);
        for (const decl of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue;
          const init = decl.initializer;
          let params: ParamInfo[] = [];
          let isFunctionLike = false;
          if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
            isFunctionLike = true;
            params = extractParameters(init.parameters);
          } else if (init) {
            const type = checker.getTypeAtLocation(init);
            const signatures = type.getCallSignatures();
            if (signatures.length > 0) {
              isFunctionLike = true;
              const sigDecl = signatures[0].declaration;
              if (sigDecl && ts.isFunctionLike(sigDecl)) {
                params = extractParameters(sigDecl.parameters);
              }
            }
          }
          if (isFunctionLike) {
            const noRailsEquivalent = noRailsEquivalentReason(decl) ?? stmtReason;
            instanceMethods.push({
              name: decl.name.text,
              visibility: "public",
              params,
              line,
              file,
              ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
            });
          }
        }
      }
    }
  }

  const noRailsEquivalent = noRailsEquivalentReason(node);

  return {
    name,
    file,
    includes: [],
    extends: [],
    instanceMethods,
    classMethods: [],
    declaredAsNamespace: true,
    ...(noRailsEquivalent !== undefined ? { noRailsEquivalent } : {}),
  };
}

/** Classify a TS initializer/RHS as a literal (mirrors Ruby `literal_value`);
 *  undefined for non-literals, `[]`/`{}` only when empty. */
export function tsLiteralValue(init: ts.Expression): LiteralValue | undefined {
  if (ts.isStringLiteralLike(init)) return { kind: "string", value: init.text };
  if (ts.isNumericLiteral(init)) {
    const t = init.getText();
    return { kind: t.includes(".") ? "float" : "int", value: t };
  }
  if (init.kind === ts.SyntaxKind.TrueKeyword) return { kind: "bool", value: true };
  if (init.kind === ts.SyntaxKind.FalseKeyword) return { kind: "bool", value: false };
  if (init.kind === ts.SyntaxKind.NullKeyword) return { kind: "nil" };
  if (ts.isIdentifier(init) && init.text === "undefined") return { kind: "nil" };
  if (ts.isArrayLiteralExpression(init) && init.elements.length === 0) return { kind: "array" };
  if (ts.isObjectLiteralExpression(init) && init.properties.length === 0) return { kind: "hash" };
  // A negative literal `-1` is a prefix-unary minus over a numeric literal; fold
  // the sign back in so it compares against Ruby's `[:unary, :-@, [:@int]]`.
  if (
    ts.isPrefixUnaryExpression(init) &&
    init.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(init.operand)
  ) {
    const t = init.operand.getText();
    return { kind: t.includes(".") ? "float" : "int", value: `-${t}` };
  }
  return undefined; // non-literal
}

/** Literal constants for one file: exported `const NAME` and public `static
 *  readonly NAME` literals (excl. `let`/`var` + private members). Mirrors Ruby. */
export function extractFileConstants(sourceFile: ts.SourceFile): Record<string, LiteralValue> {
  const out: Record<string, LiteralValue> = {};
  const recordDecl = (nameNode: ts.PropertyName | ts.BindingName, init?: ts.Expression): void => {
    if (!init || !ts.isIdentifier(nameNode)) return;
    const lit = tsLiteralValue(init);
    if (lit) out[nameNode.text] = lit;
  };
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isVariableStatement(node) && isExported(node)) {
      if (!(node.declarationList.flags & ts.NodeFlags.Const)) return; // `let`/`var` aren't constants
      for (const decl of node.declarationList.declarations) recordDecl(decl.name, decl.initializer);
    } else if (ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        if (!ts.isPropertyDeclaration(member) || !member.name) continue;
        if (!hasModifier(member, ts.SyntaxKind.StaticKeyword)) continue;
        if (!hasModifier(member, ts.SyntaxKind.ReadonlyKeyword)) continue;
        if (memberVisibility(member) !== "public") continue; // skip internal constants
        recordDecl(member.name, member.initializer);
      }
    }
  });
  return out;
}

/** Collect relative-module renamed-import aliases (`import { a as b }` → b→a). */
function collectImportAliases(sourceFile: ts.SourceFile): Map<string, string> {
  const aliases = new Map<string, string>();
  ts.forEachChild(sourceFile, (node) => {
    if (
      !ts.isImportDeclaration(node) ||
      !node.importClause?.namedBindings ||
      !ts.isNamedImports(node.importClause.namedBindings) ||
      !ts.isStringLiteral(node.moduleSpecifier)
    ) {
      return;
    }
    const spec = node.moduleSpecifier.text;
    if (!spec.startsWith("./") && !spec.startsWith("../")) return;
    for (const el of node.importClause.namedBindings.elements) {
      if (el.propertyName && el.propertyName.text !== el.name.text) {
        aliases.set(el.name.text, el.propertyName.text);
      }
    }
  });
  return aliases;
}

/**
 * Collect the set of method names a body invokes — the TS counterpart of the
 * Ruby extractor's `calls` array (see extract-ruby-api.rb). For each
 * CallExpression we record the final identifier of the callee:
 * `this.runCallbacks(...)` → `runCallbacks`, `foo.bar()` → `bar`, `baz()` →
 * `baz`. Returns a sorted, de-duplicated list (undefined when empty), so the
 * call-set parity dimension in compare.ts can diff it against the Ruby side
 * without caring about call order or count.
 *
 * `X.call(...)` / `X.apply(...)` and renamed-import calls are additionally
 * resolved to the dispatched/original name (see the visit body) so indirect
 * invocations of a ported method still count toward its call set.
 *
 * A call made under a `!` is recorded TWICE — plainly and with the
 * NEGATED_CALL_PREFIX marker (`includes` + `!includes`) — so a consumer that
 * cares about the negation can see it while every consumer that tests
 * membership by plain name is unaffected. `partitionNegatedCalls` (compare.ts)
 * splits the two populations back apart.
 *
 * Wired into method/function bodies (class methods, exported + export-list
 * functions, object-literal mixin methods). Get/set accessor bodies are not
 * captured: the calls-parity check only acts on SIGNIFICANT_CALLS, none of
 * which are accessor-shaped, so accessors would contribute no signal.
 */
// Whether a property access is the write target of an assignment — either a
// direct LHS (`this.foo = x`) or nested inside a destructuring-assignment LHS
// (`[this.foo] = arr`, `({ a: this.foo } = obj)`). In destructuring the LHS is
// an array/object literal (not a binding pattern, since this is an assignment
// not a declaration), so walk up through those literal shapes until reaching the
// enclosing `=` BinaryExpression whose `left` is the access (or its container).
// A write mirrors Ruby's writer send `foo=`, not the reader `foo`, so callers
// skip crediting it. Compound assignments (`+=`, `||=`) are intentionally NOT
// matched: `self.foo += x` desugars to `self.foo = self.foo + x`, which really
// does call the reader.
function isAssignmentWriteTarget(access: ts.PropertyAccessExpression): boolean {
  let node: ts.Node = access;
  let parent = node.parent as ts.Node | undefined;
  while (parent !== undefined) {
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      return parent.left === node;
    }
    // Ascend only through the node shapes a destructuring-assignment LHS is
    // built from; anything else means `access` is in a read position.
    if (
      ts.isArrayLiteralExpression(parent) ||
      ts.isObjectLiteralExpression(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isShorthandPropertyAssignment(parent) ||
      ts.isSpreadAssignment(parent) ||
      ts.isSpreadElement(parent) ||
      ts.isParenthesizedExpression(parent)
    ) {
      node = parent;
      parent = node.parent;
      continue;
    }
    return false;
  }
  return false;
}

// Whether an expression is the operand of a logical negation — `!xs.includes(y)`,
// `!(set.has(k))`. Ruby's negating Enumerable idioms (`none?`, `exclude?`) port to
// a negated JS call, and the call ratchet must tell that from the inverted
// condition (see NEGATED_CALL_PREFIX). Two shapes are deliberately NOT negations:
// `!a && b.has(x)` (the `!` binds to `a`), and `!!x`, which is a truthiness cast.
function isNegatedOperand(expr: ts.Node): boolean {
  let node: ts.Node = expr;
  let parent = node.parent as ts.Node | undefined;
  while (parent !== undefined && ts.isParenthesizedExpression(parent)) {
    node = parent;
    parent = node.parent;
  }
  if (
    parent === undefined ||
    !ts.isPrefixUnaryExpression(parent) ||
    parent.operator !== ts.SyntaxKind.ExclamationToken ||
    parent.operand !== node
  ) {
    return false;
  }
  return !isNegatedOperand(parent);
}

/**
 * The same call names in SOURCE ORDER — the sequence the call-order comparison
 * reads (RFC 0084). `extractCalls` sorts, which is the right shape for a
 * membership test but erases the one signal a set diff cannot carry: Rails'
 * branch and call ORDER, which CLAUDE.md's "same branches, in the same order"
 * makes a first-class fidelity requirement. Deduplicated at first occurrence,
 * matching the Ruby extractor's `calls.uniq` (extract-ruby-api.rb:2043), so the
 * two sequences are directly comparable.
 */
function extractCallSeq(node: ts.Node | undefined): string[] | undefined {
  return collectCalls(node, true);
}

/**
 * Logical operators that token as `if`: each is a conditional reach, and Ruby's
 * `a || b` and the port's `const x = a; if (!x) b` are the same one.
 *
 * A hoisted function rather than a module-level `Set`, because the worker-thread
 * dispatch block at the top of this file runs before a `const` down here is
 * initialized and would read it in TDZ.
 */
function isSkeletonLogicalOp(kind: ts.SyntaxKind): boolean {
  switch (kind) {
    case ts.SyntaxKind.BarBarToken:
    case ts.SyntaxKind.AmpersandAmpersandToken:
    case ts.SyntaxKind.QuestionQuestionToken:
    case ts.SyntaxKind.BarBarEqualsToken:
    case ts.SyntaxKind.AmpersandAmpersandEqualsToken:
    case ts.SyntaxKind.QuestionQuestionEqualsToken:
      return true;
    default:
      return false;
  }
}

/**
 * The body as an ordered CONTROL + call skeleton — the stream a call-SEQUENCE
 * comparison reads (RFC 0084). Neither `calls` nor `callSeq`
 * can stand in for it: both are deduplicated and neither records control flow,
 * so a dropped guard, an inverted branch, or a collaborator called once where
 * Rails calls it twice is invisible to them. Names are raw, as `calls` records
 * them — the Ruby↔TS conventions live in compare.ts. Signal only; nothing gates
 * on it yet.
 */
function extractSkeleton(node: ts.Node | undefined): string[] | undefined {
  if (!node) return undefined;
  const tokens: string[] = [];
  const visit = (n: ts.Node): void => {
    switch (n.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.SwitchStatement:
        tokens.push("if");
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const bin = n as ts.BinaryExpression;
        if (isSkeletonLogicalOp(bin.operatorToken.kind)) {
          visit(bin.left);
          tokens.push("if");
          visit(bin.right);
          return;
        }
        break;
      }
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.ForInStatement:
        tokens.push("loop");
        break;
      case ts.SyntaxKind.TryStatement:
        tokens.push("try");
        break;
      case ts.SyntaxKind.ThrowStatement:
        tokens.push("throw");
        break;
      case ts.SyntaxKind.NewExpression: {
        const ctor = (n as ts.NewExpression).expression;
        tokens.push(
          `new:${
            ts.isIdentifier(ctor)
              ? ctor.text
              : ts.isPropertyAccessExpression(ctor)
                ? ctor.name.text
                : "?"
          }`,
        );
        break;
      }
      // Receiver before the call it receives, matching
      // extract-ruby-api.rb#walk_for_skeleton; the two orders must agree.
      case ts.SyntaxKind.CallExpression: {
        const call = n as ts.CallExpression;
        const callee = call.expression;
        if (ts.isIdentifier(callee)) {
          tokens.push(`ref:${callee.text}`);
        } else if (ts.isPropertyAccessExpression(callee)) {
          visit(callee.expression);
          tokens.push(`ref:${callee.name.text}`);
        } else if (callee.kind === ts.SyntaxKind.SuperKeyword) {
          tokens.push("ref:super");
        } else {
          visit(callee);
        }
        call.arguments.forEach(visit);
        return;
      }
      case ts.SyntaxKind.PropertyAccessExpression: {
        const access = n as ts.PropertyAccessExpression;
        visit(access.expression);
        if (!isAssignmentWriteTarget(access)) {
          tokens.push(`ref:${access.name.text}`);
        }
        return;
      }
      case ts.SyntaxKind.ElementAccessExpression: {
        const access = n as ts.ElementAccessExpression;
        visit(access.expression);
        tokens.push("ref:get");
        visit(access.argumentExpression);
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  // The body ITSELF, not just its children: an expression-bodied arrow
  // (`= (x) => where(x)`) IS the call site, and Ruby's walk_for_skeleton covers it.
  visit(node);
  return tokens.length === 0 ? undefined : tokens;
}

function extractCalls(node: ts.Node | undefined): string[] | undefined {
  const names = collectCalls(node);
  return names === undefined ? undefined : [...names].sort();
}

/**
 * Every SYNTACTIC call site in the body, in source order, with its argument
 * descriptors (RFC 0025 `## Call-argument fidelity`, RFC 0095 §Design). The
 * Ruby half is extract-ruby-api.rb#collect_call_args and the descriptor grammar
 * is shared: `id:` / `num:` / `str:` / `bool:` / `nil` / `sym:` / `const:` /
 * `call:` / `kwargs{k=…}`, plus the OPAQUE spellings (`?`, `array`, `hash`,
 * `str-interp`, `binop:<op>`, `unary<desc>`, `ternary`, `*splat`) that tell the
 * comparator to skip the site rather than guess at it, and the per-site
 * `splat` / `block` flags.
 *
 * Kept beside `collectCalls` rather than folded into it: that stream credits a
 * bare property READ (`this.joinsValues`) as a call, because Ruby has no field
 * access. A read is not a call site and carries no argument list, so recording
 * it here would make "the TS body has no comparable site" indistinguishable
 * from "the TS body calls it with zero arguments" — which manufactures rows.
 */
function extractCallArgs(node: ts.Node | undefined): CallSite[] | undefined {
  if (!node) return undefined;
  const sites: CallSite[] = [];
  walkForCallArgs(node, sites);
  return sites.length === 0 ? undefined : sites;
}

function walkForCallArgs(node: ts.Node, sites: CallSite[]): void {
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      recordCallSite(n, sites, visit);
      return;
    }
    ts.forEachChild(n, visit);
  };
  // The body ITSELF, not just its children: an expression-bodied arrow
  // (`= (x) => where(x)`) IS the call site, and Ruby's body walk covers it.
  visit(node);
}

/**
 * Terminal, like extract-ruby-api.rb#record_call_site: the receiver is walked,
 * then the site is emitted, then the arguments are walked — so `foo(bar(1))` is
 * exactly two sites in source order, and no node is recorded twice.
 */
function recordCallSite(
  call: ts.CallExpression | ts.NewExpression,
  sites: CallSite[],
  visit: (n: ts.Node) => void,
): void {
  const callee = call.expression;
  if (!ts.isIdentifier(callee) && callee.kind !== ts.SyntaxKind.SuperKeyword) visit(callee);

  const name = callSiteName(call);
  if (name !== undefined && !(ts.isNewExpression(call) && isThrownConstruction(call))) {
    const flags: string[] = [];
    const args = describeArgs(call.arguments, flags);
    sites.push({ name, args, flags: [...new Set(flags)] });
  }

  call.arguments?.forEach(visit);
}

/**
 * `throw new Foo(msg)` — the operand of a `throw`, which Rails spells EITHER
 * `raise Foo, msg` (no `.new` call, and `raise` itself is filtered as noise on
 * the Ruby side) or `raise Foo.new(msg)` (a `new` call in that position). The
 * position is therefore ambiguous, exactly as a hoisted closure's calls are:
 * the ORDER stream drops the name rather than picking a side, since a
 * `throw` in an early guard would otherwise pin `constructor` at the front of
 * the sequence — deduplicated at first occurrence — ahead of the real `X.new`
 * the Rails body makes later, which is what the `order:constructor,…` rows
 * #6404 baselined actually were. The call SET is unaffected: whichever way
 * Rails spells the raise, an instantiation happens.
 *
 * The ARGUMENT stream drops it for the same reason, and drops it rather than
 * marking it uncomparable: an uncomparable site still occupies a pairing slot,
 * so Rails' `OpenSSL::Cipher.new(CIPHER_TYPE)` would go on consuming the guard
 * message instead of pairing with the real construction the TS body makes
 * later — the row would disappear and the comparison it should have made would
 * never happen.
 *
 * Only the throw's own operand is ambiguous: a `new` nested inside one
 * (`throw wrap(new Foo())`) has an unambiguous position.
 */
function isThrownConstruction(call: ts.NewExpression): boolean {
  const parent = call.parent;
  return parent !== undefined && ts.isThrowStatement(parent) && parent.expression === call;
}

/**
 * The site name, under the SAME filter extract-ruby-api.rb#call_site_name
 * applies (`:2385-2396`): a name starting with `_`, or with anything other than
 * a lowercase letter, is dropped. Ruby never emits such a site, so recording one
 * here manufactures a TS-only site that can never pair with the Ruby stream.
 */
function callSiteName(call: ts.CallExpression | ts.NewExpression): string | undefined {
  // `new Foo(...)` is Ruby's `Foo.new(...)`. TS has no method named `new`, so
  // `constructor` IS this site's raw TS spelling — the one conventions.ts:952
  // maps Ruby `new` onto, and the one `calls` / `callSeq` already record.
  if (ts.isNewExpression(call)) return "constructor";
  const callee = call.expression;
  if (callee.kind === ts.SyntaxKind.SuperKeyword) return "super";
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : undefined;
  if (name === undefined || name.startsWith("_") || !/^[a-z]/.test(name)) return undefined;
  return name;
}

/**
 * `X.call(this, …)` / `X.apply(this, …)` is the project's `this`-typed mixin
 * convention (CLAUDE.md "Module mixins"), and the call SET already credits the
 * dispatched `X` alongside the literal `call`/`apply` (see collectCalls). In
 * ARGUMENT position the site name alone reads as `call:call`, which can never
 * pair with Ruby's `call:x` for the same dispatch — so resolve it here too,
 * through the same import aliases.
 */
function dispatchedCallName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  const prop = callee.name.text;
  if (prop !== "call" && prop !== "apply") return undefined;
  if (!ts.isIdentifier(callee.expression)) return undefined;
  if (call.arguments[0]?.kind !== ts.SyntaxKind.ThisKeyword) return undefined;
  const name = currentImportAliases?.get(callee.expression.text) ?? callee.expression.text;
  if (name.startsWith("_") || !/^[a-z]/.test(name)) return undefined;
  return name;
}

function describeArgs(args: ts.NodeArray<ts.Expression> | undefined, flags: string[]): string[] {
  if (!args) return [];
  const out: string[] = [];
  for (const arg of args) {
    const expr = unwrapArg(arg);
    // Ruby drops a block (`each { … }`) and a block-pass (`&blk`) from the
    // argument list and flags the site instead; the port's callback argument is
    // the same thing, so it is flagged and dropped here too.
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
      flags.push("block");
      continue;
    }
    if (ts.isSpreadElement(expr)) {
      flags.push("splat");
      out.push("*splat");
      continue;
    }
    out.push(describeArg(expr, flags));
  }
  return out;
}

/** `await x`, `x as T`, `x!`, `(x)` and `x satisfies T` all describe as `x`. */
function unwrapArg(node: ts.Expression): ts.Expression {
  let expr = node;
  for (;;) {
    if (ts.isParenthesizedExpression(expr) || ts.isAwaitExpression(expr)) expr = expr.expression;
    else if (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) expr = expr.expression;
    else if (ts.isNonNullExpression(expr)) expr = expr.expression;
    else return expr;
  }
}

/**
 * Mirrors extract-ruby-api.rb#escape_descriptor_text: the four grammar
 * delimiters, so a string VALUE carrying one does not read as one. Rationale
 * and the inverse: call-args.ts#unescapeDescriptorText.
 */
function escapeDescriptorText(text: string): string {
  return text.replace(/[%,={}]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function describeArg(node: ts.Expression, flags: string[]): string {
  const expr = unwrapArg(node);
  if (ts.isIdentifier(expr)) {
    if (expr.text === "undefined") return "nil";
    return /^[A-Z]/.test(expr.text) ? `const:${expr.text}` : `id:${expr.text}`;
  }
  if (expr.kind === ts.SyntaxKind.ThisKeyword) return "id:this";
  if (ts.isNumericLiteral(expr) || ts.isBigIntLiteral(expr)) return `num:${expr.text}`;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
    return `str:${escapeDescriptorText(expr.text)}`;
  if (ts.isTemplateExpression(expr)) return "str-interp";
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return "bool:true";
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return "bool:false";
  if (expr.kind === ts.SyntaxKind.NullKeyword) return "nil";
  if (ts.isNewExpression(expr)) return "call:constructor";
  if (ts.isCallExpression(expr)) {
    const dispatched = dispatchedCallName(expr);
    if (dispatched !== undefined) return `call:${dispatched}`;
    const name = callSiteName(expr);
    return name === undefined ? "?" : `call:${name}`;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    // A property READ is Ruby's reader send (`x.foo`) or its ivar (`@foo`) —
    // `const:` when the name is constant-shaped, matching `Foo::BAR`.
    const name = expr.name.text;
    if (/^[A-Z]/.test(name)) return `const:${name}`;
    return expr.expression.kind === ts.SyntaxKind.ThisKeyword ? `id:${name}` : `call:${name}`;
  }
  if (ts.isObjectLiteralExpression(expr)) return describeObjectLiteral(expr, flags);
  if (ts.isArrayLiteralExpression(expr)) return "array";
  if (ts.isBinaryExpression(expr)) {
    return `binop:${ts.tokenToString(expr.operatorToken.kind) ?? "?"}`;
  }
  if (ts.isPrefixUnaryExpression(expr) || ts.isPostfixUnaryExpression(expr)) {
    return `unary${describeArg(expr.operand, flags)}`;
  }
  if (ts.isConditionalExpression(expr)) return "ternary";
  return "?";
}

/**
 * An object literal is the port's spelling of Ruby's keyword arguments, and
 * extract-ruby-api.rb#describe_hash reads a keyword-shaped `{ … }` as
 * `kwargs{…}` for exactly that reason. Anything else — a computed, string or
 * numeric key, or an empty literal — is the opaque `hash` of RFC 0025 §1.
 */
function describeObjectLiteral(node: ts.ObjectLiteralExpression, flags: string[]): string {
  if (node.properties.length === 0) return "hash";
  const pairs: string[] = [];
  for (const prop of node.properties) {
    if (ts.isShorthandPropertyAssignment(prop)) {
      pairs.push(`${prop.name.text}=id:${prop.name.text}`);
    } else if (ts.isSpreadAssignment(prop)) {
      flags.push("splat");
      pairs.push("**splat");
    } else if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      pairs.push(`${prop.name.text}=${describeArg(prop.initializer, flags)}`);
    } else {
      return "hash";
    }
  }
  return `kwargs{${pairs.join(",")}}`;
}

/** The port's spelling of a Ruby block: an inline callback argument. */
function isFunctionArgument(node: ts.Node): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function collectCalls(
  node: ts.Node | undefined,
  skipHoistedClosures = false,
): string[] | undefined {
  if (!node) return undefined;
  const aliases = currentImportAliases;
  const resolve = (name: string): string => aliases?.get(name) ?? name;
  const names = new Set<string>();
  // Names a hoisted closure — `const block = async () => { … }`, later handed
  // to `lock.synchronize(block)` — is the only source of. Such a body has no
  // fixed position in the stream: Ruby records a `caller = lambda do … end` at
  // its DEFINITION (sqlite3_adapter.rb:569-584) but an inline
  // `lock.synchronize do … end` at the CALL it hangs off
  // (connection_pool.rb:344), and the port spells both the same way whenever a
  // branch runs the body without the wrapper. So the ORDER stream drops those
  // names outright — position unknown is not position wrong — rather than
  // picking a side and flagging every body that matches the other. The call SET
  // is unaffected: it is collected with `skipHoistedClosures` off, so every
  // name inside a hoisted closure still counts toward it. A name the enclosing
  // body ALSO calls is dropped with it, deliberately: the enclosing occurrence
  // is no less ambiguous, since Ruby's single counterpart may correspond to
  // either position.
  const hoisted = skipHoistedClosures ? hoistedClosureCalls(node) : undefined;
  const invoked = skipHoistedClosures ? invokedCallKeys(node) : undefined;
  const addNegated = (expr: ts.Node, ...called: string[]): void => {
    if (!isNegatedOperand(expr)) return;
    for (const c of called) names.add(`${NEGATED_CALL_PREFIX}${c}`);
  };
  // Marked only when EVERY occurrence that credited the name was a foreign
  // read — the same shape as the Ruby side's `weak` tally.
  const occurrences = new Map<string, number>();
  const foreignReadOccurrences = new Map<string, number>();
  const tally = (map: Map<string, number>, name: string): void => {
    map.set(name, (map.get(name) ?? 0) + 1);
  };
  const visit = (n: ts.Node): void => {
    if (ts.isNewExpression(n)) {
      // `new Foo(...)` is Ruby's `Foo.new(...)`. The Ruby extractor records the
      // call as `new`, which conventions.ts maps to the TS `constructor`; record
      // `constructor` here so an instantiation counts toward the call set. Args
      // are walked FIRST (see the call branch below), so calls nested in
      // constructor arguments (`new Foo(typeCast(x))`) are credited regardless
      // of body shape.
      ts.forEachChild(n, visit);
      if (!(skipHoistedClosures && isThrownConstruction(n))) {
        names.add("constructor");
        tally(occurrences, "constructor");
      }
      return;
    } else if (ts.isCallExpression(n)) {
      // Receiver, then the ARGUMENTS, then the call itself — Ruby's EVALUATION
      // order, matching extract-ruby-api.rb#walk_call_in_order; the two orders
      // must agree. Recording evaluation rather than lexical order makes the
      // sequence invariant to hoisting: `addToTarget(buildRecord(x))` and the
      // `const r = await buildRecord(x); addToTarget(r)` an `await` forces
      // record the same two names in the same order.
      const callee = n.expression;
      const called: string[] = [];
      // The names the `!x()` negation prefix applies to — the call's own, not
      // the extra identifier a `X.call(...)` dispatch credits below.
      const negated: string[] = [];
      if (ts.isIdentifier(callee)) {
        called.push(callee.text);
        // Renamed-import call (`import { a as b }; b()`): also credit the
        // original imported name so it matches the ported call set.
        called.push(resolve(callee.text));
        negated.push(callee.text, resolve(callee.text));
      } else if (ts.isPropertyAccessExpression(callee)) {
        visit(callee.expression);
        const prop = callee.name.text;
        called.push(prop);
        negated.push(prop);
        // An invocation off another object gets the same foreign tally as a read
        // off one (see FOREIGN_READ_PREFIX). The `X.call(...)` identifier
        // credited below is deliberately NOT tallied: that dispatch really does
        // run a same-file body — the `this`-typed mixin convention (CLAUDE.md).
        if (isForeignReadReceiver(callee.expression)) tally(foreignReadOccurrences, prop);
        // `X.call(...)` / `X.apply(...)` also dispatch the function bound to
        // `X` (the project's `this`-typed mixin convention, plus Ruby's
        // `meth.call`/`send` indirection). Additionally credit the dispatched
        // identifier — resolved through import aliases — so an indirect
        // invocation of a ported method counts toward its call set. Additive:
        // the literal `call`/`apply` name is retained, so no prior match is lost.
        if ((prop === "call" || prop === "apply") && ts.isIdentifier(callee.expression)) {
          called.push(resolve(callee.expression.text));
        }
      } else if (callee.kind === ts.SyntaxKind.SuperKeyword) {
        // Bare `super(...)` (constructor chain) — `super.foo()` is already
        // captured as `foo` by the property-access branch. Record as "super"
        // so calls-parity can flag a ported override that drops the super call.
        called.push("super");
      } else {
        visit(callee);
      }
      // A function-expression argument is the port's spelling of a Ruby BLOCK,
      // which extract-ruby-api.rb walks AFTER the call it hangs off (the block
      // of `xs.each do … end` is normally a `for` body here, following the
      // iterated expression). So it is deferred, and only the value arguments
      // are evaluated before the call.
      const blocks = n.arguments.filter(isFunctionArgument);
      for (const arg of n.arguments) if (!isFunctionArgument(arg)) visit(arg);
      for (const name of called) {
        names.add(name);
        tally(occurrences, name);
      }
      for (const block of blocks) visit(block);
      addNegated(n, ...negated);
      return;
    } else if (skipHoistedClosures && isLocalBoundFunction(n)) {
      return;
    } else if (ts.isPropertyAccessExpression(n)) {
      // A property READ (`this.joinsValues`, `obj.nested`) is the faithful TS
      // mirror of a Ruby method send: Ruby has no public field access on ANY
      // receiver — `x.foo` is always a call to `foo` on `x`, whether `x` is
      // `self` or another object — so a plain read IS a call there. The rule is
      // therefore receiver-agnostic (not `this`-only): credit the property name
      // so any read counts toward the ported call set, matching Ruby's
      // reader-call semantics. Two accesses are NOT reads and are skipped:
      //   - the callee of a CallExpression (`this.foo(...)`): the isCall branch
      //     above already recorded `foo`, so crediting here double-records it;
      //   - the target of an assignment (`this.foo = x`, or a destructuring LHS
      //     `[this.foo] = arr` / `({ a: this.foo } = obj)`): that mirrors Ruby's
      //     writer send `foo=`, not the reader `foo` — crediting the reader name
      //     would be unfaithful (and makes the call set body-shape dependent).
      //   - a read of `constructor` (`this.constructor.primaryKey`): that is the
      //     port of Ruby's `self.class`, a SKIP name, but `constructor` is also
      //     what a `new Foo(...)` site records, so crediting the read lets a
      //     class reference stand in for an instantiation Rails makes.
      const parent = n.parent;
      const isCallCallee =
        parent !== undefined && ts.isCallExpression(parent) && parent.expression === n;
      visit(n.expression);
      if (n.name.text === "constructor") return;
      //   - in the ORDER stream only, a `respond_to?` guard read — see
      //     isGuardConditionRead.
      if (invoked?.has(propertyAccessKey(n)) === true && isGuardConditionRead(n)) {
        return;
      }
      if (!isCallCallee && !isAssignmentWriteTarget(n)) {
        names.add(n.name.text);
        tally(occurrences, n.name.text);
        if (isForeignReadReceiver(n.expression)) tally(foreignReadOccurrences, n.name.text);
        addNegated(n, n.name.text);
      }
    }
    ts.forEachChild(n, visit);
  };
  // The body ITSELF, not just its children: an expression-bodied arrow
  // (`= (x) => where(x)`) IS the call site, and Ruby's walk_for_calls covers it.
  visit(node);
  if (hoisted) for (const name of hoisted) names.delete(name);
  // Call SET only: the ORDER stream (extractCallSeq) is compared position by
  // position against Ruby's, and a marker has no position.
  if (!skipHoistedClosures) {
    for (const [name, count] of foreignReadOccurrences) {
      if (names.has(name) && occurrences.get(name) === count) {
        names.add(`${FOREIGN_READ_PREFIX}${name}`);
      }
    }
  }
  if (names.size === 0) return undefined;
  return [...names];
}

/**
 * Whether a property read's receiver names some OTHER object — so the member it
 * reads is not this file's member of that name. `this` and `super` are the
 * body's own receiver, and a capitalized identifier is a class/namespace
 * reference (`Base.connection`), whose static of the same name is a same-file
 * member when the class is declared here. Everything else — a parameter, a
 * local, a chain (`details.locale`, `record.klass.table`) — is foreign.
 */
function isForeignReadReceiver(receiver: ts.Node): boolean {
  if (receiver.kind === ts.SyntaxKind.ThisKeyword || receiver.kind === ts.SyntaxKind.SuperKeyword) {
    return false;
  }
  if (ts.isIdentifier(receiver)) return !/^[A-Z]/.test(receiver.text);
  return true;
}

/**
 * Whether a property read sits in the CONDITION of a guard — `if (x.foo)`,
 * `x.foo ? … : …`, `x.foo && …`, `x.foo ?? …`, and the negated/parenthesized
 * spellings of each.
 *
 * Rails guards an optional collaborator with `respond_to?`
 * (`logger.respond_to?(:push_tags)`, railties/lib/rails/rack/logger.rb:23) and
 * TS has no such operator, so reading the method itself is the only spelling of
 * the question. Ruby records `respond_to?` at that position, not `push_tags`;
 * letting the read claim it puts the name ahead of the arguments Rails
 * evaluates first (`compute_tags`) and reports an inversion in a body whose
 * order matches Rails. So the ORDER stream withholds the position — the call
 * itself still takes its own, and the call SET is untouched. Same rule as
 * compare.ts#ambiguousTsNames: a position is attributable to exactly one call.
 */
function isGuardConditionRead(access: ts.PropertyAccessExpression): boolean {
  let node: ts.Node = access;
  let parent = node.parent as ts.Node | undefined;
  while (
    parent !== undefined &&
    (ts.isParenthesizedExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken))
  ) {
    node = parent;
    parent = node.parent;
  }
  if (parent === undefined) return false;
  if (ts.isIfStatement(parent) || ts.isWhileStatement(parent) || ts.isDoStatement(parent)) {
    return parent.expression === node;
  }
  if (ts.isConditionalExpression(parent)) return parent.condition === node;
  if (ts.isBinaryExpression(parent)) {
    return (
      parent.left === node &&
      (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        parent.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    );
  }
  return false;
}

/**
 * `receiver.name` for every property-access call the body makes — the key
 * `isGuardConditionRead`'s call site matches a guard read against. The RECEIVER
 * is part of the key on purpose: `if (this.index) table.index(…)`
 * (schema_definitions.rb:238-240) guards one object's reader around a call on
 * ANOTHER object, and Ruby records that reader — `index` — at the guard's
 * position, so the read must keep it. Only `x.foo ? x.foo(…)`, the same
 * receiver and the same name, is the `respond_to?` spelling.
 */
function invokedCallKeys(node: ts.Node): Set<string> {
  const found = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      found.add(propertyAccessKey(n.expression));
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function propertyAccessKey(access: ts.PropertyAccessExpression): string {
  return `${access.expression.getText()}.${access.name.text}`;
}

/** `const block = () => { … }` / `= function () { … }` — see collectCalls. */
function isLocalBoundFunction(node: ts.Node): boolean {
  return (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer !== undefined &&
    isFunctionArgument(node.initializer)
  );
}

/** Every call name reachable from a hoisted closure's body. See collectCalls. */
function hoistedClosureCalls(node: ts.Node): Set<string> {
  const found = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (isLocalBoundFunction(n)) {
      for (const name of collectCalls((n as ts.VariableDeclaration).initializer) ?? []) {
        found.add(name);
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/**
 * If `body` is a trivial single-statement delegation to a sibling instance
 * method — `return this.helper(...)` or a bare `this.helper(...)` as the only
 * statement — return that helper's name, else undefined. Used to credit the
 * helper's call-set back to the delegating method (one level only), so a method
 * extracted into a one-line private helper reads as equivalent to inlining it.
 * Concrete repro: `buildStatementPool() { return this.makeStatementPool(c); }`.
 */
function delegatedHelper(body: ts.Node | undefined): string | undefined {
  if (!body || !ts.isBlock(body) || body.statements.length !== 1) return undefined;
  const stmt = body.statements[0];
  const expr = ts.isReturnStatement(stmt)
    ? stmt.expression
    : ts.isExpressionStatement(stmt)
      ? stmt.expression
      : undefined;
  if (!expr || !ts.isCallExpression(expr)) return undefined;
  const callee = expr.expression;
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.expression.kind === ts.SyntaxKind.ThisKeyword &&
    ts.isIdentifier(callee.name)
  ) {
    return callee.name.text;
  }
  return undefined;
}

/**
 * If `body` is a whole-body forward to the SAME-NAMED method of another object
 * reached off `this` — `return this.acc().name(...)`, its `await` form, or the
 * property form `return this.acc.name(...)` — return the name of the class /
 * interface that declares the receiver, else undefined.
 *
 * The target is resolved from the accessor's return type through the checker.
 * Name- or path-based alternatives are unsound here: they would credit
 * `abstract-mysql-adapter.ts` with calls made in
 * `postgresql/schema-statements-class.ts` (sibling implementations of one
 * interface), which is exactly the per-adapter fidelity gap the gate
 * exists to catch. The resolved type must actually declare `name`, so an
 * accessor whose type the checker cannot resolve records no edge.
 */
function delegationTargetName(
  body: ts.Node | undefined,
  name: string,
  hostName: string,
  checker: ts.TypeChecker,
): string | undefined {
  if (!body || !ts.isBlock(body) || body.statements.length !== 1) return undefined;
  const stmt = body.statements[0];
  let expr = ts.isReturnStatement(stmt)
    ? stmt.expression
    : ts.isExpressionStatement(stmt)
      ? stmt.expression
      : undefined;
  if (expr && ts.isAwaitExpression(expr)) expr = expr.expression;
  if (!expr || !ts.isCallExpression(expr)) return undefined;

  // Callee must be `<receiver>.<name>` with `<name>` identical to the forwarding
  // method — a differently-named callee is ordinary collaboration, not the
  // Rails-module-moved-to-a-class shape this edge models.
  const callee = expr.expression;
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.name)) return undefined;
  if (callee.name.text !== name) return undefined;

  // The receiver is `this.acc()` or `this.acc` — never a bare `this` (that is
  // in-class dispatch) and never a free identifier (namespace delegation, see
  // namespaceSelfDelegationName).
  let receiver = callee.expression;
  if (ts.isCallExpression(receiver) && receiver.arguments.length === 0) {
    receiver = receiver.expression;
  }
  if (
    !ts.isPropertyAccessExpression(receiver) ||
    receiver.expression.kind !== ts.SyntaxKind.ThisKeyword
  ) {
    return undefined;
  }

  const type = checker.getTypeAtLocation(callee.expression);
  if (!type.getProperty(name)) return undefined;
  const targetName = type.getSymbol()?.getName();
  if (!targetName || targetName === hostName) return undefined;
  // Anonymous/structural types carry synthetic symbol names; they name no
  // declaring module a consumer could resolve.
  if (targetName.startsWith("__")) return undefined;
  return targetName;
}

/**
 * If `body` is a trivial single-statement delegation to a same-named module
 * function reached through a namespace-import object — `return NS.fn(...)`,
 * `NS.fn(...)`, or the `.call`/`.apply` forms `NS.fn.call(this, ...)` — return
 * that function's name, else undefined. Distinct from {@link delegatedHelper}
 * (which handles `this.helper(...)` same-class delegation): here the callee's
 * receiver is a bare identifier (a namespace alias like `_qm`), not `this`.
 * Used to identify Rails-layout wrapper methods whose real body lives in the
 * canonical module file, so the wrapper's meaningless call-set is suppressed.
 */
function namespaceSelfDelegationName(
  body: ts.Node | undefined,
  checker: ts.TypeChecker,
): string | undefined {
  if (!body || !ts.isBlock(body) || body.statements.length !== 1) return undefined;
  const stmt = body.statements[0];
  const expr = ts.isReturnStatement(stmt)
    ? stmt.expression
    : ts.isExpressionStatement(stmt)
      ? stmt.expression
      : undefined;
  if (!expr || !ts.isCallExpression(expr)) return undefined;
  let callee = expr.expression;
  // Peel a trailing `.call` / `.apply` so `NS.fn.call(this, ...)` resolves to fn.
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.name) &&
    (callee.name.text === "call" || callee.name.text === "apply")
  ) {
    callee = callee.expression;
  }
  // The receiver must be a bare identifier (not `this` — `this.x` delegation is
  // handled by delegatedHelper).
  if (
    !ts.isPropertyAccessExpression(callee) ||
    !ts.isIdentifier(callee.expression) ||
    !ts.isIdentifier(callee.name)
  ) {
    return undefined;
  }
  // …and it must positively resolve to a MODULE/namespace receiver, NOT a class.
  // `QueryAttribute.withCastValue(...)` is an in-class instance→static delegation
  // whose body has real reads (`this.name`, `this.type`) that must be kept; a
  // namespace/module receiver (`_qm`, `_fm`, `ConnectionHandling` — all
  // `import * as` / named module-object imports) is the Rails-layout wrapper we
  // do want to drop. An UNRESOLVABLE receiver (no symbol — only reachable for a
  // genuinely unbound identifier, i.e. non-compiling code) fails toward tracking
  // rather than risk a false-positive suppression that silently drops a real
  // call-set. A class receiver's symbol carries the Class flag (in a fully
  // type-resolved program the alias resolves through to the imported class too);
  // a namespace/module object does not.
  let recvSym = checker.getSymbolAtLocation(callee.expression);
  if (!recvSym) return undefined;
  if (recvSym.flags & ts.SymbolFlags.Alias) recvSym = checker.getAliasedSymbol(recvSym);
  if (recvSym.flags & ts.SymbolFlags.Class) return undefined;
  return callee.name.text;
}

function extractParameters(params: ts.NodeArray<ts.ParameterDeclaration>): ParamInfo[] {
  return params.map((p) => {
    const name = p.name.getText();
    let kind: ParamInfo["kind"] = "required";
    if (p.dotDotDotToken) {
      kind = "rest";
    } else if (p.questionToken || p.initializer) {
      kind = "optional";
    }
    const result: ParamInfo = { name, kind };
    if (p.initializer) {
      result.default = "...";
      result.literal = tsLiteralValue(p.initializer) ?? { kind: "expr" };
    }
    if (p.type) {
      result.type = p.type.getText();
    }
    return result;
  });
}

/**
 * Advisory option-key extraction (see options-keys.ts). Resolves the LAST
 * parameter's object type to its property names. Returns: undefined (no
 * options-shaped trailing param), null (uncheckable — `any`/`unknown` or a
 * string-index bag like `Record<string, unknown>`, distinct from `[]`), or the
 * sorted/deduped property names. Only interface/type-literal/intersection
 * trailing params are inspected.
 */
export function extractOptionKeys(
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  checker: ts.TypeChecker,
): string[] | null | undefined {
  if (parameters.length === 0) return undefined;
  const last = parameters[parameters.length - 1];
  if (last.dotDotDotToken || !last.type) return undefined;
  const tn = last.type;
  if (!ts.isTypeLiteralNode(tn) && !ts.isIntersectionTypeNode(tn) && !ts.isTypeReferenceNode(tn)) {
    return undefined;
  }
  // A string/number index signature accepts ANY key, so the named props aren't
  // an enumerable contract — treat the param as uncheckable. Inline-literal index
  // signatures don't survive `getTypeFromTypeNode`, so check syntax too.
  if (hasSyntacticIndexSignature(tn)) return null;
  const type = checker.getTypeFromTypeNode(tn);
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return null;
  const hasStringIndex = checker
    .getIndexInfosOfType(type)
    .some((i) => (i.keyType.flags & (ts.TypeFlags.String | ts.TypeFlags.Number)) !== 0);
  if (hasStringIndex) return null;
  const names = checker
    .getPropertiesOfType(type)
    .map((s) => s.getName())
    .filter((n) => !n.startsWith("__"));
  // No named props — e.g. `opts: {}` or a marker interface. Deliberately
  // `undefined` ("nothing to check"), NOT `[]`: an empty object type is
  // structurally "any object", so diffing it would flag every Ruby key as a
  // bogus `missingInTs`. Use `Record<string, unknown>` to mean a real keyed bag
  // (that path returns `null` above).
  if (names.length === 0) return undefined;
  return [...new Set(names)].sort();
}

/** Does a type node carry a string/number index signature in its syntax? Covers
 *  inline `{ [k: string]: … }` literals (whose index info is lost by
 *  `getTypeFromTypeNode`) and intersection arms that contain one. */
function hasSyntacticIndexSignature(tn: ts.TypeNode): boolean {
  if (ts.isTypeLiteralNode(tn)) {
    return tn.members.some((m) => ts.isIndexSignatureDeclaration(m));
  }
  if (ts.isIntersectionTypeNode(tn)) {
    return tn.types.some(hasSyntacticIndexSignature);
  }
  return false;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === kind) ?? false;
}

function getMemberName(member: ts.ClassElement): string | undefined {
  if (member.name) {
    if (ts.isIdentifier(member.name)) {
      return member.name.text;
    }
    if (ts.isPrivateIdentifier(member.name)) {
      return member.name.text;
    }
    if (ts.isStringLiteral(member.name)) {
      return member.name.text;
    }
    if (ts.isComputedPropertyName(member.name)) {
      return member.name.getText();
    }
  }
  return undefined;
}

/**
 * Arity of a member the `__mixin` walker reached through the type checker: it
 * holds a symbol's declaration rather than a syntax node, so the kind split
 * the top-level class walker gets for free happens here instead — methods and
 * set accessors carry parameters, getters and property declarations report
 * none. Unlike the JSDoc reason, this is extracted for a FOREIGN declaration
 * too: arity is the member's own signature, which the arity check compares
 * against the Ruby entry whichever file declared it.
 */
function declarationArity(
  decl: ts.Declaration | undefined,
  checker: ts.TypeChecker,
): { params: ParamInfo[]; optionKeys?: string[] | null } {
  const parameters = decl !== undefined ? parameterListOf(decl) : undefined;
  if (parameters === undefined) return { params: [] };
  const optionKeys = extractOptionKeys(parameters, checker);
  return {
    params: extractParameters(parameters),
    ...(optionKeys !== undefined ? { optionKeys } : {}),
  };
}

function parameterListOf(decl: ts.Declaration): ts.NodeArray<ts.ParameterDeclaration> | undefined {
  if (ts.isMethodDeclaration(decl) || ts.isMethodSignature(decl)) return decl.parameters;
  if (ts.isSetAccessorDeclaration(decl) || ts.isConstructorDeclaration(decl))
    return decl.parameters;
  return undefined;
}

/**
 * Returns the effective visibility of a class member, treating
 * `#`-prefixed private fields as `private`.
 */
function memberVisibility(member: ts.ClassElement): "public" | "private" | "protected" {
  if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) return "private";
  if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) return "protected";
  if (member.name && ts.isPrivateIdentifier(member.name)) return "private";
  return "public";
}

/**
 * The visibility of a constructor parameter property — a parameter carrying an
 * accessibility modifier or `readonly`, which TypeScript turns into a field of
 * the class. `undefined` for an ordinary parameter, which declares nothing.
 */
function parameterPropertyVisibility(
  param: ts.ParameterDeclaration,
): "public" | "private" | "protected" | undefined {
  if (hasModifier(param, ts.SyntaxKind.PrivateKeyword)) return "private";
  if (hasModifier(param, ts.SyntaxKind.ProtectedKeyword)) return "protected";
  if (
    hasModifier(param, ts.SyntaxKind.PublicKeyword) ||
    hasModifier(param, ts.SyntaxKind.ReadonlyKeyword)
  ) {
    return "public";
  }
  return undefined;
}

function isExported(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

// Run main() only on the main thread when invoked as a script.
// Worker threads dispatch via the early `!isMainThread` block above
// and never reach this guard. Importing the module from a test file
// also leaves both branches inert.
if (
  isMainThread &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main();
}
