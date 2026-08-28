/**
 * Projects a Ruby file's per-name visibility map onto the TS names
 * `eslint/rails-private-methods.json` carries.
 *
 * The all-private decision is made per RUBY name while the manifest is keyed by
 * TS name, and the two are not one-to-one: `rubyMethodToTs` gives a `?` method
 * the bare stem as a candidate, so private `content_security_policy?` yields
 * `contentSecurityPolicy` — the spelling of the PUBLIC
 * `content_security_policy` class DSL beside it. Every `mixed` name's
 * candidates are therefore subtracted after projection, applying the guard in
 * the TS namespace it actually gates on.
 */
import { rubyMethodToTs } from "@blazetrails/parity/conventions";

export type Visibility = "all-private" | "mixed";

/**
 * The TS spellings a `mixed` Ruby name retracts.
 *
 * A public Ruby writer `x=` and a private reader `x` are two distinct methods,
 * and Rails writes exactly that pair: `attr_writer :tagged_logger` beside a
 * private `tagged_logger`
 * (activesupport/lib/active_support/testing/tagged_logging.rb:8, :22), and
 * `attr_writer :run_after_load_paths` beside a private `run_after_load_paths`
 * (railties/lib/rails/application/routes_reloader.rb:12, :68). The writer's
 * candidate list carries the reader's spellings as well as its own
 * (`taggedLogger` alongside `setTaggedLogger`), so subtracting it wholesale
 * retracts the reader's privacy on the strength of the writer's publicity.
 * Subtract only the spellings the writer does not share with the reader.
 */
function subtractedCandidates(ruby: string, names: Map<string, Visibility>): readonly string[] {
  const candidates = rubyMethodToTs(ruby) ?? [];
  if (!ruby.endsWith("=")) return candidates;
  const stem = ruby.slice(0, -1);
  if (names.get(stem) !== "all-private") return candidates;
  const shared = new Set(rubyMethodToTs(stem) ?? []);
  return candidates.filter((c) => !shared.has(c));
}

export function projectPrivateNames(names: Map<string, Visibility>): Set<string> {
  const tsNames = new Set<string>();
  for (const [ruby, status] of names) {
    if (status !== "all-private") continue;
    for (const c of rubyMethodToTs(ruby) ?? []) tsNames.add(c);
  }
  for (const [ruby, status] of names) {
    if (status === "all-private") continue;
    for (const c of subtractedCandidates(ruby, names)) tsNames.delete(c);
  }
  return tsNames;
}
