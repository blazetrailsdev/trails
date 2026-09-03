/**
 * Ruby core `String#force_encoding` (`vendor/ruby/string.c:11005`
 * `rb_str_force_encoding`), which Rails inherits rather than defines.
 *
 * @noRailsEquivalent PERMANENT
 */
export function forceEncoding(string: string, encoding: string): string {
  const label = encoding.toUpperCase();
  if (label === "BINARY" || label === "ASCII-8BIT") return string;

  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) bytes[i] = string.charCodeAt(i) & 0xff;
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return string;
  }
}
