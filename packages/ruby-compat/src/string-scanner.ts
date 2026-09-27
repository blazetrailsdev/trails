const HEADONLY = new WeakMap<RegExp, RegExp>();

/**
 * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1667` `rb_define_class("StringScanner", rb_cObject)`.
 *
 * @noRailsEquivalent PERMANENT
 */
export class StringScanner {
  readonly #str: string;
  #curr = 0;

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:233` `strscan_initialize`.
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(str: string) {
    this.#str = str;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:681` `strscan_scan`.
   *
   * @noRailsEquivalent PERMANENT
   */
  scan(pattern: RegExp): string | null {
    if (this.#str.length - this.#curr < 0) return null;
    let re = HEADONLY.get(pattern);
    if (re === undefined) {
      re = new RegExp(pattern.source, `${pattern.flags.replace(/[gy]/g, "")}y`);
      HEADONLY.set(pattern, re);
    }
    re.lastIndex = this.#curr;
    const m = re.exec(this.#str);
    if (m === null) return null;
    this.#curr += m[0].length;
    return m[0];
  }
}
