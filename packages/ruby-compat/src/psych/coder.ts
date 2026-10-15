/**
 * `Psych::Coder`'s `@tag` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:13`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderTag: unique symbol = Symbol("tag");

/**
 * `Psych::Coder`'s `@type` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:16`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderType: unique symbol = Symbol("type");

/**
 * `Psych::Coder`'s `@seq` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:14`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderSeq: unique symbol = Symbol("seq");

/**
 * `Psych::Coder`'s `@scalar` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:20`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderScalar: unique symbol = Symbol("scalar");

/**
 * `Psych::Coder` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:9`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Coder {
  /** @noRailsEquivalent PERMANENT */
  declare [coderTag]: string | null;
  /** @noRailsEquivalent PERMANENT */
  declare [coderType]: ":map" | ":seq" | ":scalar";
  /** @noRailsEquivalent PERMANENT */
  declare [coderScalar]: unknown;
  /** @noRailsEquivalent PERMANENT */
  declare [coderSeq]: unknown[];
  [key: string]: unknown;

  /** @noRailsEquivalent PERMANENT */
  constructor(tag: string | null) {
    Object.defineProperty(this, coderSeq, { value: [], writable: true });
    Object.defineProperty(this, coderType, { value: ":map", writable: true });
    Object.defineProperty(this, coderTag, { value: tag, writable: true });
  }

  /**
   * `Psych::Coder#represent_seq`
   * (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:49-52`).
   *
   * @noRailsEquivalent PERMANENT
   */
  representSeq(tag: string | null, list: unknown[]): void {
    this[coderTag] = tag;
    this.setSeq(list);
  }

  /**
   * `Psych::Coder#scalar` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:24-31`).
   *
   * @noRailsEquivalent PERMANENT
   */
  scalar(...args: unknown[]): unknown {
    if (args.length > 0) {
      [this[coderTag], this[coderScalar]] = args as [string | null, unknown];
      this[coderType] = ":scalar";
    }
    return this[coderScalar];
  }

  /**
   * `Psych::Coder#scalar=` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:66-69`).
   *
   * @noRailsEquivalent PERMANENT
   */
  setScalar(value: unknown): void {
    this[coderType] = ":scalar";
    this[coderScalar] = value;
  }

  /**
   * `Psych::Coder#map=` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:73-76`). The
   * map's pairs are the coder's own string-keyed properties, so `@map = map` replaces them.
   *
   * @noRailsEquivalent PERMANENT
   */
  setMap(map: Record<string, unknown>): void {
    this[coderType] = ":map";
    for (const k of Object.keys(this)) delete this[k];
    Object.assign(this, map);
  }

  /**
   * `Psych::Coder#seq=` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:91-94`).
   *
   * @noRailsEquivalent PERMANENT
   */
  setSeq(list: unknown[]): void {
    this[coderType] = ":seq";
    this[coderSeq] = list;
  }
}
