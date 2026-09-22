import { IndexError } from "./index-error.js";
import { rbHash } from "./rb-hash.js";
import { Range } from "./range.js";
import { bytes } from "./string/bytes.js";
import { stringInspect } from "./string/inspect.js";
import { num2long, rbStrSublen } from "./string/support.js";

/**
 * Ruby core `MatchData` (`vendor/ruby/re.c:4724`, `Init_Regexp`), built over a
 * `d`-flagged JS match. Offsets are characters, as Onigmo's are for a UTF-8
 * String. A pattern with named groups captures only those, as Onigmo does when
 * `ONIG_OPTION_CAPTURE_GROUP` is off.
 *
 * @noRailsEquivalent PERMANENT
 */
export class MatchData {
  readonly #regexp: RegExp;
  readonly #string: string;
  readonly #spans: ([number, number] | undefined)[];
  readonly #names: string[];

  /**
   * `match_alloc` (`vendor/ruby/re.c:970`) filled from a JS match, as
   * `rb_reg_search_set_match` fills the registers.
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(regexp: RegExp, string: string, match: RegExpExecArray) {
    this.#regexp = regexp;
    this.#string = string;
    const indices = match.indices!;
    const named = indices.groups ?? {};
    this.#names = Object.keys(named);
    const spans = this.#names.length
      ? [indices[0], ...this.#names.map((name) => named[name])]
      : Array.from(indices);
    this.#spans = spans as ([number, number] | undefined)[];
  }

  #text(n: number): string | null {
    const span = this.#spans[n];
    return span ? this.#string.slice(span[0], span[1]) : null;
  }

  #nth(backref: unknown): number {
    if (typeof backref === "string") {
      const name = backref.startsWith(":") ? backref.slice(1) : backref;
      const i = this.#names.indexOf(name);
      if (i < 0) throw new IndexError(`undefined group name reference: ${name}`);
      return i + 1;
    }
    const n = num2long(backref);
    if (n < 0 || n >= this.#spans.length) throw new IndexError(`index ${n} out of matches`);
    return n;
  }

  /**
   * `MatchData#regexp` (`vendor/ruby/re.c:1128` `match_regexp`).
   *
   * @noRailsEquivalent PERMANENT
   */
  regexp(): RegExp {
    return this.#regexp;
  }

