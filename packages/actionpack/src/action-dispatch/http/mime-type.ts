/**
 * Mime::Type — MIME type registry and parsing.
 */

import { registerDefaultMimeTypes } from "./mime-types.js";

/**
 * Ordered set of registered MIME types. Mirrors `Mime::Mimes` — Rails uses
 * this as `Mime::SET`. Iteration order follows registration order; symbol
 * membership is tracked separately for `validSymbols` checks.
 */
export class Mimes {
  /** @internal */
  private _mimes: MimeType[] = [];
  /** @internal */
  private _symbols: string[] = [];
  /** @internal */
  private _symbolsSet: Set<string> = new Set();

  get symbols(): string[] {
    return this._symbols;
  }

  each(callback: (type: MimeType) => void): void {
    for (const m of this._mimes) callback(m);
  }

  /** @internal Mirrors Ruby `<<`. */
  push(type: MimeType): void {
    this._mimes.push(type);
    const sym = type.toSym();
    this._symbols.push(sym);
    this._symbolsSet.add(sym);
  }

  deleteIf(predicate: (type: MimeType) => boolean): void {
    const kept: MimeType[] = [];
    const removed = new Set<string>();
    for (const m of this._mimes) {
      if (predicate(m)) {
        removed.add(m.toSym());
      } else {
        kept.push(m);
      }
    }
    this._mimes = kept;
    this._symbols = this._symbols.filter((s) => !removed.has(s));
    for (const sym of removed) this._symbolsSet.delete(sym);
  }

  /** @internal */
  validSymbols(symbols: string[]): boolean {
    return symbols.every((s) => this._symbolsSet.has(s));
  }

  /** @internal */
  select(predicate: (type: MimeType) => boolean): MimeType[] {
    return this._mimes.filter(predicate);
  }
}

/**
 * A simple helper used in parsing the Accept header. Mirrors
 * `Mime::Type::AcceptItem`.
 *
 * @internal
 */
export class AcceptItem {
  index: number;
  name: string;
  q: number;

  constructor(index: number, name: string, q?: number | string | null) {
    this.index = index;
    this.name = name;
    let qNum: number;
    if (q === null || q === undefined) {
      qNum = name === "*/*" ? 0.0 : 1.0;
    } else {
      qNum = typeof q === "string" ? parseFloat(q) : q;
      if (Number.isNaN(qNum)) qNum = 1.0;
    }
    this.q = Math.trunc(qNum * 100);
  }

  /** @internal Three-way comparator used by `AcceptList.sortBang`. */
  compare(other: AcceptItem): number {
    const result = other.q - this.q;
    if (result !== 0) return result;
    return this.index - other.index;
  }
}

/**
 * Sort helpers for the parsed Accept-header list. Mirrors
 * `Mime::Type::AcceptList`.
 *
 * @internal
 */
export class AcceptList {
  static sortBang(list: AcceptItem[]): MimeType[] {
    list.sort((a, b) => a.compare(b));

    let textXmlIdx = AcceptList.findItemByName(list, "text/xml");
    const xml = MimeType.lookup("xml");
    let appXmlIdx = xml ? AcceptList.findItemByName(list, xml.toString()) : null;

    if (textXmlIdx !== null && appXmlIdx !== null) {
      const appXml = list[appXmlIdx];
      const textXml = list[textXmlIdx];
      appXml.q = Math.max(textXml.q, appXml.q);
      if (appXmlIdx > textXmlIdx) {
        list[appXmlIdx] = textXml;
        list[textXmlIdx] = appXml;
        [appXmlIdx, textXmlIdx] = [textXmlIdx, appXmlIdx];
      }
      list.splice(textXmlIdx, 1);
      if (appXmlIdx > textXmlIdx) appXmlIdx--;
    } else if (textXmlIdx !== null && xml) {
      list[textXmlIdx].name = xml.toString();
    }

    if (appXmlIdx !== null) {
      const appXml = list[appXmlIdx];
      let idx = appXmlIdx;
      while (idx < list.length) {
        const type = list[idx];
        if (type.q < appXml.q) break;
        if (type.name.endsWith("+xml")) {
          list[appXmlIdx] = list[idx];
          list[idx] = appXml;
          appXmlIdx = idx;
        }
        idx++;
      }
    }

    const seen = new Set<string>();
    const out: MimeType[] = [];
    for (const item of list) {
      const looked = MimeType.lookup(item.name) ?? new MimeType(item.name, item.name);
      if (!seen.has(looked.toString())) {
        seen.add(looked.toString());
        out.push(looked);
      }
    }
    return out;
  }

  static findItemByName(list: AcceptItem[], name: string): number | null {
    const idx = list.findIndex((item) => item.name === name);
    return idx === -1 ? null : idx;
  }
}

const TRAILING_STAR_REGEXP = /^(text|application)\/\*/;

export class MimeType {
  /** @internal */
  readonly string: string;
  readonly symbol: string;
  /** @internal */
  readonly synonyms: string[];

  private static registry: Map<string, MimeType> = new Map();
  private static extensionMap: Map<string, MimeType> = new Map();
  private static callbacks: Array<(type: MimeType) => void> = [];

  /** Ordered set of all registered MIME types. Mirrors `Mime::SET`. */
  static readonly SET: Mimes = new Mimes();

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

  toSym(): string {
    return this.symbol;
  }

  isHtml(): boolean {
    return this.symbol === "html" || this.string.includes("html");
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
    MimeType.SET.push(type);
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
    MimeType.SET.deleteIf((v) => v === type);
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

  /** Rails-named alias of {@link onRegister}. */
  static registerCallback(callback: (type: MimeType) => void): void {
    MimeType.onRegister(callback);
  }

  /** @internal */
  static parseTrailingStar(acceptHeader: string): MimeType[] | null {
    const m = acceptHeader.match(TRAILING_STAR_REGEXP);
    if (!m) return null;
    return MimeType.parseDataWithTrailingStar(m[1]);
  }

  /**
   * For an input of `'text'`, returns all registered MIME types whose
   * string or any synonym contains `'text'` as a substring (Rails uses
   * `Regexp.new(Regexp.quote(type))` against each, so the match is
   * substring, not prefix). Mirrors `Mime::Type.parse_data_with_trailing_star`.
   *
   * @internal
   */
  static parseDataWithTrailingStar(type: string): MimeType[] {
    return MimeType.SET.select(
      (m) => m.string.includes(type) || m.synonyms.some((s) => s.includes(type)),
    );
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

/**
 * Module-level helpers from Ruby's `Mime` module. Rails exposes these as
 * `Mime.fetch(:html)` etc.; in TS they hang off this object so callers can
 * write `Mime.fetch("html")`.
 */
export const Mime = {
  /**
   * Look up a MIME type by extension. Returns the result of `fallback` if
   * the extension is not registered (Rails raises `KeyError`; the callback
   * lets callers mirror that or supply a default).
   */
  fetch(type: MimeType | string, fallback?: (key: string) => MimeType): MimeType {
    if (type instanceof MimeType) return type;
    const found = MimeType.lookupByExtension(type);
    if (found) return found;
    if (fallback) return fallback(type);
    const err = new Error(`key not found: "${type}"`);
    err.name = "KeyError";
    throw err;
  },
};
