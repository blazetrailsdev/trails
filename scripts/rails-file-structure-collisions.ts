/**
 * Last-segment collision resolution for
 * scripts/build-rails-file-structure-manifest.ts.
 *
 * The method-order manifest is keyed by the TS class NAME, which is the Ruby
 * fqn's last segment (`Arel::Nodes::Casted` → `Casted`). Two Ruby class
 * entities declared in one file can share that segment, and then only one of
 * them can own the manifest key.
 */

export const lastSegment = (fqn: string): string => fqn.split("::").pop() ?? fqn;

const depth = (fqn: string): number => fqn.split("::").length;

/**
 * Picks the fqn that owns a colliding manifest key, or `null` when the
 * collision has no principled winner.
 *
 * Rails' live case is a class nested inside a same-named parent:
 * `ActionDispatch::Journey::Scanner::Scanner < StringScanner`
 * (actionpack/lib/action_dispatch/journey/scanner.rb:20) inside
 * `ActionDispatch::Journey::Scanner` (scanner.rb:9). The bare TS name belongs
 * to the SHALLOWER fqn — that is the class the port declares as `Scanner` —
 * so the shallowest fqn wins and the deeper one is dropped. Dropping only the
 * LOSER keeps the winner's own order enforced; dropping the whole bucket, as
 * this builder used to, silently disabled the rule for the entire file.
 *
 * A tie at the shallowest depth (`Foo::Builder` vs `Bar::Builder`, siblings in
 * one file) has no winner for the bare name; see {@link qualifyByParent}.
 */
export const resolveLastSegmentCollision = (fqns: Iterable<string>): string | null => {
  const byDepth = [...fqns].sort((a, b) => depth(a) - depth(b));
  if (byDepth.length === 0) return null;
  if (byDepth.length === 1 || depth(byDepth[0]) < depth(byDepth[1])) return byDepth[0];
  return null;
};

/**
 * Keys each fqn of a tied collision by its enclosing class as well as its
 * name: `Thor::UndefinedCommandError::SpellChecker` and
 * `Thor::UnknownArgumentError::SpellChecker`
 * (vendor/thor/v1.3.2/lib/thor/error.rb:25-39,66-81) become
 * `UndefinedCommandError.SpellChecker` and `UnknownArgumentError.SpellChecker`,
 * the spelling of a class declared in a namespace merged onto its parent.
 *
 * Returns `null` when an fqn has no parent or two of them share one, so the
 * caller fails the build rather than warning: a dropped bucket enforces
 * nothing and reports nothing afterwards.
 */
export const qualifyByParent = (fqns: Iterable<string>): Map<string, string> | null => {
  const keys = new Map<string, string>();
  for (const fqn of fqns) {
    const segments = fqn.split("::");
    if (segments.length < 2) return null;
    keys.set(fqn, segments.slice(-2).join("."));
  }
  return new Set(keys.values()).size === keys.size ? keys : null;
};
