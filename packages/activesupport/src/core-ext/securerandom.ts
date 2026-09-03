import { getCrypto } from "@blazetrails/ruby-compat";

/**
 * Mirrors: SecureRandom (core_ext/securerandom.rb).
 */

const DIGITS = "0123456789".split("");
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz".split("");

export const BASE58_ALPHABET = [...DIGITS, ...UPPERCASE, ...LOWERCASE].filter(
  (c) => !["0", "O", "I", "l"].includes(c),
);
export const BASE36_ALPHABET = [...DIGITS, ...LOWERCASE];

/**
 * Ruby's `SecureRandom.random_number(n)`. Rejection-sampled so every value in
 * `0...n` is equally likely, the way MRI's implementation is.
 *
 * @noRailsEquivalent SecureRandom.random_number is Ruby stdlib, not a Rails
 * core_ext member; trails has no stdlib to inherit it from, so the two callers
 * below need it spelled out. Not exported.
 */
function randomNumber(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  for (;;) {
    const bytes = getCrypto().randomBytes(4);
    const value = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
    if (value < limit) return value % n;
  }
}

/**
 * SecureRandom.base58 generates a random base58 string.
 *
 * Mirrors: core_ext/securerandom.rb:23-29 (the `random_bytes` branch — trails
 * has no `SecureRandom.alphanumeric(n, chars:)` to delegate to).
 */
export function base58(n: number | null = 16): string {
  return Array.from(getCrypto().randomBytes(n ?? 16))
    .map((byte) => {
      let idx = byte % 64;
      if (idx >= 58) idx = randomNumber(58);
      return BASE58_ALPHABET[idx];
    })
    .join("");
}

/**
 * SecureRandom.base36 generates a random base36 string in lowercase.
 *
 * Mirrors: core_ext/securerandom.rb:51-57.
 */
export function base36(n: number | null = 16): string {
  return Array.from(getCrypto().randomBytes(n ?? 16))
    .map((byte) => {
      let idx = byte % 64;
      if (idx >= 36) idx = randomNumber(36);
      return BASE36_ALPHABET[idx];
    })
    .join("");
}
