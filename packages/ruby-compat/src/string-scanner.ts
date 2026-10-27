import { StandardError } from "./standard-error.js";

const HEADONLY = new WeakMap<RegExp, RegExp>();
const SEARCH = new WeakMap<RegExp, RegExp>();
const REGS = new WeakMap<StringScanner, RegExpExecArray | null>();

/**
 * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1667` `rb_define_class("StringScanner", rb_cObject)`.
 *
 * @noRailsEquivalent PERMANENT
 */
export class StringScanner {
  #str: string;
  #curr = 0;
  #prev = 0;

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1668` `StringScanner::Error`.
   *
   * @noRailsEquivalent PERMANENT
   */
  static Error = class Error extends StandardError {};

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
    REGS.set(this, null);
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:314` `strscan_reset`.
   *
   * @noRailsEquivalent PERMANENT
   */
  reset(): this {
    this.#curr = 0;
    REGS.set(this, null);
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
    REGS.set(this, m);
    if (m === null) return null;
    this.#prev = this.#curr;
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
    REGS.set(this, m);
    if (m === null) return null;
    this.#prev = this.#curr;
    this.#curr += m.index + m[0].length;
    return this.#str.slice(this.#prev, this.#curr);
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:884` `strscan_getch`: one
   * character, so a surrogate pair is read whole.
   *
   * @noRailsEquivalent PERMANENT
   */
  getch(): string | null {
    REGS.set(this, null);
    if (this.isEos()) return null;
    const cp = this.#str.codePointAt(this.#curr)!;
    const len = cp > 0xffff ? 2 : 1;
    this.#prev = this.#curr;
    this.#curr += len;
    const ch = this.#str.slice(this.#prev, this.#curr);
    REGS.set(this, Object.assign([ch], { index: this.#prev, input: this.#str }) as RegExpExecArray);
    return ch;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1000` `strscan_unscan`.
   *
   * @noRailsEquivalent PERMANENT
   */
  unscan(): this {
    if ((REGS.get(this) ?? null) === null) {
      throw new StringScanner.Error("unscan failed: previous match record not exist");
    }
    this.#curr = this.#prev;
    REGS.set(this, null);
    return this;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1132` `strscan_matched_size`.
   *
   * @noRailsEquivalent PERMANENT
   */
  matchedSize(): number | null {
    const regs = REGS.get(this) ?? null;
    if (regs === null) return null;
    return regs[0].length;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1186` `strscan_aref`, `StringScanner#[]`
   * by group number.
   *
   * @noRailsEquivalent PERMANENT
   */
  get(idx: number): string | null {
    const regs = REGS.get(this) ?? null;
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

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:332` `strscan_terminate`.
   *
   * @noRailsEquivalent PERMANENT
   */
  terminate(): this {
    this.#curr = this.#str.length;
    REGS.set(this, null);
    return this;
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1109` `strscan_matched`.
   *
   * @noRailsEquivalent PERMANENT
   */
  matched(): string | null {
    const regs = REGS.get(this) ?? null;
    if (regs === null) return null;
    return regs[0];
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1320` `strscan_pre_match`.
   *
   * @noRailsEquivalent PERMANENT
   */
  preMatch(): string | null {
    const regs = REGS.get(this) ?? null;
    if (regs === null) return null;
    return this.#str.slice(0, this.#curr - regs[0].length);
  }

  /**
   * `vendor/ruby/v3.3.11/ext/strscan/strscan.c:1357` `strscan_rest`.
   *
   * @noRailsEquivalent PERMANENT
   */
  rest(): string {
    return this.#str.slice(this.#curr);
  }
}
