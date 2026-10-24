const HEADONLY = new WeakMap<RegExp, RegExp>();
const SEARCH = new WeakMap<RegExp, RegExp>();

/**
 * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1667` `rb_define_class("StringScanner", rb_cObject)`.
 *
 * @noRailsEquivalent PERMANENT
 */
export class StringScanner {
  #str: string;
  #curr = 0;
  #regs: RegExpExecArray | null = null;

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:233` `strscan_initialize`.
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(str: string) {
    this.#str = str;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:357` `strscan_get_string`.
   *
   * @noRailsEquivalent PERMANENT
   */
  get string(): string {
    return this.#str;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:372` `strscan_set_string`, which
   * also resets the scan pointer and clears the match.
   *
   * @noRailsEquivalent PERMANENT
   */
  set string(str: string) {
    this.#str = str;
    this.#curr = 0;
    this.#regs = null;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:314` `strscan_reset`.
   *
   * @noRailsEquivalent PERMANENT
   */
  reset(): this {
    this.#curr = 0;
    this.#regs = null;
    return this;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:423` `strscan_get_pos`.
   *
   * @noRailsEquivalent PERMANENT
   */
  get pos(): number {
    return this.#curr;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:681` `strscan_scan`. The match
   * runs over the rest of the string (`strscan_do_scan`, `:605`), so `^` and
   * `\A` anchor at the scan pointer.
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
    re.lastIndex = 0;
    const m = re.exec(this.#str.slice(this.#curr));
    this.#regs = m;
    if (m === null) return null;
    this.#curr += m[0].length;
    return m[0];
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:778` `strscan_scan_until`: the
   * match is searched for over the rest of the string (`strscan_do_scan`,
   * `:605`, with `headonly` false), and the answer runs from the old scan
   * pointer to the end of the match.
   *
   * @noRailsEquivalent PERMANENT
   */
  scanUntil(pattern: RegExp): string | null {
    let re = SEARCH.get(pattern);
    if (re === undefined) {
      re = new RegExp(pattern.source, `${pattern.flags.replace(/[gy]/g, "")}g`);
      SEARCH.set(pattern, re);
    }
    const rest = this.#str.slice(this.#curr);
    re.lastIndex = 0;
    const m = re.exec(rest);
    this.#regs = m;
    if (m === null) return null;
    const prev = this.#curr;
    this.#curr += m.index + m[0].length;
    return this.#str.slice(prev, this.#curr);
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1132` `strscan_matched_size`.
   *
   * @noRailsEquivalent PERMANENT
   */
  matchedSize(): number | null {
    if (this.#regs === null) return null;
    return this.#regs[0].length;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1186` `strscan_aref`, `StringScanner#[]`
   * by group number.
   *
   * @noRailsEquivalent PERMANENT
   */
  get(idx: number): string | null {
    const regs = this.#regs;
    if (regs === null) return null;
    let i = idx;
    if (i < 0) i += regs.length;
    if (i < 0) return null;
    if (i >= regs.length) return null;
    return regs[i] ?? null;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:723` `strscan_skip`.
   *
   * @noRailsEquivalent PERMANENT
   */
  skip(pattern: RegExp): number | null {
    const matched = this.scan(pattern);
    return matched === null ? null : matched.length;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:962` `strscan_peek`.
   *
   * @noRailsEquivalent PERMANENT
   */
  peek(len: number): string {
    return this.#str.slice(this.#curr, this.#curr + len);
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1046` `strscan_eos_p`.
   *
   * @noRailsEquivalent PERMANENT
   */
  isEos(): boolean {
    return this.#curr >= this.#str.length;
  }
}
