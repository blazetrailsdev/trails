import { pack } from "./array.js";

/**
 * `Base64` (`vendor/ruby/v3.3.11/lib/base64.rb:184`), narrowed to the one member Rails
 * calls on it.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Base64`
 * (`vendor/ruby/v3.3.11/lib/base64.rb:184`), which Rails uses but does not define.
 */
export class Base64 {
  /**
   * `Base64.strict_encode64` (`vendor/ruby/v3.3.11/lib/base64.rb:273`), which is
   * `[bin].pack("m0")` (`base64.rb:274`) — Base64 over the String's BYTES,
   * with no line breaks.
   *
   * `bin` is an ASCII-8BIT String in this package's representation — one code
   * unit per byte, what {@link IO.binread} answers and {@link IO.binwrite}
   * consumes.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Base64.strict_encode64`
   * (`vendor/ruby/v3.3.11/lib/base64.rb:273`).
   */
  static strictEncode64(bin: string): string {
    return pack([bin], "m0");
  }
}
