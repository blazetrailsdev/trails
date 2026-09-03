import { isSymbol } from "@blazetrails/ruby-compat";

import { EMPTY_HASH, type Locale, type TranslationKey } from "../i18n.js";
import { deepMergeBang, deepSymbolizeKeys, type TranslationData } from "../utils.js";
import {
  escapeDefaultSeparator,
  findLink,
  flattenKeys,
  flattenTranslations,
  links,
  normalizeFlatKeys,
  resolveLink,
  storeLink,
} from "./flatten.js";
import { Base, type TranslateOptions } from "./base.js";

export interface Store {
  get(key: string): string | undefined;
  set(key: string, value: string): unknown;
  keys(): Iterable<string>;
}

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SUBTREE_PROXY_METHODS = new Set(["get", "hasKey", "nil"]);

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- the merge is the point: it is `include Base` on the type side.
export interface KeyValue extends Base {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class KeyValue {
  store: Store | null;
  private _subtrees: boolean;

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  linksCache?: Map<string, Map<string, string>>;

  normalizeFlatKeys = normalizeFlatKeys;
  links = links;
  flattenKeys = flattenKeys;
  flattenTranslations = flattenTranslations;
  /** @internal */
  storeLink = storeLink;
  /** @internal */
  resolveLink = resolveLink;
  /** @internal */
  findLink = findLink;
  /** @internal */
  escapeDefaultSeparator = escapeDefaultSeparator;

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  translationsStore?: TranslationData;

  constructor(store: Store | null, subtrees = true) {
    this.store = store;
    this._subtrees = subtrees;
  }

  initialized(): boolean {
    return this.store != null;
  }

  storeTranslations(
    locale: Locale,
    data: TranslationData,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    const escape = "escape" in options ? options.escape : true;
    const flattened = this.flattenTranslations(locale, data, escape as boolean, this._subtrees);
    for (let [key, value] of Object.entries(flattened)) {
      key = `${locale}.${key}`;

      if (isHash(value)) {
        let oldValue: unknown;
        if (this._subtrees && (oldValue = this.store!.get(key)) != null) {
          oldValue = JSON.parse(oldValue as string);
          if (isHash(oldValue)) {
            value = deepMergeBang(deepSymbolizeKeys(oldValue), value);
          }
        }
      } else if (typeof value === "function") {
        throw new Error("Key-value stores cannot handle procs");
      }

      if (!isSymbol(value)) this.store!.set(key, JSON.stringify(value));
    }
    return flattened;
  }

  availableLocales(): Locale[] {
    let locales: (Locale | null)[] = [...this.store!.keys()].map((k) => {
      const index = k.indexOf(".");
      return index === -1 ? null : k.slice(0, index);
    });
    locales = [...new Set(locales)];
    locales = locales.filter((k) => k != null);
    return locales as Locale[];
  }

  protected translations(): TranslationData {
    const nested = [...this.store!.keys()].map((mainKey) => {
      const mainValue: unknown = JSON.parse(this.store!.get(mainKey)!);
      return String(mainKey)
        .split(".")
        .reverse()
        .reduce<unknown>((value, key) => ({ [key]: value }), mainValue) as TranslationData;
    });
    return (this.translationsStore = deepSymbolizeKeys(
      nested.reduce<TranslationData | undefined>(
        (hash, elem) => (hash === undefined ? elem : deepMergeBang(hash, elem)),
        undefined,
      )!,
    ));
  }

  protected initTranslations(): void {}

  protected subtrees(): boolean {
    return this._subtrees;
  }

  protected lookup(
    locale: Locale,
    key: TranslationKey,
    scope: unknown = [],
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    key = this.normalizeFlatKeys(
      locale,
      key,
      scope,
      options.separator as string | false | undefined,
    );
    const stored = this.store!.get(`${locale}.${key}`);
    const value: unknown = stored != null ? JSON.parse(stored) : stored;

    if (isHash(value)) {
      return deepSymbolizeKeys(value);
    } else if (value != null) {
      return value;
    } else if (!this._subtrees) {
      return new SubtreeProxy(`${locale}.${key}`, this.store!);
    }
    return undefined;
  }

  protected pluralize(locale: Locale, entry: unknown, count: unknown): unknown {
    if (this.subtrees()) {
      return (Base.prototype as KeyValue).pluralize.call(this, locale, entry, count);
    } else {
      if (!isHash(entry)) return entry;
      const key = this.pluralizationKey(entry, count);
      return entry[key];
    }
  }
}

for (const source of [Base.prototype, new (Base as unknown as new () => Base)()]) {
  for (const key of Object.getOwnPropertyNames(source)) {
    if (key === "constructor") continue;
    if (Object.prototype.hasOwnProperty.call(KeyValue.prototype, key)) continue;
    Object.defineProperty(
      KeyValue.prototype,
      key,
      Object.getOwnPropertyDescriptor(source, key) as PropertyDescriptor,
    );
  }
}

export class SubtreeProxy {
  #masterKey: string;
  #store: Store;
  #subtree: TranslationData | null;

  constructor(masterKey: string, store: Store) {
    this.#masterKey = masterKey;
    this.#store = store;
    this.#subtree = null;
    return new Proxy(this, {
      get: (target, prop) => {
        if (typeof prop === "string" && !SUBTREE_PROXY_METHODS.has(prop)) return target.get(prop);
        const value: unknown = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
      has: (target, prop) =>
        typeof prop === "string" && !SUBTREE_PROXY_METHODS.has(prop)
          ? target.hasKey(prop)
          : Reflect.has(target, prop),
    });
  }

  hasKey(key: string): boolean {
    return (this.#subtree != null && key in this.#subtree) || this.get(key) != null;
  }

  get(key: string): unknown {
    let value: unknown;
    if (this.#subtree == null || (value = this.#subtree[key]) == null) {
      value = this.#store.get(`${this.#masterKey}.${key}`);
      if (value != null) {
        value = JSON.parse(value as string);
        (this.#subtree ??= {})[key] = value;
      }
    }
    return value;
  }

  nil(): boolean {
    return this.#subtree == null;
  }
}
