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

/**
 * `core_hash_merge_kwd` (`vendor/ruby/v3.3.11/vm.c:3696`), what a `**kw` splat in
 * a hash or keyword literal compiles to: `f(name: name, **options)` is
 * `f(coreHashMergeKwd({ name }, options))`. Each key of `kw` is stored over
 * `hash`'s, except an `undefined`-valued one, which is an absent keyword and
 * which a JS spread would store.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `core_hash_merge_kwd` (`vendor/ruby/v3.3.11/vm.c:3696`).
 */
export function coreHashMergeKwd<H extends object, K extends object>(hash: H, kw: K): H & K {
  for (const [key, value] of Object.entries(kw)) {
    if (value !== undefined) (hash as Record<string, unknown>)[key] = value;
  }
  return hash as H & K;
}
