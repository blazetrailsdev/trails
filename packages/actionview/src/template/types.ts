const SYMBOLS: readonly string[] = [
  "html",
  "text",
  "js",
  "css",
  "ics",
  "csv",
  "vcf",
  "vtt",
  "png",
  "jpeg",
  "gif",
  "bmp",
  "tiff",
  "svg",
  "webp",
  "mpeg",
  "mp3",
  "ogg",
  "m4a",
  "webm",
  "mp4",
  "otf",
  "ttf",
  "woff",
  "woff2",
  "xml",
  "rss",
  "atom",
  "yaml",
  "multipart_form",
  "url_encoded_form",
  "json",
  "pdf",
  "zip",
  "gzip",
];

export class Types {
  static symbols(): readonly string[] {
    return SYMBOLS;
  }

  static get(type: string | Types): Types {
    if (type instanceof Types) {
      return type;
    } else {
      return new Types(type);
    }
  }

  readonly symbol: string;

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  toString(): string {
    return this.symbol;
  }

  ref(): string {
    return this.symbol;
  }

  toSym(): string {
    return this.ref();
  }

  /** @internal */
  static isValidSymbols(symbols: ReadonlyArray<string | symbol>): boolean {
    return symbols.every((s) => typeof s === "string" && SYMBOLS.includes(s));
  }
}
