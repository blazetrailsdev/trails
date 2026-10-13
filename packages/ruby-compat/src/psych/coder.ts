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
 * `Psych::Coder` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:9`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Coder {
  /** @noRailsEquivalent PERMANENT */
  declare [coderTag]: string | null;
  /** @noRailsEquivalent PERMANENT */
  declare [coderType]: ":map" | ":seq";
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
   * `Psych::Coder#seq=` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:91-94`).
   *
   * @noRailsEquivalent PERMANENT
   */
  setSeq(list: unknown[]): void {
    this[coderType] = ":seq";
    this[coderSeq] = list;
  }
}