  /**
   * `MatchData#names` (`vendor/ruby/re.c:1163` `match_names`).
   *
   * @noRailsEquivalent PERMANENT
   */
  names(): string[] {
    return [...this.#names];
  }

  /**
   * `MatchData#size` / `#length` (`vendor/ruby/re.c:1184` `match_size`).
   *
   * @noRailsEquivalent PERMANENT
   */
  size(): number {
    return this.#spans.length;
  }

  /**
   * `MatchData#offset` (`vendor/ruby/re.c:1250` `match_offset`).
   *
   * @noRailsEquivalent PERMANENT
   */
  offset(n: unknown): [number | null, number | null] {
    return [this.begin(n), this.end(n)];
  }

  /**
   * `MatchData#byteoffset` (`vendor/ruby/re.c:1285` `match_byteoffset`).
   *
   * @noRailsEquivalent PERMANENT
   */
  byteoffset(n: unknown): [number | null, number | null] {
    const span = this.#spans[this.#nth(n)];
    if (!span) return [null, null];
    const at = (i: number) => bytes(this.#string.slice(0, i)).length;
    return [at(span[0]), at(span[1])];
  }

  /**
   * `MatchData#begin` (`vendor/ruby/re.c:1309` `match_begin`).
   *
   * @noRailsEquivalent PERMANENT
   */
  begin(n: unknown): number | null {
    const span = this.#spans[this.#nth(n)];
    return span ? rbStrSublen(this.#string, span[0]) : null;
  }

  /**
   * `MatchData#end` (`vendor/ruby/re.c:1335` `match_end`).
   *
   * @noRailsEquivalent PERMANENT
   */
  end(n: unknown): number | null {
    const span = this.#spans[this.#nth(n)];
    return span ? rbStrSublen(this.#string, span[1]) : null;
  }

  /**
   * `MatchData#match` (`vendor/ruby/re.c:1377` `match_nth`).
   *
   * @noRailsEquivalent PERMANENT
   */
  match(n: unknown): string | null {
    return this.#text(this.#nth(n));
  }

  /**
   * `MatchData#match_length` (`vendor/ruby/re.c:1421` `match_nth_length`).
   *
   * @noRailsEquivalent PERMANENT
   */
  matchLength(n: unknown): number | null {
    const text = this.#text(this.#nth(n));
    return text === null ? null : [...text].length;
  }

  /**
   * `MatchData#to_a` (`vendor/ruby/re.c:2053` `match_to_a`).
   *
   * @noRailsEquivalent PERMANENT
   */
  toA(): (string | null)[] {
    return this.#spans.map((_, i) => this.#text(i));
  }

  /**
   * `MatchData#captures` (`vendor/ruby/re.c:2075` `match_captures`).
   *
   * @noRailsEquivalent PERMANENT
   */
  captures(): (string | null)[] {
    return this.toA().slice(1);
  }

  /**
   * `MatchData#[]` (`vendor/ruby/re.c:2187` `match_aref`): an index, a name, a
   * `(start, length)` pair or a Range, as `Array#[]` reads `to_a`.
   *
   * @noRailsEquivalent PERMANENT
   */
  get(idx: unknown, length?: number): string | null | (string | null)[] {
    if (length !== undefined || idx instanceof Range) {
      const all = this.toA();
      if (idx instanceof Range) {
        const beg = (idx.begin as number | null) ?? 0;
        const b = beg < 0 ? beg + all.length : beg;
        const e0 = (idx.end as number | null) ?? all.length - 1;
        const e = (e0 < 0 ? e0 + all.length : e0) + (idx.excludeEnd && idx.end !== null ? 0 : 1);
        return b < 0 || b > all.length ? null : all.slice(b, Math.max(b, e));
      }
      const b = (idx as number) < 0 ? (idx as number) + all.length : (idx as number);
      return b < 0 || b > all.length || length! < 0 ? null : all.slice(b, b + length!);
    }
    if (typeof idx === "number") {
      const n = idx < 0 ? idx + this.#spans.length : idx;
      return n < 0 || n >= this.#spans.length ? null : this.#text(n);
    }
    return this.#text(this.#nth(idx));
  }

  /**
   * `MatchData#values_at` (`vendor/ruby/re.c:2256` `match_values_at`).
   *
   * @noRailsEquivalent PERMANENT
   */
  valuesAt(...indexes: unknown[]): (string | null)[] {
    return indexes.map((i) => this.get(i) as string | null);
  }

  /**
   * `MatchData#named_captures` (`vendor/ruby/re.c:2377` `match_named_captures`),
   * keyed by `":name"` under `symbolizeNames`.
   *
   * @noRailsEquivalent PERMANENT
   */
  namedCaptures(options: { symbolizeNames?: boolean } = {}): Record<string, string | null> {
    return Object.fromEntries(
      this.#names.map((name, i) => [options.symbolizeNames ? `:${name}` : name, this.#text(i + 1)]),
    );
  }

  /**
   * `MatchData#deconstruct_keys` (`vendor/ruby/re.c:2430` `match_deconstruct_keys`).
   *
   * @noRailsEquivalent PERMANENT
   */
  deconstructKeys(keys: string[] | null): Record<string, string | null> {
    const all = this.namedCaptures({ symbolizeNames: true });
    if (keys === null) return all;
    const result: Record<string, string | null> = {};
    for (const key of keys) {
      if (!(key in all)) break;
      result[key] = all[key];
    }
    return result;
  }

  /**
   * `MatchData#pre_match` (`vendor/ruby/re.c:1906` `rb_reg_match_pre`).
   *
   * @noRailsEquivalent PERMANENT
   */
  preMatch(): string {
    return this.#string.slice(0, this.#spans[0]![0]);
  }

  /**
   * `MatchData#post_match` (`vendor/ruby/re.c:1939` `rb_reg_match_post`).
   *
   * @noRailsEquivalent PERMANENT
   */
  postMatch(): string {
    return this.#string.slice(this.#spans[0]![1]);
  }

  /**
   * `MatchData#to_s` (`vendor/ruby/re.c:2301` `match_to_s`).
   *
   * @noRailsEquivalent PERMANENT
   */
  toS(): string {
    return this.#text(0)!;
  }

  /**
   * `MatchData#string` (`vendor/ruby/re.c:2496` `match_string`).
   *
   * @noRailsEquivalent PERMANENT
   */
  string(): string {
    return this.#string;
  }

  /**
   * `MatchData#inspect` (`vendor/ruby/re.c:2543` `match_inspect`).
   *
   * @noRailsEquivalent PERMANENT
   */
  inspect(): string {
    const parts = this.toA().map((text, i) => {
      const shown = text === null ? "nil" : stringInspect(text);
      if (i === 0) return shown;
      return `${this.#names.length ? this.#names[i - 1] : i}:${shown}`;
    });
    return `#<MatchData ${parts.join(" ")}>`;
  }

  /**
   * `MatchData#hash` (`vendor/ruby/re.c:3510` `match_hash`).
   *
   * @noRailsEquivalent PERMANENT
   */
  hash(): number {
    return rbHash([this.#regexp.source, this.#string, ...this.#spans.flat()]);
  }

  /**
   * `MatchData#==` / `#eql?` (`vendor/ruby/re.c:3536` `match_equal`).
   *
   * @noRailsEquivalent PERMANENT
   */
  equals(other: unknown): boolean {
    if (!(other instanceof MatchData)) return false;
    return (
      this.#string === other.#string &&
      this.#regexp.source === other.#regexp.source &&
      this.#regexp.flags === other.#regexp.flags &&
      JSON.stringify(this.#spans) === JSON.stringify(other.#spans)
    );
  }

  /**
   * `MatchData#eql?` (`vendor/ruby/re.c:3536` `match_equal`).
   *
   * @noRailsEquivalent PERMANENT
   */
  eql(other: unknown): boolean {
    return this.equals(other);
  }
}
