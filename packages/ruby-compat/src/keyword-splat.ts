/**
 * `ignore_keyword_hash_p` (`vendor/ruby/v3.3.11/vm_args.c:435`), the argument
 * list a `**keyword_hash` splat contributes to a call: nothing when the hash is
 * empty, the hash itself otherwise. Spread it into the call,
 * `base.addIndex(name, columnName, ...keywordSplat(options))`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `ignore_keyword_hash_p` (`vendor/ruby/v3.3.11/vm_args.c:435`).
 */
export function keywordSplat<T extends object>(keywordHash: T): [] | [T] {
  if (Object.keys(keywordHash).length === 0) return [];
  return [keywordHash];
}
