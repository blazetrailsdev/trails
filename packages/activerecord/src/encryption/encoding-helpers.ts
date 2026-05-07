/**
 * Shared encoding normalization helpers used by Encryptor and
 * EncryptedAttributeType for deterministic encryption.
 */

/** @internal */
export function normalizeEncoding(encoding: string): "utf8" | "ascii" | "latin1" | null {
  switch (encoding.toLowerCase().replace(/[^a-z0-9]/g, "")) {
    case "utf8":
      return "utf8";
    case "ascii":
    case "usascii":
      return "ascii";
    case "latin1":
    case "iso88591":
    case "binary":
    case "ascii8bit":
      return "latin1";
    default:
      return null;
  }
}

/** @internal */
export function replaceUnencodable(value: string, maxCodePoint: number): string {
  const out: string[] = [];
  for (const char of value) {
    const cp = char.codePointAt(0)!;
    out.push(cp > maxCodePoint || (cp >= 0xd800 && cp <= 0xdfff) ? "?" : char);
  }
  return out.join("");
}
