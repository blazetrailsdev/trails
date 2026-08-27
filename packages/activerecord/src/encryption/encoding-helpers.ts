/**
 * @noRailsEquivalent PERMANENT Ruby strings carry an Encoding object and re-encode with String#encode (encryption/encryptor.rb:166); JS strings carry none, so the encoding arms are modelled here.
 */

/**
 * Shared encoding normalization helpers used by Encryptor and
 * EncryptedAttributeType for deterministic encryption.
 */

/**
 * @internal
 * @noRailsEquivalent PERMANENT Ruby strings carry an Encoding object (encryption/encryptor.rb:166); JS strings do not.
 */
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
 * values are raw-byte Buffers (Rails' ASCII-8BIT strings); a fresh message may
 * still hold the original string. Text headers are UTF-8, so decode accordingly.
 *
 * @internal
 * @noRailsEquivalent PERMANENT Ruby reads an ASCII-8BIT header string directly (encryption/message_serializer.rb:24); TS must decode the Buffer.
 */
export function headerString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Buffer.isBuffer(value)) return value.toString("utf-8");
  return typeof value === "string" ? value : String(value);
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT Ruby's String#encode with :replace does this (encryption/encryptor.rb:166); JS has no encoding-aware replacement.
 */
export function replaceUnencodable(value: string, maxCodePoint: number): string {
  const out: string[] = [];
  for (const char of value) {
    const cp = char.codePointAt(0)!;
    out.push(cp > maxCodePoint || (cp >= 0xd800 && cp <= 0xdfff) ? "?" : char);
  }
  return out.join("");
}
