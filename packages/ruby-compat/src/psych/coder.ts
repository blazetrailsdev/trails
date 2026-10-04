/**
 * `Psych::Coder`'s `@tag` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:13`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const coderTag: unique symbol = Symbol("tag");

/**
 * `Psych::Coder` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/coder.rb:9`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Coder {
  /** @noRailsEquivalent PERMANENT */
  declare [coderTag]: string | null;
  [key: string]: unknown;

  /** @noRailsEquivalent PERMANENT */
  constructor(tag: string | null) {
    Object.defineProperty(this, coderTag, { value: tag });
  }
}
