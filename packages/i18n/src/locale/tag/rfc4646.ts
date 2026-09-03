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

/** @internal */
const STRING_FORMATS: Record<string, (value: string) => string> = {
  downcase: (value) => value.toLowerCase(),
  capitalize: (value) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(),
  upcase: (value) => value.toUpperCase(),
};

export class Rfc4646 implements Parents {
  static tag(tag: string): Rfc4646 | null {
    const matches = Rfc4646.parser().match(tag);
    return matches ? new Rfc4646(...matches) : null;
  }

  static parser(): typeof Parser {
    parserStore ??= Parser;
    return parserStore;
  }

  static setParser(parser: typeof Parser): void {
    parserStore = parser;
  }

  /** @internal */
  readonly #slots: Record<string, string | null> = {};

  #tag?: string;

  constructor(...values: (string | null)[]) {
    RFC4646_SUBTAGS.forEach((name, i) => {
      this.#slots[name] = values[i] ?? null;
    });
  }

  parent = parent;
  parents = parents;
  selfAndParents = selfAndParents;

  /** @internal */
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
  PATTERN:
    /^(?:([a-z]{2,3}(?:(?:-[a-z]{3}){0,3})?|[a-z]{4}|[a-z]{5,8})(?:-([a-z]{4}))?(?:-([a-z]{2}|\d{3}))?(?:-([0-9a-z]{5,8}|\d[0-9a-z]{3}))*(?:-([0-9a-wyz](?:-[0-9a-z]{2,8})+))*(?:-(x(?:-[0-9a-z]{1,8})+))?|(x(?:-[0-9a-z]{1,8})+)|\/*([a-z]{1,3}(?:-[0-9a-z]{2,8}){1,2})*\/)$/i,

  match(tag: string): (string | null)[] | false {
    const matched = Parser.PATTERN.exec(String(tag));
    if (matched === null) return false;
    const c = Array.from(matched)
      .slice(1)
      .map((capture) => capture ?? null);
    return [...c.slice(0, 5), c[5] === null ? (c[6] ?? null) : c[5], c[7] ?? null];
  },
};

let parserStore: typeof Parser | undefined;
