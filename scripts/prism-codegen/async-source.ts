import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { rubyFileToTs, methodName } from "./naming.js";
import { TARGET_FILES, TRAILS_AR_SRC, portTreeFiles, rubyAbsPath, type PortFile } from "./files.js";
import { resolvePath } from "../../vendor/sources.js";
const AR_ROOT = resolvePath("activerecord");
const AR_LIB = path.dirname(AR_ROOT);
const RUBY_DEF = /^\s*def\s+(?:self\.)?([A-Za-z_][\w]*[?!=]?)/gm;
export function rubyDefinedMethods(rubySource: string): Set<string> {
  const defs = new Set<string>();
  for (const m of rubySource.matchAll(RUBY_DEF)) defs.add(methodName(m[1]));
  return defs;
}
function railsSource(railsRelPath: string): string {
  const abs = path.join(AR_LIB, railsRelPath);
  return existsSync(abs) ? readFileSync(abs, "utf8") : "";
}
function railsDefinedMethods(railsRelPath: string): Set<string> {
  return rubyDefinedMethods(railsSource(railsRelPath));
}
const ASYNC_DECL = /\basync\s+(?:function\s+)?([A-Za-z_$][\w$]*)\s*[(<]/g;
const ASYNC_ARROW = /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*async\b/g;
const CONST_BIND = /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*([^\n;]+)/g;
const MAP_ENTRY = /(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*:\s*([^\n,}]+)/g;
const IDENT = /[A-Za-z_$][\w$]*/g;
export function extractAsyncNames(src: string): Set<string> {
  const asyncNames = new Set<string>();
  for (const m of src.matchAll(ASYNC_DECL)) asyncNames.add(m[1]);
  for (const m of src.matchAll(ASYNC_ARROW)) asyncNames.add(m[1]);
  const referencesAsync = (expr: string): boolean => {
    for (const id of expr.matchAll(IDENT)) if (asyncNames.has(id[0])) return true;
    return false;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const [, name, rhs] of src.matchAll(CONST_BIND)) {
      if (!asyncNames.has(name) && referencesAsync(rhs)) {
        asyncNames.add(name);
        changed = true;
      }
    }
    for (const [, key, val] of src.matchAll(MAP_ENTRY)) {
      if (!asyncNames.has(key) && referencesAsync(val)) {
        asyncNames.add(key);
        changed = true;
      }
    }
  }
  return asyncNames;
}
function readFileOr(tsPath: string): string {
  return existsSync(tsPath) ? readFileSync(tsPath, "utf8") : "";
}
/**
 * Whole-program view of which method names are async somewhere in the port
 * tree, and in how many files — the same shape the scorer's global fallback
 * indexes by, so an await decision can be taken on an unambiguous cross-file
 * hit rather than only on the one twin file.
 */
export interface AsyncManifest {
  byName: Map<string, Set<string>>;
}
export function buildAsyncManifest(files: PortFile[]): AsyncManifest {
  const byName = new Map<string, Set<string>>();
  for (const { path: file, source } of files) {
    for (const name of extractAsyncNames(source)) {
      const seen = byName.get(name) ?? new Set<string>();
      seen.add(file);
      byName.set(name, seen);
    }
  }
  return { byName };
}
/**
 * Names the manifest resolves to exactly one async definition outside the twin
 * file. Ambiguous names (async in several port files) are declined: the await
 * rule is receiver-blind, so a name that could be two different methods must
 * not drag an await onto the wrong call.
 */
export function crossFileAsyncNames(
  manifest: AsyncManifest,
  opts: { twinTsPath: string; railsDefs: ReadonlySet<string> },
): Set<string> {
  const names = new Set<string>();
  for (const name of opts.railsDefs) {
    const files = manifest.byName.get(name);
    if (!files || files.size !== 1 || files.has(opts.twinTsPath)) continue;
    names.add(name);
  }
  return names;
}
const DEF_LINE = /^(\s*)def\s+(?:self\.)?([A-Za-z_][\w]*[?!=]?)(.*)$/;
const RUBY_CALL = /[A-Za-z_][\w]*[?!]?/g;
export interface RubyDefBody {
  name: string;
  body: string;
}
/**
 * Each `def` in a Ruby file paired with its body text, split on Ruby's
 * indentation discipline (the `end` that closes a `def` sits at the `def`'s
 * own column). Rails source is uniformly formatted, so this is enough to ask
 * "what does this method call?" without a parse.
 */
