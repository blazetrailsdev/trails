/**
 * Async is *not inferred* — it is read from the hand-ported trails TypeScript as
 * the source of truth. For a Rails file, we locate the matching trails `.ts`
 * (via the existing `rubyFileToTs` mapping) and scrape the set of method names
 * declared `async` there. `generate`/`from-ts` pass that set to the emitter so a
 * generated `def` is marked `async` exactly when its ported twin is, and calls
 * to those names are `await`ed inside async bodies.
 *
 * A regex scrape (not a full TS parse) is deliberate: it is deterministic,
 * dependency-free, and matches both shapes trails uses — `async function foo(`
 * (the mixin free-function form) and `async foo(` (class-method form). Anonymous
 * `async () =>` arrows carry no name and are correctly ignored.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { rubyFileToTs } from "./naming.js";

const TRAILS_AR_SRC = "packages/activerecord/src";

/** `async [function] name(` / `async name<` → the identifier. */
const ASYNC_DECL = /\basync\s+(?:function\s+)?([A-Za-z_$][\w$]*)\s*[(<]/g;

/**
 * Set of camelCase method names declared `async` in the trails port of
 * `railsRelPath` (e.g. `active_record/persistence.rb`). Empty when no ported
 * file exists yet — the tool then emits sync, which is the honest default.
 */
export function asyncMethodsForRailsFile(railsRelPath: string): Set<string> {
  const short = railsRelPath.replace(/^active_record\//, "");
  const tsPath = path.join(TRAILS_AR_SRC, rubyFileToTs(short));
  const names = new Set<string>();
  if (!existsSync(tsPath)) return names;
  const src = readFileSync(tsPath, "utf8");
  for (const m of src.matchAll(ASYNC_DECL)) names.add(m[1]);
  return names;
}
