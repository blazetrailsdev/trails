/**
 * Async is *not inferred* — it is read from the hand-ported trails TypeScript as
 * the source of truth. For a Rails file, we locate the matching trails `.ts`
 * (via the existing `rubyFileToTs` mapping) and collect the set of method names
 * whose implementation is `async`. `generate`/`from-ts` pass that set to the
 * emitter so a generated `def` is marked `async` exactly when its ported twin
 * is, and calls to those names are `await`ed inside async bodies.
 *
 * Trails exposes methods two ways, and BOTH must be resolved:
 *   1. Direct `async` declarations — `async function performFind(` / `async foo(`.
 *   2. A **Rails-name method map** — the object the mixin actually installs,
 *      keyed by the Rails-facing camelCase name, whose values reference the
 *      async implementations:
 *        `export const FinderMethods = { find: performFind, ... }`      (bare ref)
 *        `export const Calculations = { count: inQueryConnection(performCount) }` (wrapped)
 *      and alias chains (`secondBang → performSecondBang → bangFinder(performSecond)`).
 * The map KEY (`find`, `count`) is the name the generated `def` carries, so we
 * must translate map keys — not just declared function names — to async.
 *
 * A regex scrape (not a full TS parse) is deliberate: deterministic, dependency
 * free. We seed from async declarations, then run a fixpoint that promotes any
 * `const`/map-entry whose right-hand side references an already-async
 * identifier — so wrappers and alias chains resolve without special-casing.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { rubyFileToTs, methodName } from "./naming.js";
import { resolvePath } from "../../vendor/sources.js";

const TRAILS_AR_SRC = "packages/activerecord/src";
const AR_ROOT = resolvePath("activerecord"); // .../active_record
const AR_LIB = path.dirname(AR_ROOT); // .../lib

/** `def name` / `def self.name` in a Ruby source → camelCase method names. */
const RUBY_DEF = /^\s*def\s+(?:self\.)?([A-Za-z_][\w]*[?!=]?)/gm;

/** camelCase names of the methods `railsRelPath` itself defines. */
function railsDefinedMethods(railsRelPath: string): Set<string> {
  const abs = path.join(AR_LIB, railsRelPath);
  const defs = new Set<string>();
  if (!existsSync(abs)) return defs;
  const src = readFileSync(abs, "utf8");
  for (const m of src.matchAll(RUBY_DEF)) defs.add(methodName(m[1]));
  return defs;
}

/** `async [function] name(` / `async name<` → the identifier. */
const ASYNC_DECL = /\basync\s+(?:function\s+)?([A-Za-z_$][\w$]*)\s*[(<]/g;
/** `const name = async (` — async arrow bound to a name. */
const ASYNC_ARROW = /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*async\b/g;
/** `const name = <rhs>` (single-line binding). */
const CONST_BIND = /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*([^\n;]+)/g;
/** Object-literal entry `key: <value>` (map key → implementation). */
const MAP_ENTRY = /(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*:\s*([^\n,}]+)/g;
const IDENT = /[A-Za-z_$][\w$]*/g;

/**
 * The async method-name set for a trails `.ts` source string. Exported for
 * direct testing; `asyncMethodsForRailsFile` is the file-path wrapper.
 */
export function extractAsyncNames(src: string): Set<string> {
  const asyncNames = new Set<string>();
  for (const m of src.matchAll(ASYNC_DECL)) asyncNames.add(m[1]);
  for (const m of src.matchAll(ASYNC_ARROW)) asyncNames.add(m[1]);

  const referencesAsync = (expr: string): boolean => {
    for (const id of expr.matchAll(IDENT)) if (asyncNames.has(id[0])) return true;
    return false;
  };

  // Fixpoint: a const alias/wrapper or a map entry whose RHS references a known
  // async identifier is itself async. Iterating to a fixpoint resolves multi
  // hop chains (async fn → const wrapper → map key).
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

function asyncNamesInFile(tsPath: string): Set<string> {
  if (!existsSync(tsPath)) return new Set();
  return extractAsyncNames(readFileSync(tsPath, "utf8"));
}

/**
 * Set of camelCase method names that are async in the trails port of
 * `railsRelPath` (e.g. `active_record/persistence.rb`). Empty when no ported
 * file exists yet — the tool then emits sync, which is the honest default.
 *
 * The direct `rubyFileToTs` twin is consulted in full (its async surface is
 * this file's own methods — the Rails-name maps are curated). Rails' relation
 * modules (`relation/*.rb`, and `relation.rb`) are mixed into `Relation`, and
 * trails ports some of their methods (`Relation#pluck`/`#ids`, defined in
 * calculations.rb) directly onto the `Relation` class in `relation.ts`. We
 * supplement from `relation.ts` for the relation family, but **only** the async
 * names this Rails file actually `def`s — so `pluck`/`ids` are picked up while
 * generic Relation async names (`first`, `one?`) that this file merely *calls*
 * on other receivers (Array helpers) are not swept in, which would otherwise
 * make the receiver-blind `await` rule await unrelated same-named calls.
 */
export function asyncMethodsForRailsFile(railsRelPath: string): Set<string> {
  const short = railsRelPath.replace(/^active_record\//, "");
  const names = asyncNamesInFile(path.join(TRAILS_AR_SRC, rubyFileToTs(short)));

  if (short.startsWith("relation/") || short === "relation.rb") {
    const ownDefs = railsDefinedMethods(railsRelPath);
    for (const n of asyncNamesInFile(path.join(TRAILS_AR_SRC, "relation.ts"))) {
      if (ownDefs.has(n)) names.add(n);
    }
  }
  return names;
}
