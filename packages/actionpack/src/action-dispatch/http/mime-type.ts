import { registerDefaultMimeTypes } from "./mime-types.js";
import {
  aryDelete,
  isSymbol,
  KeyError,
  rbEqual,
  stringToSym,
  symbolToS,
} from "@blazetrails/ruby-compat";

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

  /** @internal */
  push(type: MimeType): void {
    this._mimes.push(type);
    const sym = type.toSym()!;
    this._symbols.push(sym);
    this._symbolsSet.add(sym);
  }

  deleteIf(block: (type: MimeType) => boolean): void {
    let i = 0;
    while (i < this._mimes.length) {
      const x = this._mimes[i];
      if (block(x)) {
        const symType = x.toSym()!;
        aryDelete(this._symbols, symType);
        this._symbolsSet.delete(symType);
        this._mimes.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  /** @internal */
  isValidSymbols(symbols: readonly unknown[]): boolean {
    return symbols.every((s) => this._symbolsSet.has(s as string));
  }

  /** @internal */
  select(predicate: (type: MimeType) => boolean): MimeType[] {
    return this._mimes.filter(predicate);
  }
}

/** @internal */
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

  /** @internal */
  compare(other: AcceptItem): number {
    const result = other.q - this.q;
    if (result !== 0) return result;
    return this.index - other.index;
  }
}

/** @internal */
export class AcceptList {
  static sortBang(list: AcceptItem[]): MimeType[] {
    list.sort((a, b) => a.compare(b));

    let textXmlIdx = AcceptList.findItemByName(list, "text/xml");
    const xml = MimeType.lookupByExtension("xml");
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
      const looked = MimeType.lookup(item.name);
      if (!seen.has(looked.toString())) {
        seen.add(looked.toString());
        out.push(looked);
      }
    }
    return out;
  }

  static findItemByName(array: AcceptItem[], name: string): number | null {
    const idx = array.findIndex((item) => item.name === name);
    return idx === -1 ? null : idx;
  }
}

export const EXTENSION_LOOKUP: Map<string, MimeType> = new Map();
export const LOOKUP: Map<string, MimeType> = new Map();

const TRAILING_STAR_REGEXP = /^(text|application)\/\*/;
const PARAMETER_SEPARATOR_REGEXP = /;\s*q="?/;
const ACCEPT_HEADER_REGEXP = /[^,\s"](?:[^,"]|"[^"]*")*/g;

export class MimeType {
  /** @internal */
  readonly string: string;
  readonly symbol: string | null;
  /** @internal */
  readonly synonyms: string[];

  private static callbacks: Array<(type: MimeType) => void> = [];

  static readonly SET: Mimes = new Mimes();

  constructor(string: string, symbol: string | null = null, synonyms: string[] = []) {
    this.string = string;
    this.symbol = symbol;
    this.synonyms = synonyms;
  }

  toString(): string {
    return this.string;
  }

  toStr(): string {
    return this.toString();
  }

  match(mimeType: string | RegExp): boolean {
    if (mimeType instanceof RegExp) return mimeType.test(this.string);
    if (mimeType === "*/*") return true;
    if (mimeType.endsWith("/*")) {
      const type = mimeType.slice(0, -2);
      return this.string.startsWith(type + "/");
    }
    return this.string === mimeType || this.synonyms.includes(mimeType);
  }

  ref(): string {
    return this.symbol ?? this.toString();
  }

  toSym(): string | null {
    return this.symbol;
  }

  isHtml(): boolean {
    return this.symbol === ":html" || this.string.includes("html");
  }

  equals(mimeType: MimeType | string | null | undefined): boolean {
    if (mimeType == null) return false;
    const mimeTypeToS =
      mimeType instanceof MimeType
        ? mimeType.toString()
        : isSymbol(mimeType)
          ? symbolToS(mimeType)
          : mimeType;
    const mimeTypeToSym = mimeType instanceof MimeType ? mimeType.toSym() : stringToSym(mimeType);
    return [...this.synonyms, this].some((synonym) =>
      synonym instanceof MimeType
        ? synonym.toString() === mimeTypeToS || synonym.toSym() === mimeTypeToSym
        : synonym === mimeTypeToS || stringToSym(synonym) === mimeTypeToSym,
    );
  }

