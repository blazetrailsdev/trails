/**
 * Mime::Type — MIME type registry and parsing.
 */

export class MimeType {
  readonly string: string;
  readonly symbol: string;
  readonly synonyms: string[];

  private static registry: Map<string, MimeType> = new Map();
  private static extensionMap: Map<string, MimeType> = new Map();
  private static callbacks: Array<(type: MimeType) => void> = [];

  constructor(string: string, symbol: string, synonyms: string[] = []) {
    this.string = string;
    this.symbol = symbol;
    this.synonyms = synonyms;
  }

  toString(): string {
    return this.string;
  }

  match(pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) return pattern.test(this.string);
    if (pattern === "*/*") return true;
    if (pattern.endsWith("/*")) {
      const type = pattern.slice(0, -2);
      return this.string.startsWith(type + "/");
    }
    return this.string === pattern || this.synonyms.includes(pattern);
  }

  ref(): string {
    return this.symbol;
  }

  equals(other: MimeType | string | symbol): boolean {
    if (other instanceof MimeType) return this.string === other.string;
    if (typeof other === "symbol") return this.symbol === other.toString();
    return this.string === other || this.symbol === other;
  }

  // --- Registry ---

  static register(string: string, symbol: string, synonyms: string[] = [], extensions: string[] = []): MimeType {
    const type = new MimeType(string, symbol, synonyms);
    MimeType.registry.set(symbol, type);
    MimeType.registry.set(string, type);
    for (const syn of synonyms) {
      MimeType.registry.set(syn, type);
    }
    for (const ext of extensions) {
      MimeType.extensionMap.set(ext, type);
    }
    for (const cb of MimeType.callbacks) {
      cb(type);
    }
    return type;
  }

  static registerAlias(symbol: string, aliasSymbol: string): void {
    const type = MimeType.registry.get(symbol);
    if (type) {
      MimeType.registry.set(aliasSymbol, type);
    }
  }

  static unregister(symbol: string): void {
    const type = MimeType.registry.get(symbol);
    if (type) {
      MimeType.registry.delete(symbol);
      MimeType.registry.delete(type.string);
      for (const syn of type.synonyms) {
        MimeType.registry.delete(syn);
      }
    }
  }

  static lookup(symbolOrString: string): MimeType | undefined {
    return MimeType.registry.get(symbolOrString);
  }

  static lookupByExtension(ext: string): MimeType | undefined {
    return MimeType.extensionMap.get(ext.replace(/^\./, ""));
  }

  static onRegister(callback: (type: MimeType) => void): void {
    MimeType.callbacks.push(callback);
  }

  // --- Parsing ---

  static parse(acceptHeader: string): MimeType[] {
    if (!acceptHeader || acceptHeader.trim() === "") return [];

    const entries = acceptHeader.split(",").map((part) => {
      const trimmed = part.trim();
      const [mediaRange, ...params] = trimmed.split(";").map((s) => s.trim());
      let q = 1.0;
      for (const p of params) {
        const match = p.match(/^q=([\d.]+)/);
        if (match) q = parseFloat(match[1]);
      }
      return { mediaRange: mediaRange || "*/*", q, params: params.filter((p) => !p.startsWith("q=")) };
    });

    entries.sort((a, b) => b.q - a.q);

    const results: MimeType[] = [];
    for (const entry of entries) {
      const found = MimeType.registry.get(entry.mediaRange);
      if (found) {
        results.push(found);
      } else {
        // Create an ad-hoc type
        results.push(new MimeType(entry.mediaRange, entry.mediaRange));
      }
    }
    return results;
  }

  // --- Built-in types ---

  static readonly HTML = MimeType.register("text/html", "html", ["application/xhtml+xml"], ["html", "htm"]);
  static readonly TEXT = MimeType.register("text/plain", "text", [], ["txt"]);
  static readonly JS = MimeType.register("text/javascript", "js", ["application/javascript"], ["js"]);
  static readonly CSS = MimeType.register("text/css", "css", [], ["css"]);
  static readonly ICS = MimeType.register("text/calendar", "ics", [], ["ics"]);
  static readonly CSV = MimeType.register("text/csv", "csv", [], ["csv"]);
  static readonly VCF = MimeType.register("text/vcard", "vcf", [], ["vcf"]);

  static readonly PNG = MimeType.register("image/png", "png", [], ["png"]);
  static readonly GIF = MimeType.register("image/gif", "gif", [], ["gif"]);
  static readonly BMP = MimeType.register("image/bmp", "bmp", [], ["bmp"]);
  static readonly TIFF = MimeType.register("image/tiff", "tiff", [], ["tif", "tiff"]);
  static readonly SVG = MimeType.register("image/svg+xml", "svg", [], ["svg"]);
  static readonly WEBP = MimeType.register("image/webp", "webp", [], ["webp"]);

  static readonly MPEG = MimeType.register("video/mpeg", "mpeg", [], ["mpeg", "mpg"]);

  static readonly XML = MimeType.register("application/xml", "xml", ["text/xml"], ["xml"]);
  static readonly RSS = MimeType.register("application/rss+xml", "rss", [], ["rss"]);
  static readonly ATOM = MimeType.register("application/atom+xml", "atom", [], ["atom"]);
  static readonly YAML = MimeType.register("application/x-yaml", "yaml", ["text/yaml"], ["yml", "yaml"]);

  static readonly MULTIPART_FORM = MimeType.register("multipart/form-data", "multipart_form", [], []);
  static readonly URL_ENCODED_FORM = MimeType.register("application/x-www-form-urlencoded", "url_encoded_form", [], []);

  static readonly JSON = MimeType.register("application/json", "json", ["text/x-json"], ["json"]);
  static readonly PDF = MimeType.register("application/pdf", "pdf", [], ["pdf"]);
  static readonly ZIP = MimeType.register("application/zip", "zip", [], ["zip"]);
  static readonly GZIP = MimeType.register("application/gzip", "gzip", [], ["gz"]);

  static readonly ALL = new MimeType("*/*", "all");
}
