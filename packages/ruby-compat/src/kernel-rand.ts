/**
 * `vendor/ruby/random.c:1003` `limited_rand`, whose `limit` is INCLUSIVE:
 * whole 32-bit words are drawn under a mask of `limit`'s width and any value
 * above `limit` is retried, so the distribution stays uniform rather than
 * skewing the low residues a bare modulo would favour.
 */
function limitedRand(limit: bigint): bigint {
  if (limit === 0n) return 0n;
  const mask = (1n << BigInt(limit.toString(2).length)) - 1n;

  for (;;) {
    let val = 0n;
    for (let i = 0; i < mask.toString(2).length; i += 32) {
      val = (val << 32n) | BigInt(Math.floor(Math.random() * 0x1_0000_0000));
    }
    val &= mask;
    if (val <= limit) return val;
  }
}

/**
 * `vendor/ruby/random.c:1684` `rb_f_rand`: a non-nil, non-zero `max` draws an
 * Integer through `rand_int` (`random.c:1375`, `restrictive` false — so a
 * negative `max` is negated at `random.c:1385,1395` and drawn over its
 * magnitude), which asks `random_ulong_limited` for `0..max-1`
 * (`random.c:1387,1397`). Every other argument falls through to
 * `random_real`, a Float in `[0, 1)` (`random.c:1699`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel.rand`
 * (`vendor/ruby/random.c:1684`), which no Ruby file in any gem defines for the
 * port to mirror.
 */
export function kernelRand(max?: number | bigint | null): number | bigint {
  if (max != null) {
    let vmax = BigInt(max);
    if (vmax !== 0n) {
      if (vmax < 0n) vmax = -vmax;
      const v = limitedRand(vmax - 1n);
      return typeof max === "bigint" ? v : Number(v);
    }
  }
  return Math.random();
}
