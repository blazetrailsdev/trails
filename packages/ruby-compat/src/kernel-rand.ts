/**
 * Ruby's `Kernel.rand` (`vendor/ruby/random.c:1684` `rb_f_rand` → `vendor/ruby/random.c:1557` `random_rand`),
 * the pseudo-random draw Rack reaches for directly
 * (`vendor/rack-session/lib/rack/session/abstract/id.rb:300`). Ruby core, so
 * no gem file declares it.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel.rand`
 * (`vendor/ruby/random.c:1684`), which Rack calls without defining, so
 * no Rails or gem file declares the module this file's single export lives in.
 */

/**
 * `vendor/ruby/random.c:1684` `rb_f_rand`: with a positive Integer `max` the result
 * is a uniformly drawn Integer in `0...max`; with `0` or no argument it is a
 * Float in `[0, 1)`. `random_ulong_limited` draws whole words and rejects any
 * value above the largest multiple of the range, so the distribution stays
 * uniform rather than skewing the low residues a bare modulo would favour.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel.rand`
 * (`vendor/ruby/random.c:1684`), which no Ruby file in any gem defines
 * for the port to mirror.
 */
export function kernelRand(max?: number | bigint): number | bigint {
  if (max == null || max === 0 || max === 0n) return Math.random();

  const limit = BigInt(max);
  const bits = limit.toString(2).length;
  const mask = (1n << BigInt(bits)) - 1n;

  for (;;) {
    let value = 0n;
    for (let drawn = 0; drawn < bits; drawn += 32) {
      value = (value << 32n) | BigInt(Math.floor(Math.random() * 0x1_0000_0000));
    }
    value &= mask;
    if (value < limit) return typeof max === "bigint" ? value : Number(value);
  }
}
