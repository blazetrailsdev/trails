/**
 * Mirrors: i18n/lib/i18n/locale/tag/rfc4646.rb
 *
 * RFC 4646/47 compliant Locale tag implementation that parses locale tags to
 * subtags such as language, script, region, variant etc.
 *
 * For more information see by http://en.wikipedia.org/wiki/IETF_language_tag
 *
 * Rfc4646::Parser does not implement grandfathered tags.
 */

import type { Locale } from "../../i18n.js";
import { parent, parents, selfAndParents, type Parents } from "./parents.js";

export const RFC4646_SUBTAGS = [
  "language",
  "script",
  "region",
  "variant",
  "extension",
  "privateuse",
  "grandfathered",
] as const;

export const RFC4646_FORMATS: Record<string, string> = {
  language: "downcase",
  script: "capitalize",
  region: "upcase",
  variant: "downcase",
};

/** @internal Ruby's `String#downcase` / `#capitalize` / `#upcase`, for `send`. */
const STRING_FORMATS: Record<string, (value: string) => string> = {
  downcase: (value) => value.toLowerCase(),
  capitalize: (value) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(),
  upcase: (value) => value.toUpperCase(),
};

export class Rfc4646 implements Parents {
  /**
   * Parses the given tag and returns a Tag instance if it is valid.
   * Returns false if the given tag is not valid according to RFC 4646.
   */
  static tag(tag: string): Rfc4646 | false {
    const matches = Rfc4646.parser().match(tag);
    return matches ? new Rfc4646(...matches) : false;
  }

  static parser(): typeof Parser {
    parserStore ??= Parser;
    return parserStore;
  }

  static setParser(parser: typeof Parser): void {
    parserStore = parser;
  }

  /** @internal `Struct.new(*RFC4646_SUBTAGS)`'s slots, which the readers below read as `self[name]`. */
  readonly #slots: Record<string, string | null> = {};

  #tag?: string;

  constructor(...values: (string | null)[]) {
    RFC4646_SUBTAGS.forEach((name, i) => {
      this.#slots[name] = values[i] ?? null;
    });
  }

  /** Mirrors: `include Parents` (rfc4646.rb:30). */
  parent = parent;
  parents = parents;
  selfAndParents = selfAndParents;

  /**
   * @internal The block `RFC4646_FORMATS.each { |name, format| define_method(name)
   * { self[name].send(format) unless self[name].nil? } }` (rfc4646.rb:32-34)
   * installs, plus the plain slot reader `Struct` generates for the three
   * subtags that carry no format. TypeScript has no `define_method`, so the
   * seven readers are written out and share the one block body.
   */
  #subtag(name: string): string | null {
    const value = this.#slots[name];
    if (value == null) return null;
    const format = RFC4646_FORMATS[name];
    return format === undefined ? value : STRING_FORMATS[format](value);
  }

  get language(): string | null {
    return this.#subtag("language");
  }

  get script(): string | null {
    return this.#subtag("script");
  }

  get region(): string | null {
    return this.#subtag("region");
  }

  get variant(): string | null {
    return this.#subtag("variant");
  }

  get extension(): string | null {
    return this.#subtag("extension");
  }

  get privateuse(): string | null {
    return this.#subtag("privateuse");
  }

  get grandfathered(): string | null {
    return this.#subtag("grandfathered");
  }

  toSym(): Locale {
    return this.toString();
  }

  toString(): string {
    this.#tag ??= this.toA()
      .filter((subtag) => subtag != null)
      .join("-");
    return this.#tag;
  }

  toA(): string[] {
    return RFC4646_SUBTAGS.map((attr) => this[attr]) as string[];
  }
}

export const Parser = {
  /**
   * The gem writes PATTERN under `/x`, whose whitespace and `#` comments are
   * stripped here. The grandfathered line is `/* ... *\/` in the source, which
   * `/x` reads as a literal `/`, so that alternative demands a trailing slash
   * and no real tag reaches it — the gem's way of parking it.
   */
  PATTERN:
    /^(?:([a-z]{2,3}(?:(?:-[a-z]{3}){0,3})?|[a-z]{4}|[a-z]{5,8})(?:-([a-z]{4}))?(?:-([a-z]{2}|\d{3}))?(?:-([0-9a-z]{5,8}|\d[0-9a-z]{3}))*(?:-([0-9a-wyz](?:-[0-9a-z]{2,8})+))*(?:-(x(?:-[0-9a-z]{1,8})+))?|(x(?:-[0-9a-z]{1,8})+)|\/*([a-z]{1,3}(?:-[0-9a-z]{2,8}){1,2})*\/)$/i,

  match(tag: string): (string | null)[] | false {
    const matched = Parser.PATTERN.exec(String(tag));
    if (matched === null) return false;
    const c = Array.from(matched)
      .slice(1)
      .map((capture) => capture ?? null);
    // TODO c[7] is grandfathered, throw a NotImplemented exception here?
    return [...c.slice(0, 5), c[5] === null ? (c[6] ?? null) : c[5], c[7] ?? null];
  },
};

let parserStore: typeof Parser | undefined;
