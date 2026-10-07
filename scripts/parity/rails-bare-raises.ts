/**
 * The classes each Ruby method raises with no message argument (`raise Klass`,
 * `raise Klass unless …`, `raise Klass.new`) and never with one, keyed by the
 * last segment of the module or class that owns the method and by the method's
 * TS spellings. rails-bare-raises.rb reads the raises from Ripper, so a
 * construction spanning lines, a heredoc message and a literal-named
 * `define_method` body are all classified. The `*` owner holds what every owner
 * in the file agrees on, for a TS function with no class around it.
 * scripts/build-rails-error-manifest.ts writes the result for
 * `blazetrails/rails-error-parity`'s `inventedMessage` arm.
 */
import { execFile } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { rubyMethodToTsIgnoringSkip } from "./conventions.js";

export type RaiseRow = [owner: string | null, method: string, klass: string, kind: string];
export type BareRaises = Record<string, string[]>;
export type OwnedBareRaises = Record<string, BareRaises>;

export const ANY_OWNER = "*";

const SCANNER = path.join(path.dirname(fileURLToPath(import.meta.url)), "rails-bare-raises.rb");

/** Every class-naming raise in `files`, by file. */
export async function scanRaises(files: string[]): Promise<Record<string, RaiseRow[]>> {
  if (files.length === 0) return {};
  const { stdout } = await promisify(execFile)("ruby", [SCANNER, ...files], {
    maxBuffer: 1 << 28,
  });
  return JSON.parse(stdout);
}

function foldMethods(rows: RaiseRow[]): BareRaises {
  const byMethod = new Map<string, { bare: Set<string>; message: Set<string> }>();
  for (const [, method, klass, kind] of rows) {
    if (kind === "errinfo") continue;
    const sets = byMethod.get(method) ?? { bare: new Set(), message: new Set() };
    byMethod.set(method, sets);
    sets[kind === "bare" ? "bare" : "message"].add(klass);
  }
  const methods: BareRaises = {};
  for (const [rubyName, sets] of byMethod) {
    const names = [...sets.bare].filter((name) => !sets.message.has(name)).sort();
    if (names.length === 0) continue;
    for (const tsName of rubyMethodToTsIgnoringSkip(rubyName) ?? []) {
      if (tsName.startsWith("_") && !rubyName.startsWith("_")) continue;
      methods[tsName] = [...new Set([...(methods[tsName] ?? []), ...names])].sort();
    }
  }
  return methods;
}

/** The classes whose `initialize` reads `$!`, so a port passes the rescued exception. */
export function errinfoClasses(rows: RaiseRow[]): string[] {
  return rows.filter(([, , , kind]) => kind === "errinfo").map(([, , klass]) => klass);
}

export function foldBareRaises(rows: RaiseRow[]): OwnedBareRaises {
  const byOwner = new Map<string, RaiseRow[]>([[ANY_OWNER, rows]]);
  for (const row of rows) {
    const owner = row[0]?.split("::").pop();
    if (owner === undefined) continue;
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), row]);
  }
  const out: OwnedBareRaises = {};
  for (const owner of [...byOwner.keys()].sort()) {
    const methods = foldMethods(byOwner.get(owner)!);
    if (Object.keys(methods).length > 0) out[owner] = methods;
  }
  return out;
}
