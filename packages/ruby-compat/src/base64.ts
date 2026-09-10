/**
 * `Base64` (`vendor/ruby/lib/base64.rb:184`), narrowed to the one member Rails
 * calls on it.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Base64`
 * (`vendor/ruby/lib/base64.rb:184`), which Rails uses but does not define.
 */
export class Base64 {
  /**
   * `Base64.strict_encode64` (`vendor/ruby/lib/base64.rb:273`), which is
   * `[bin].pack("m0")` (`base64.rb:274`) — Base64 over the String's BYTES,
   * with no line breaks.
   *
   * `bin` is an ASCII-8BIT String in this package's representation — one code
   * unit per byte, what {@link IO.binread} answers and {@link IO.binwrite}
   * consumes — so `btoa` takes it directly, and throws on a code unit past
   * `0xff` rather than encoding bytes the caller never held.
   *
   * MRI reaches the same result through `pack`, which reads `RSTRING_PTR` and
   * re-encodes nothing (`vendor/ruby/pack.c:663-690`); this package's {@link
   * pack} runs its argument through `TextEncoder` (`array.ts:102`) and so
   * UTF-8-expands every byte from `0x80` up, which is why this does not
   * delegate to it. Converging that is story
   * `pack-m-directive-utf8-expands-high-bytes`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Base64.strict_encode64`
   * (`vendor/ruby/lib/base64.rb:273`).
   */
  static strictEncode64(bin: string): string {
    return btoa(bin);
  }
}
