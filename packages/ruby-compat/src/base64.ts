import { ArgumentError } from "./argument-error.js";
import { pack } from "./array.js";
import { chomp } from "./string/chomp.js";
import { trTrans } from "./string/tr.js";

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
   * `Base64.encode64` (`vendor/ruby/v3.3.11/lib/base64.rb:219`), which is
   * `[bin].pack("m")` (`base64.rb:220`): Base64 over the String's BYTES, with a
   * line feed after every 60 encoded characters and at the end.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Base64.encode64`
   * (`vendor/ruby/v3.3.11/lib/base64.rb:219`).
   */
  static encode64(bin: string): string {
    return pack([bin], "m");
  }

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

  /**
   * `Base64.strict_decode64` (`vendor/ruby/v3.3.11/lib/base64.rb:297`), which is
   * `str.unpack1("m0")` (`base64.rb:298`): the strict decode of
   * `vendor/ruby/v3.3.11/pack.c:1433-1463`, raising `ArgumentError` for a
   * character outside the alphabet, a group short of four characters,
   * misplaced padding, or non-zero bits under the padding. It answers an
   * ASCII-8BIT String, one code unit per byte.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Base64.strict_decode64`
   * (`vendor/ruby/v3.3.11/lib/base64.rb:297`).
   */
  static strictDecode64(str: string): string {
    const send = str.length;
    const xtable = (ch: string | undefined): number => (ch == null ? -1 : B64_TABLE.indexOf(ch));
    let res = "";
    let s = 0;
    let a = -1;
    let b = -1;
    let c = 0;
    let d = 0;
    while (s < send) {
      c = d = -1;
      a = xtable(str[s++]);
      if (s >= send || a === -1) throw new ArgumentError("invalid base64");
      b = xtable(str[s++]);
      if (s >= send || b === -1) throw new ArgumentError("invalid base64");
      if (str[s] === "=") {
        if (s + 2 === send && str[s + 1] === "=") break;
        throw new ArgumentError("invalid base64");
      }
      c = xtable(str[s++]);
      if (s >= send || c === -1) throw new ArgumentError("invalid base64");
      if (s + 1 === send && str[s] === "=") break;
      d = xtable(str[s++]);
      if (d === -1) throw new ArgumentError("invalid base64");
      res += String.fromCharCode(((a << 2) | (b >> 4)) & 0xff);
      res += String.fromCharCode(((b << 4) | (c >> 2)) & 0xff);
      res += String.fromCharCode(((c << 6) | d) & 0xff);
    }
    if (c === -1) {
      res += String.fromCharCode(((a << 2) | (b >> 4)) & 0xff);
      if (b & 0xf) throw new ArgumentError("invalid base64");
    } else if (d === -1) {
      res += String.fromCharCode(((a << 2) | (b >> 4)) & 0xff);
      res += String.fromCharCode(((b << 4) | (c >> 2)) & 0xff);
      if (c & 0x3) throw new ArgumentError("invalid base64");
    }
    return res;
  }

  /**
   * `Base64.urlsafe_encode64` (`vendor/ruby/v3.3.11/lib/base64.rb:328`): the
   * strict encoding with the URL-safe alphabet, and without its padding when
   * `padding` is false.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Base64.urlsafe_encode64`
   * (`vendor/ruby/v3.3.11/lib/base64.rb:328`).
   */
  static urlsafeEncode64(bin: string, { padding = true }: { padding?: boolean } = {}): string {
    let str = Base64.strictEncode64(bin);
    if (!padding) {
      const chomped = chomp(str, "==");
      str = chomped !== str ? chomped : chomp(str, "=");
    }
    str = trTrans(str, "+/", "-_", false);
    return str;
  }

  /**
   * `Base64.urlsafe_decode64` (`vendor/ruby/v3.3.11/lib/base64.rb:351`): pads
   * an unpadded input out to a multiple of four, maps the URL-safe alphabet
   * back, and decodes strictly.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Base64.urlsafe_decode64`
   * (`vendor/ruby/v3.3.11/lib/base64.rb:351`).
   */
  static urlsafeDecode64(str: string): string {
    if (!str.endsWith("=") && str.length % 4 !== 0) {
      str = str.padEnd((str.length + 3) & ~3, "=");
      str = trTrans(str, "-_", "+/", false);
    } else {
      str = trTrans(str, "-_", "+/", false);
    }
    return Base64.strictDecode64(str);
  }
}
