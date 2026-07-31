import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { rubyFileToTs, methodName } from "./naming.js";
import { resolvePath } from "../../vendor/sources.js";
const TRAILS_AR_SRC = "packages/activerecord/src";
const AR_ROOT = resolvePath("activerecord");
const AR_LIB = path.dirname(AR_ROOT);
const RUBY_DEF = /^\s*def\s+(?:self\.)?([A-Za-z_][\w]*[?!=]?)/gm;
export function rubyDefinedMethods(rubySource: string): Set<string> {
  const defs = new Set<string>();
  for (const m of rubySource.matchAll(RUBY_DEF)) defs.add(methodName(m[1]));
  return defs;
}
function railsDefinedMethods(railsRelPath: string): Set<string> {
  const abs = path.join(AR_LIB, railsRelPath);
  if (!existsSync(abs)) return new Set();
  return rubyDefinedMethods(readFileSync(abs, "utf8"));
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
export function resolveAsyncNames(opts: {
  twinTs: string;
  relationTs?: string;
  ownRubyDefs?: ReadonlySet<string>;
}): Set<string> {
  const names = extractAsyncNames(opts.twinTs);
  if (opts.relationTs && opts.ownRubyDefs) {
    for (const n of extractAsyncNames(opts.relationTs)) {
      if (opts.ownRubyDefs.has(n)) names.add(n);
    }
  }
  return names;
}
export function asyncMethodsForRailsFile(railsRelPath: string): Set<string> {
  const short = railsRelPath.replace(/^active_record\//, "");
  const twinTs = readFileOr(path.join(TRAILS_AR_SRC, rubyFileToTs(short)));
  const relationFamily = short.startsWith("relation/") || short === "relation.rb";
  return resolveAsyncNames({
    twinTs,
    relationTs: relationFamily ? readFileOr(path.join(TRAILS_AR_SRC, "relation.ts")) : undefined,
    ownRubyDefs: relationFamily ? railsDefinedMethods(railsRelPath) : undefined,
  });
}