export function rubyDefBodies(rubySource: string): RubyDefBody[] {
  const lines = rubySource.split("\n");
  const bodies: RubyDefBody[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = DEF_LINE.exec(lines[i]);
    if (!m) continue;
    const [, indent, rubyName, rest] = m;
    const collected = [rest];
    const closer = new RegExp(`^${indent}end\\b`);
    for (let j = i + 1; j < lines.length; j++) {
      if (closer.test(lines[j])) break;
      collected.push(lines[j]);
    }
    bodies.push({ name: methodName(rubyName), body: collected.join("\n") });
  }
  return bodies;
}
/**
 * Async names a file's own defs earn from what their bodies call: a method
 * that reaches a known-async name is itself async, taken to a fixpoint so the
 * marking propagates up a chain of same-file callers. Seeded only from
 * unambiguous manifest hits, so the receiver-blind await rule never fires on a
 * name that could be two different methods.
 */
export function inferAsyncFromBodies(rubySource: string, seed: ReadonlySet<string>): Set<string> {
  const inferred = new Set<string>();
  const bodies = rubyDefBodies(rubySource);
  const reachesAsync = (body: string): boolean => {
    for (const tok of body.matchAll(RUBY_CALL)) {
      const name = methodName(tok[0]);
      if (seed.has(name) || inferred.has(name)) return true;
    }
    return false;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const { name, body } of bodies) {
      if (inferred.has(name) || seed.has(name)) continue;
      if (!reachesAsync(body)) continue;
      inferred.add(name);
      changed = true;
    }
  }
  return inferred;
}
export function resolveAsyncNames(opts: {
  twinTs: string;
  relationTs?: string;
  ownRubyDefs?: ReadonlySet<string>;
  crossFile?: ReadonlySet<string>;
  inferFromRuby?: string;
}): Set<string> {
  const names = extractAsyncNames(opts.twinTs);
  if (opts.relationTs && opts.ownRubyDefs) {
    for (const n of extractAsyncNames(opts.relationTs)) {
      if (opts.ownRubyDefs.has(n)) names.add(n);
    }
  }
  for (const n of opts.crossFile ?? []) names.add(n);
  if (opts.inferFromRuby !== undefined) {
    for (const n of inferAsyncFromBodies(opts.inferFromRuby, names)) names.add(n);
  }
  return names;
}
let manifestCache: AsyncManifest | undefined;
export function defaultAsyncManifest(): AsyncManifest {
  manifestCache ??= buildAsyncManifest(portTreeFiles());
  return manifestCache;
}
let railsCorpusDefsCache: Set<string> | undefined;
/**
 * Every method Rails defines across the codegen target set. A cross-file async
 * name only earns an await when it is also a Rails method — that keeps
 * incidental TS-only helpers (and same-named library calls) out of the
 * receiver-blind await rule, the same intersect-with-Rails-defs guard the
 * relation.ts supplement has always used.
 */
function railsCorpusDefs(): Set<string> {
  if (railsCorpusDefsCache) return railsCorpusDefsCache;
  const defs = new Set<string>();
  for (const f of TARGET_FILES) {
    const abs = rubyAbsPath(f);
    if (!existsSync(abs)) continue;
    for (const n of rubyDefinedMethods(readFileSync(abs, "utf8"))) defs.add(n);
  }
  railsCorpusDefsCache = defs;
  return defs;
}
export function asyncMethodsForRailsFile(
  railsRelPath: string,
  manifest: AsyncManifest = defaultAsyncManifest(),
): Set<string> {
  const short = railsRelPath.replace(/^active_record\//, "");
  const twinTsPath = rubyFileToTs(short);
  const twinTs = readFileOr(path.join(TRAILS_AR_SRC, twinTsPath));
  const relationFamily = short.startsWith("relation/") || short === "relation.rb";
  return resolveAsyncNames({
    twinTs,
    relationTs: relationFamily ? readFileOr(path.join(TRAILS_AR_SRC, "relation.ts")) : undefined,
    ownRubyDefs: relationFamily ? railsDefinedMethods(railsRelPath) : undefined,
    crossFile: crossFileAsyncNames(manifest, { twinTsPath, railsDefs: railsCorpusDefs() }),
    // Only an unported file needs the body pass: with a twin `.ts` the port
    // itself is the authority on which defs are async.
    inferFromRuby: twinTs === "" ? railsSource(railsRelPath) : undefined,
  });
}
