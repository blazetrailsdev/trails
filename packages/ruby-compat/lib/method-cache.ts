/**
 * Mirrors: MRI's `rb_clear_method_cache` — vendor/ruby/v3.3.11/vm_method.c:295,
 * which every method-table or ancestry change calls so a call cache keyed on
 * the old table misses. trails keeps one serial for every class: a cache reads
 * {@link methodCacheSerial} and is stale once it differs.
 *
 * @noRailsEquivalent PERMANENT
 * @perf 100ns — PERMANENT
 */
export let methodCacheSerial = 0;

/**
 * `rb_clear_method_cache` (`vendor/ruby/v3.3.11/vm_method.c:295`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbClearMethodCache(): void {
  methodCacheSerial++;
}
