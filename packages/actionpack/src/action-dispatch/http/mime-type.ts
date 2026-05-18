/**
 * Mime::Type — MIME type registry and parsing.
 */

import { registerDefaultMimeTypes } from "./mime-types.js";

export class MimeType {
  /** @internal */
  readonly string: string;
  readonly symbol: string;
  /** @internal */
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

  static register(
    string: string,
    symbol: string,
    synonyms: string[] = [],
    extensions: string[] = [],
  ): MimeType {
    const type = new MimeType(string, symbol, synonyms);
    MimeType.registry.set(symbol, type);
    MimeType.registry.set(string, type);
    for (const syn of synonyms) {
      MimeType.registry.set(syn, type);
    }
    // Rails registers `[symbol.to_s] + extension_synonyms` into
    // EXTENSION_LOOKUP, so the symbol itself is always a valid extension key.
    for (const ext of [symbol, ...extensions]) {
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
    if (!type) return;
    // Sweep every registry entry whose value is this type — captures
    // the symbol, string, synonyms, AND any aliases added later via
    // registerAlias(). Avoids partial removals where lookup() still
    // resolves the type through a stale alias key.
    for (const [key, value] of MimeType.registry) {
      if (value === type) MimeType.registry.delete(key);
    }
    // Same sweep for extensionMap — register() can install extension
    // mappings, and leaving them behind would let lookupByExtension()
    // resolve an unregistered type.
    for (const [ext, value] of MimeType.extensionMap) {
      if (value === type) MimeType.extensionMap.delete(ext);
    }
  }

  static lookup(symbolOrString: string): MimeType | undefined {
    return MimeType.registry.get(symbolOrString);
  }

  static lookupByExtension(ext: string): MimeType | undefined {
    return MimeType.extensionMap.get(ext.replace(/^\./, ""));
  }

  /**
   * All registered MIME types, deduplicated. Mirrors Rails `Mime::SET`.
   * Iteration order follows registration order (Map preserves it).
   */
  static all(): MimeType[] {
    const seen = new Set<MimeType>();
    const out: MimeType[] = [];
    for (const type of MimeType.registry.values()) {
      if (!seen.has(type)) {
        seen.add(type);
        out.push(type);
      }
    }
    return out;
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
      return {
        mediaRange: mediaRange || "*/*",
        q,
        params: params.filter((p) => !p.startsWith("q=")),
      };
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
  //
  // Default registrations live in `./mime-types.ts` (Rails: `mime_types.rb`).
  // The constants below resolve through the registry, so each access returns
  // the singleton registered by that file.

  static get HTML(): MimeType {
    return MimeType.lookup("html")!;
  }
  static get TEXT(): MimeType {
    return MimeType.lookup("text")!;
  }
  static get JS(): MimeType {
    return MimeType.lookup("js")!;
  }
  static get CSS(): MimeType {
    return MimeType.lookup("css")!;
  }
  static get ICS(): MimeType {
    return MimeType.lookup("ics")!;
  }
  static get CSV(): MimeType {
    return MimeType.lookup("csv")!;
  }
  static get VCF(): MimeType {
    return MimeType.lookup("vcf")!;
  }
  static get PNG(): MimeType {
    return MimeType.lookup("png")!;
  }
  static get JPEG(): MimeType {
    return MimeType.lookup("jpeg")!;
  }
  static get GIF(): MimeType {
    return MimeType.lookup("gif")!;
  }
  static get BMP(): MimeType {
    return MimeType.lookup("bmp")!;
  }
  static get TIFF(): MimeType {
    return MimeType.lookup("tiff")!;
  }
  static get SVG(): MimeType {
    return MimeType.lookup("svg")!;
  }
  static get WEBP(): MimeType {
    return MimeType.lookup("webp")!;
  }
  static get MPEG(): MimeType {
    return MimeType.lookup("mpeg")!;
  }
  static get XML(): MimeType {
    return MimeType.lookup("xml")!;
  }
  static get RSS(): MimeType {
    return MimeType.lookup("rss")!;
  }
  static get ATOM(): MimeType {
    return MimeType.lookup("atom")!;
  }
  static get YAML(): MimeType {
    return MimeType.lookup("yaml")!;
  }
  static get MULTIPART_FORM(): MimeType {
    return MimeType.lookup("multipart_form")!;
  }
  static get URL_ENCODED_FORM(): MimeType {
    return MimeType.lookup("url_encoded_form")!;
  }
  static get JSON(): MimeType {
    return MimeType.lookup("json")!;
  }
  static get PDF(): MimeType {
    return MimeType.lookup("pdf")!;
  }
  static get ZIP(): MimeType {
    return MimeType.lookup("zip")!;
  }
  static get GZIP(): MimeType {
    return MimeType.lookup("gzip")!;
  }

  static readonly ALL = new MimeType("*/*", "all");
}

registerDefaultMimeTypes(MimeType);
