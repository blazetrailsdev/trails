import { constSet, rbObjInspect } from "@blazetrails/ruby-compat";

import { XML } from "../namespaces.js";

type ParseOptionsFlag =
  | "recover"
  | "noent"
  | "dtdload"
  | "dtdattr"
  | "dtdvalid"
  | "noerror"
  | "nowarning"
  | "pedantic"
  | "noblanks"
  | "sax1"
  | "xinclude"
  | "nonet"
  | "nodict"
  | "nsclean"
  | "nocdata"
  | "noxincnode"
  | "compact"
  | "old10"
  | "nobasefix"
  | "huge"
  | "bigLines"
  | "defaultXml"
  | "defaultXslt"
  | "defaultHtml"
  | "defaultSchema";

type ParseOptionsGenerated = {
  [K in ParseOptionsFlag]: () => ParseOptions;
} & {
  [K in ParseOptionsFlag as `no${K}`]: () => ParseOptions;
} & {
  [K in ParseOptionsFlag as `is${Capitalize<K>}`]: () => boolean;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- types the methods the class_eval loop below defines
export interface ParseOptions extends ParseOptionsGenerated {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- merges with the generated-method interface above
export class ParseOptions {
  static readonly STRICT = 0;
  static readonly RECOVER = 1 << 0;
  static readonly NOENT = 1 << 1;
  static readonly DTDLOAD = 1 << 2;
  static readonly DTDATTR = 1 << 3;
  static readonly DTDVALID = 1 << 4;
  static readonly NOERROR = 1 << 5;
  static readonly NOWARNING = 1 << 6;
  static readonly PEDANTIC = 1 << 7;
  static readonly NOBLANKS = 1 << 8;
  static readonly SAX1 = 1 << 9;
  static readonly XINCLUDE = 1 << 10;
  static readonly NONET = 1 << 11;
  static readonly NODICT = 1 << 12;
  static readonly NSCLEAN = 1 << 13;
  static readonly NOCDATA = 1 << 14;
  static readonly NOXINCNODE = 1 << 15;
  static readonly COMPACT = 1 << 16;
  static readonly OLD10 = 1 << 17;
  static readonly NOBASEFIX = 1 << 18;
  static readonly HUGE = 1 << 19;
  static readonly BIG_LINES = 1 << 22;
  static readonly DEFAULT_XML = ParseOptions.RECOVER | ParseOptions.NONET | ParseOptions.BIG_LINES;
  static readonly DEFAULT_XSLT =
    ParseOptions.RECOVER |
    ParseOptions.NONET |
    ParseOptions.NOENT |
    ParseOptions.DTDLOAD |
    ParseOptions.DTDATTR |
    ParseOptions.NOCDATA |
    ParseOptions.BIG_LINES;
  static readonly DEFAULT_HTML =
    ParseOptions.RECOVER |
    ParseOptions.NOERROR |
    ParseOptions.NOWARNING |
    ParseOptions.NONET |
    ParseOptions.BIG_LINES;
  static readonly DEFAULT_SCHEMA = ParseOptions.NONET | ParseOptions.BIG_LINES;

  options: number;

  constructor(options = ParseOptions.STRICT) {
    this.options = options;
  }

  strict(): this {
    this.options &= ~ParseOptions.RECOVER;
    return this;
  }

  isStrict(): boolean {
    return (this.options & ParseOptions.RECOVER) === ParseOptions.STRICT;
  }

  equals(other: { toI(): number }): boolean {
    return other.toI() === this.toI();
  }

  toI(): number {
    return this.options;
  }

  inspect(): string {
    const options: string[] = [];
    for (const k of Object.keys(ParseOptions).filter((k) => /^[A-Z]/.test(k))) {
      const name = k.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
      if (
        (this as unknown as Record<string, () => boolean>)[
          `is${name[0].toUpperCase()}${name.slice(1)}`
        ]()
      ) {
        options.push(k.toLowerCase());
      }
    }
    return rbObjInspect(this).replace(/>$/, " " + options.join(", ") + ">");
  }
}

for (const constant of Object.keys(ParseOptions).filter((k) => /^[A-Z]/.test(k))) {
  if (constant === "STRICT") continue;
  const value = (ParseOptions as unknown as Record<string, number>)[constant];
  const name = constant.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  Object.defineProperties(ParseOptions.prototype, {
    [name]: {
      value: function (this: ParseOptions) {
        this.options |= value;
        return this;
      },
      writable: true,
      configurable: true,
    },
    [`no${name}`]: {
      value: function (this: ParseOptions) {
        this.options &= ~value;
        return this;
      },
      writable: true,
      configurable: true,
    },
    [`is${name[0].toUpperCase()}${name.slice(1)}`]: {
      value: function (this: ParseOptions) {
        return (this.options & value) === value;
      },
      writable: true,
      configurable: true,
    },
  });
}

constSet(XML, "ParseOptions", ParseOptions);
