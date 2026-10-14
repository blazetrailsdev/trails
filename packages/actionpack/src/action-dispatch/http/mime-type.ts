import { registerDefaultMimeTypes } from "./mime-types.js";
import {
  aryDelete,
  Enumerable,
  include,
  isSymbol,
  KERNEL_METHODS,
  KeyError,
  NoMethodError,
  PROTOCOL_PROBES,
  rbInspect,
  regexpEscape,
  rbEqual,
  rbHash,
  StandardError,
  stringToSym,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { underscore } from "@blazetrails/activesupport";

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Enumerable` (`actionpack/lib/action_dispatch/http/mime_type.rb:11`); the class/interface merge is how a mixin surfaces on the type side. */
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
}

export interface Mimes {
  select(block: (i: MimeType) => unknown): MimeType[];
  isInclude(val: unknown): boolean;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

include(Mimes, Enumerable);

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

function rubyPredicateName(prop: string | symbol): string | null {
  if (typeof prop === "symbol" || KERNEL_METHODS.has(prop) || PROTOCOL_PROBES.has(prop)) {
    return null;
  }
  return /^is[A-Z]/.test(prop) ? `${underscore(prop.slice(2))}?` : null;
}

const METHOD_MISSING_HANDLER: ProxyHandler<MimeType | NullType> = {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
    const method = rubyPredicateName(prop);
    if (method === null || !target.respondToMissing(method, false)) return undefined;
    return (...args: unknown[]) => target.methodMissing(method, ...args);
  },
  has(target, prop) {
    if (Reflect.has(target, prop)) return true;
    const method = rubyPredicateName(prop);
    return method !== null && target.respondToMissing(method, false);
  },
};

export class MimeType {
  [predicate: `is${string}`]: (() => boolean) | undefined;
  /** @internal */
  readonly string: string;
  readonly symbol: string | null;
  /** @internal */
  readonly synonyms: string[];
  private readonly _hash: number;

  /** @internal */
  private static registerCallbacks: Array<(type: MimeType) => void> = [];

  static readonly SET: Mimes = new Mimes();

  hash(): number {
    return this._hash;
  }

  static readonly MIME_NAME = "[a-zA-Z0-9][a-zA-Z0-9!#\\$&\\-\\^_\\.\\+]{0,126}";
  static readonly MIME_PARAMETER_VALUE = `(?:${MimeType.MIME_NAME}|"[^"\\r\\\\]*")`;
  static readonly MIME_PARAMETER = ` *; *${MimeType.MIME_NAME}(?:=${MimeType.MIME_PARAMETER_VALUE})?`;
  static readonly MIME_REGEXP = new RegExp(
    `^(?:\\*\\/\\*|${MimeType.MIME_NAME}\\/(?:\\*|${MimeType.MIME_NAME})(?:(?=(${MimeType.MIME_PARAMETER}))\\1)*\\s*)$`,
  );

  static InvalidMimeType = class InvalidMimeType extends StandardError {};

  constructor(string: string | null, symbol: string | null = null, synonyms: string[] = []) {
    if (!(string != null && MimeType.MIME_REGEXP.test(string))) {
      throw new MimeType.InvalidMimeType(`${rbInspect(string)} is not a valid MIME type`);
    }
    this.string = string;
    this.symbol = symbol;
    this.synonyms = synonyms;
    this._hash = rbHash([this.string, this.synonyms, this.symbol]);
    return new Proxy<MimeType>(this, METHOD_MISSING_HANDLER);
  }

  toString(): string {
    return this.string;
  }

  /** @noRailsEquivalent PERMANENT */
  toStr(): string {
    return this.toString();
  }

  match(mimeType: MimeType | string | null | undefined): boolean {
    if (mimeType == null) return false;
    const regexp = new RegExp(regexpEscape(mimeType.toString()));
    return (
      this.synonyms.some((synonym) => regexp.test(synonym.toString())) || regexp.test(this.string)
    );
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

  isAll(): boolean {
    return false;
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

  /** @internal */
  methodMissing(method: string, ..._args: unknown[]): unknown {
    if (method.endsWith("?")) {
      return stringToSym(method.slice(0, -1).toLowerCase()) === this.toSym();
    } else {
      throw new NoMethodError(`undefined method '${method}' for an instance of Mime::Type`);
    }
  }

  /** @internal */
  respondToMissing(method: string, _includePrivate = false): boolean {
    return method.endsWith("?");
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

    for (const callback of MimeType.registerCallbacks) {
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

    const str = string === "" ? null : string.split(";", 2)[0].trimEnd();
    return LOOKUP.get(str as string) ?? new MimeType(str);
  }

  static lookupByExtension(extension: string | null): MimeType | undefined {
    const ext = extension == null ? "" : isSymbol(extension) ? symbolToS(extension) : extension;
    return EXTENSION_LOOKUP.get(ext);
  }

  static all(): MimeType[] {
    return MimeType.SET.select(() => true);
  }

  static registerCallback(callback: (type: MimeType) => void): void {
    MimeType.registerCallbacks.push(callback);
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

  declare static readonly ALL: AllType;
}

export class AllType extends MimeType {
  static readonly instance = new AllType();

  private constructor() {
    super("*/*", null);
  }

  override isAll(): boolean {
    return true;
  }

  override isHtml(): boolean {
    return true;
  }
}

Object.defineProperty(MimeType, "ALL", { value: AllType.instance });

export class NullType {
  [predicate: `is${string}`]: (() => boolean) | undefined;
  static readonly instance = new NullType();
  readonly symbol: string | null = null;
  /** @internal */
  readonly string = "";

  private constructor() {
    return new Proxy<NullType>(this, METHOD_MISSING_HANDLER);
  }

  isNil(): boolean {
    return true;
  }

  toString(): string {
    return "";
  }

  ref(): string | null {
    return null;
  }

  /** @internal */
  respondToMissing(method: string, _includePrivate?: boolean): boolean {
    return method.endsWith("?");
  }

  /** @internal */
  methodMissing(method: string, ..._args: unknown[]): unknown {
    if (method.endsWith("?")) return false;
    return null;
  }
}

MimeType.InvalidMimeType.prototype.name = "Mime::Type::InvalidMimeType";

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
