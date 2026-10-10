import { ArgumentError } from "./argument-error.js";

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

/**
 * `rb_get_kwargs` (`vendor/ruby/v3.3.11/class.c:2413`) for a header with no
 * `**rest`: every key of `keywordHash` that `table` does not declare raises
 * `unknown_keyword_error` (`class.c:2373`), whose message is
 * `rb_keyword_error_new`'s (`class.c:2346`). An `undefined`-valued key is an
 * absent keyword. The `required` / `optional` counts, the `values` out-array
 * and the found-keyword return value are not ported.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_get_kwargs` (`vendor/ruby/v3.3.11/class.c:2413`).
 */
export function rbGetKwargs(keywordHash: object, table: readonly string[]): void {
  const keys = Object.entries(keywordHash)
    .filter(([key, value]) => value !== undefined && !table.includes(key))
    .map(([key]) => `:${key}`);
  if (keys.length > 0) {
    throw new ArgumentError(`unknown keyword${keys.length > 1 ? "s" : ""}: ${keys.join(", ")}`);
  }
}

/**
 * `rb_scan_args_set`'s option-hash capture
 * (`vendor/ruby/v3.3.11/include/ruby/internal/scan_args.h:400-407`) for a
 * `(*rest, **keywords)` header: a trailing Hash is popped off `argv` as the
 * keywords (`rb_scan_args_keyword_p`, `scan_args.h:253`), and everything else
 * is the splat.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `rb_scan_args_set` (`vendor/ruby/v3.3.11/include/ruby/internal/scan_args.h:400`).
 */
export function rbScanArgs<K extends object = Record<string, unknown>>(
  argv: readonly unknown[],
): [unknown[], K] {
  const last = argv[argv.length - 1];
  if (last !== null && typeof last === "object" && last.constructor === Object) {
    return [argv.slice(0, -1), { ...last } as K];
  }
  return [[...argv], {} as K];
}
