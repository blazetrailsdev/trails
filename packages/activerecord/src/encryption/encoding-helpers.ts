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

/**
 * Read a message header value as text. After `MessageSerializer.load`, decoded
 * header values are Buffers of raw bytes (mirroring Rails' ASCII-8BIT strings);
 * a freshly-built message may still hold the original string. Text headers (key
 * references, public tags) are UTF-8, so decode Buffers accordingly.
 *
 * @internal
 */
export function headerString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Buffer.isBuffer(value)) return value.toString("utf-8");
  return typeof value === "string" ? value : String(value);
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