  eql(other: unknown): boolean {
    return (
      this === other ||
      (other instanceof MimeType &&
        this.constructor === other.constructor &&
        this.string === other.string &&
        rbEqual(this.synonyms, other.synonyms) &&
        this.symbol === other.symbol)
    );
  }

  static register(
    string: string,
    symbol: string,
    mimeTypeSynonyms: string[] = [],
    extensionSynonyms: string[] = [],
    skipLookup: boolean = false,
  ): MimeType {
    const newMime = new MimeType(string, symbol, mimeTypeSynonyms);

    MimeType.SET.push(newMime);

    if (!skipLookup) for (const str of [string, ...mimeTypeSynonyms]) LOOKUP.set(str, newMime);
    for (const ext of [symbolToS(symbol), ...extensionSynonyms]) EXTENSION_LOOKUP.set(ext, newMime);

    for (const callback of MimeType.callbacks) {
      callback(newMime);
    }
    return newMime;
  }

  static registerAlias(string: string, symbol: string, extensionSynonyms: string[] = []): MimeType {
    return MimeType.register(string, symbol, [], extensionSynonyms, true);
  }

  static unregister(symbol: string): void {
    symbol = symbol.toLowerCase();
    const mime = Mime.get(symbol);
    if (mime) {
      MimeType.SET.deleteIf((v) => v.eql(mime));
      for (const [k, v] of LOOKUP) if (v.eql(mime)) LOOKUP.delete(k);
      for (const [k, v] of EXTENSION_LOOKUP) if (v.eql(mime)) EXTENSION_LOOKUP.delete(k);
    }
  }

  static lookup(string: string): MimeType {
    if (LOOKUP.has(string)) return LOOKUP.get(string)!;

    string = string.split(";", 2)[0].trimEnd();
    return LOOKUP.get(string) ?? new MimeType(string);
  }

  static lookupByExtension(extension: string | null): MimeType | undefined {
    const ext = extension == null ? "" : isSymbol(extension) ? symbolToS(extension) : extension;
    return EXTENSION_LOOKUP.get(ext);
  }

  /** @noRailsEquivalent CONVERGEABLE delete-invented-mime-type-all */
  static all(): MimeType[] {
    return MimeType.SET.select(() => true);
  }

  static onRegister(callback: (type: MimeType) => void): void {
    MimeType.callbacks.push(callback);
  }

  static registerCallback(callback: (type: MimeType) => void): void {
    MimeType.onRegister(callback);
  }

  /** @internal */
  static parseTrailingStar(acceptHeader: string): MimeType[] | null {
    const m = acceptHeader.match(TRAILING_STAR_REGEXP);
    if (!m) return null;
    return MimeType.parseDataWithTrailingStar(m[1]);
  }

  /** @internal */
  static parseDataWithTrailingStar(type: string): MimeType[] {
    return MimeType.SET.select(
      (m) => m.string.includes(type) || m.synonyms.some((s) => s.includes(type)),
    );
  }

