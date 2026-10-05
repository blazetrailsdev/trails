import { pack } from "./array.js";

const B64_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * `Base64` (`vendor/ruby/v3.3.11/lib/base64.rb:184`), narrowed to the members Rails
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

  /**
   * `Base64.decode64` (`vendor/ruby/v3.3.11/lib/base64.rb:241`), which is
   * `str.unpack1("m")` (`base64.rb:242`): the lenient decode of
   * `vendor/ruby/v3.3.11/pack.c:1463`, skipping every character outside
   * the alphabet and stopping at padding in the third or fourth place of a group. It answers an ASCII-8BIT String, one code
   * unit per byte, the form {@link Base64.strictEncode64} consumes.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Base64.decode64`
   * (`vendor/ruby/v3.3.11/lib/base64.rb:241`).
   */
  static decode64(str: string): string {
    let res = "";
    let acc = 0;
    let bits = 0;
    let n = 0;
    for (const ch of str) {
      const value = B64_TABLE.indexOf(ch);
      if (value === -1) {
        if (ch === "=" && n % 4 >= 2) break;
        continue;
      }
      n++;
      acc = ((acc << 6) | value) & 0xffff;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        res += String.fromCharCode((acc >> bits) & 0xff);
      }
    }
    return res;
  }
}
