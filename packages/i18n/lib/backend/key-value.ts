import {
  Hash,
  TypeError,
  hashAref,
  include,
  isModuleObject,
  isSymbol,
  rbInspect,
  rbObjClass,
  rbObjIsKindOf,
  symbolToS,
} from "@blazetrails/ruby-compat";

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

export type Store = Pick<Map<string, string>, "get" | "set" | "keys">;

function isHash(value: unknown): value is TranslationData {
  return value instanceof Map || value instanceof SubtreeProxy;
}

const JSON = {
  encode(value: unknown): string {
    return globalThis.JSON.stringify(value);
  },
  decode(value: string): unknown {
    return globalThis.JSON.parse(value, (_key, decoded: unknown) => {
      if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return decoded;
      const hash = new Hash<unknown, unknown>();
      for (const [k, v] of Object.entries(decoded)) hash.set(k, v);
      return hash;
    });
  },
};

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
    data: TranslationData | Record<string, unknown>,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    const escape = "escape" in options ? options.escape : true;
    const flattened = this.flattenTranslations(locale, data, escape as boolean, this._subtrees);
    for (let [key, value] of Object.entries(flattened)) {
      key = `${locale}.${key}`;

      if (isHash(value)) {
        let oldValue: unknown;
        if (this._subtrees && (oldValue = this.store!.get(key)) != null) {
          oldValue = JSON.decode(oldValue as string);
          if (isHash(oldValue)) {
            value = deepMergeBang(deepSymbolizeKeys(oldValue), value);
          }
        }
      } else if (typeof value === "function") {
        throw new Error("Key-value stores cannot handle procs");
      }

      if (!isSymbol(value)) this.store!.set(key, JSON.encode(value));
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

  /** @missingRailsName inject — PERMANENT */
  protected translations(): TranslationData {
    return (this.translationsStore = deepSymbolizeKeys(
      [...this.store!.keys()]
        .map((mainKey) => {
          const mainValue: unknown = JSON.decode(this.store!.get(mainKey)!);
          return String(mainKey)
            .split(".")
            .reverse()
            .reduce<unknown>(
              (value, key) => new Hash<unknown, unknown>().set(`:${key}`, value),
              mainValue,
            ) as TranslationData;
        })
        .reduce<TranslationData | undefined>(
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
    const value: unknown = stored != null ? JSON.decode(stored) : stored;

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
      return hashAref(entry, key);
    }
  }
}

include(KeyValue, Base);

export class SubtreeProxy {
  #masterKey: string;
  #store: Store;
  #subtree: TranslationData | null;

  constructor(masterKey: string, store: Store) {
    this.#masterKey = masterKey;
    this.#store = store;
    this.#subtree = null;
  }

  hasKey(key: string): boolean {
    return (this.#subtree != null && this.#subtree.has(key)) || this.get(key) != null;
  }

  get(key: string): unknown {
    let value: unknown;
    if (this.#subtree == null || (value = this.#subtree.get(key)) == null) {
      value = this.#store.get(`${this.#masterKey}.${isSymbol(key) ? symbolToS(key) : key}`);
      if (value != null) {
        value = JSON.decode(value as string);
        (this.#subtree ??= new Hash()).set(key, value);
      }
    }
    return value;
  }

  isA(klass: unknown): boolean {
    if (Hash === klass) return true;
    if (
      !(
        typeof klass === "function" &&
        Object.getOwnPropertyDescriptor(klass, "prototype")?.writable === false
      ) &&
      !(typeof klass === "object" && klass !== null && isModuleObject(klass))
    ) {
      throw new TypeError("class or module required");
    }
    return rbObjIsKindOf(this, klass);
  }

  declare isKindOf: (klass: unknown) => boolean;

  isInstanceOf(klass: unknown): boolean {
    if (Hash === klass) return true;
    if (
      !(
        typeof klass === "function" &&
        Object.getOwnPropertyDescriptor(klass, "prototype")?.writable === false
      ) &&
      !(typeof klass === "object" && klass !== null && isModuleObject(klass))
    ) {
      throw new TypeError("class or module required");
    }
    return rbObjClass(this) === klass;
  }

  isNil(): boolean {
    return this.#subtree == null;
  }

  inspect(): string {
    return rbInspect(this.#subtree);
  }
}

SubtreeProxy.prototype.isKindOf = SubtreeProxy.prototype.isA;