  static parse(acceptHeader: string): MimeType[] {
    if (!acceptHeader) return [];

    if (!acceptHeader.includes(",")) {
      const sepMatch = acceptHeader.match(PARAMETER_SEPARATOR_REGEXP);
      const header = sepMatch ? acceptHeader.slice(0, sepMatch.index).trim() : acceptHeader.trim();
      if (header === "") return [];
      const trailing = MimeType.parseTrailingStar(header);
      if (trailing) return trailing;
      return [MimeType.lookup(header)];
    }

    const list: AcceptItem[] = [];
    let index = 0;
    const headers = acceptHeader.match(ACCEPT_HEADER_REGEXP) ?? [];
    for (const raw of headers) {
      const sep = raw.match(PARAMETER_SEPARATOR_REGEXP);
      let params: string;
      let q: string | null = null;
      if (sep) {
        params = raw.slice(0, sep.index);
        q = raw.slice(sep.index! + sep[0].length).replace(/"$/, "");
      } else {
        params = raw;
      }
      params = params.trim();
      if (params === "") continue;
      const expanded = MimeType.parseTrailingStar(params);
      const items: string[] = expanded ? expanded.map((m) => m.toString()) : [params];
      for (const name of items) {
        list.push(new AcceptItem(index, name, q));
        index += 1;
      }
    }
    return AcceptList.sortBang(list);
  }

  static get HTML(): MimeType {
    return MimeType.lookupByExtension("html")!;
  }
  static get TEXT(): MimeType {
    return MimeType.lookupByExtension("text")!;
  }
  static get JS(): MimeType {
    return MimeType.lookupByExtension("js")!;
  }
  static get CSS(): MimeType {
    return MimeType.lookupByExtension("css")!;
  }
  static get ICS(): MimeType {
    return MimeType.lookupByExtension("ics")!;
  }
  static get CSV(): MimeType {
    return MimeType.lookupByExtension("csv")!;
  }
  static get VCF(): MimeType {
    return MimeType.lookupByExtension("vcf")!;
  }
  static get PNG(): MimeType {
    return MimeType.lookupByExtension("png")!;
  }
  static get JPEG(): MimeType {
    return MimeType.lookupByExtension("jpeg")!;
  }
  static get GIF(): MimeType {
    return MimeType.lookupByExtension("gif")!;
  }
  static get BMP(): MimeType {
    return MimeType.lookupByExtension("bmp")!;
  }
  static get TIFF(): MimeType {
    return MimeType.lookupByExtension("tiff")!;
  }
  static get SVG(): MimeType {
    return MimeType.lookupByExtension("svg")!;
  }
  static get WEBP(): MimeType {
    return MimeType.lookupByExtension("webp")!;
  }
  static get MPEG(): MimeType {
    return MimeType.lookupByExtension("mpeg")!;
  }
  static get XML(): MimeType {
    return MimeType.lookupByExtension("xml")!;
  }
  static get RSS(): MimeType {
    return MimeType.lookupByExtension("rss")!;
  }
  static get ATOM(): MimeType {
    return MimeType.lookupByExtension("atom")!;
  }
  static get YAML(): MimeType {
    return MimeType.lookupByExtension("yaml")!;
  }
  static get MULTIPART_FORM(): MimeType {
    return MimeType.lookupByExtension("multipart_form")!;
  }
  static get URL_ENCODED_FORM(): MimeType {
    return MimeType.lookupByExtension("url_encoded_form")!;
  }
  static get JSON(): MimeType {
    return MimeType.lookupByExtension("json")!;
  }
  static get PDF(): MimeType {
    return MimeType.lookupByExtension("pdf")!;
  }
  static get ZIP(): MimeType {
    return MimeType.lookupByExtension("zip")!;
  }
  static get GZIP(): MimeType {
    return MimeType.lookupByExtension("gzip")!;
  }

  static readonly ALL = new MimeType("*/*", null);
}

registerDefaultMimeTypes(MimeType);

export const Mime = {
  get(type: MimeType | string | null): MimeType | undefined {
    if (type instanceof MimeType) return type;
    return MimeType.lookupByExtension(type);
  },

  symbols(): string[] {
    return MimeType.SET.symbols;
  },

  /** @internal */
  isValidSymbols(symbols: readonly unknown[]): boolean {
    return MimeType.SET.isValidSymbols(symbols);
  },

  fetch(type: MimeType | string, fallback?: (key: string) => MimeType): MimeType {
    if (type instanceof MimeType) return type;
    const found = MimeType.lookupByExtension(type);
    if (found) return found;
    if (fallback) return fallback(type);
    throw new KeyError(`key not found: "${type}"`);
  },
};
