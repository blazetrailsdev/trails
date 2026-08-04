/**
 * Mirrors: i18n/lib/i18n/backend/key_value.rb
 *
 * The gem splits the code into a `KeyValue::Implementation` module so other
 * modules can be `include`d over it; TypeScript has no module reopening, so
 * `KeyValue` is a single class extending `Base`, exactly as `Simple` is. The
 * `include Flatten` is the trails mixin idiom — `this`-typed functions from
 * `flatten.ts` assigned to the class.
 *
 * `I18n::JSON` is `Oj` or `ActiveSupport::JSON` depending on what is
 * installed (key_value.rb:7-22); JS has `JSON` in the language, and its
 * `stringify` / `parse` are that `encode` / `decode`.
 *
 * The store is the gem's duck type, not a class: anything answering `[]`,
 * `[]=` and `keys` (key_value.rb:26-30). A Ruby Hash is a JS `Map`, whose
 * `get` / `set` / `keys` are those three, which is the same reading
 * `fallbacks.test.ts` already gives a Hash passed as a collaborator.
 *
 * `reduce` carries a seed because JS has no `inject` — an empty array is a
 * `TypeError` rather than Ruby's `nil`. Seeding with `undefined` restores
 * `inject`'s answer, so an empty store still raises where Ruby raises, inside
 * `deep_symbolize_keys` (i18n/lib/i18n/utils.rb:34), and not a call earlier.
 *
 * Not ported on `SubtreeProxy`: `is_a?`, `kind_of?`, `instance_of?`, `nil?`
 * and `inspect` are Ruby core object protocol (see "Skipped methods" in
 * docs/ruby-ts-conventions.md). `nil?` still has a body here because the
 * emptiness it reports is load-bearing — see `Base`'s `isNil`.
 */

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

/** The store `KeyValue` is initialized with (key_value.rb:26-30). */
export interface Store {
  get(key: string): string | undefined;
  set(key: string, value: string): unknown;
  keys(): Iterable<string>;
}

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSymbol(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(":");
}

/**
 * The methods `SubtreeProxy` answers itself; every other property read is a
 * store lookup, which is what Ruby gets for free from `[]` being a method
 * while `@master_key` / `@store` / `@subtree` are ivars. Those three keep the
 * Rails names as `#private` fields, which — unlike ordinary ones — are not
 * properties at all, so no translation key can collide with them.
 */
const SUBTREE_PROXY_METHODS = new Set(["get", "hasKey", "nil"]);

/**
 * This is a basic backend for key value stores. It receives on
 * initialization the store, which should respond to three methods:
 *
 * * store.get(key)        - Used to get a value
 * * store.set(key, value) - Used to set a value
 * * store.keys()          - Used to get all keys
 *
 * Since these stores only supports string, all values are converted
 * to JSON before being stored, allowing it to also store booleans,
 * hashes and arrays. However, this store does not support Procs.
 *
 * As the ActiveRecord backend, Symbols are just supported when loading
 * translations from the filesystem or through explicit store translations.
 *
 * Also, avoid calling I18n.availableLocales since it's a somehow
 * expensive operation in most stores.
 *
 * == Subtrees
 *
 * In most backends, you are allowed to retrieve part of a translation tree:
 *
 *     I18n.backend().storeTranslations("en", { foo: { bar: ":baz" } });
 *     I18n.t("foo"); //=> { bar: ":baz" }
 *
 * This backend supports this feature by default, but it slows down the storage
 * of new data considerably and makes hard to delete entries. That said, you are
 * allowed to disable the storage of subtrees on initialization
 * (`new KeyValue(store, false)`), which is useful when a KeyValue backend is
 * chained to a Simple backend.
 */
export class KeyValue extends Base {
  store: Store | null;
  private subtreesFlag: boolean;

  /** @internal Ruby's `@links` ivar, which `Flatten#links` memoizes into. */
  linksCache?: Map<string, Map<string, string>>;

  /** Mirrors: `include Flatten` (key_value.rb:70). */
  normalizeFlatKeys = normalizeFlatKeys;
  links = links;
  flattenKeys = flattenKeys;
  flattenTranslations = flattenTranslations;
  storeLink = storeLink;
  resolveLink = resolveLink;
  findLink = findLink;
  escapeDefaultSeparator = escapeDefaultSeparator;

  /** @internal Ruby's `@translations` ivar, which `translations` memoizes into. */
  translationsStore?: TranslationData;

  constructor(store: Store | null, subtrees = true) {
    super();
    this.store = store;
    this.subtreesFlag = subtrees;
  }

  /** Mirrors: `initialized?` */
  initialized(): boolean {
    return this.store != null;
  }

  override storeTranslations(
    locale: Locale,
    data: TranslationData,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    const escape = "escape" in options ? options.escape : true;
    const flattened = this.flattenTranslations(locale, data, escape as boolean, this.subtreesFlag);
    for (let [key, value] of Object.entries(flattened)) {
      key = `${locale}.${key}`;

      if (isHash(value)) {
        let oldValue: unknown;
        if (this.subtreesFlag && (oldValue = this.store!.get(key)) != null) {
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

  override availableLocales(): Locale[] {
    let locales: (Locale | null)[] = [...this.store!.keys()].map((k) => {
      const index = k.indexOf(".");
      return index === -1 ? null : k.slice(0, index);
    });
    locales = [...new Set(locales)];
    locales = locales.filter((k) => k != null);
    return locales as Locale[];
  }

  /**
   * Queries the translations from the key-value store and converts
   * them into a hash such as the one returned from loading the
   * haml files
   */
  protected translations(): TranslationData {
    const nested = [...this.store!.keys()].map((mainKey) => {
      const mainValue: unknown = JSON.parse(this.store!.get(mainKey)!);
      return String(mainKey)
        .split(".")
        .reverse()
        .reduce<unknown>((value, key) => ({ [key]: value }), mainValue) as TranslationData;
    });
    const injected = nested.reduce<TranslationData | undefined>(
      (hash, elem) => (hash === undefined ? elem : deepMergeBang(hash, elem)),
      undefined,
    );
    return (this.translationsStore = deepSymbolizeKeys(injected!));
  }

  protected initTranslations(): void {
    // NO OP
    // This call made also inside Simple Backend and accessed by
    // other plugins like I18n-js and babilu and
    // to use it along with the Chain backend we need to
    // provide a uniform API even for protected methods :S
  }

  /** Mirrors: `subtrees?` */
  protected override subtrees(): boolean {
    return this.subtreesFlag;
  }

  protected override lookup(
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
    } else if (!this.subtreesFlag) {
      return new SubtreeProxy(`${locale}.${key}`, this.store!);
    }
    return undefined;
  }

  protected override pluralize(locale: Locale, entry: unknown, count: unknown): unknown {
    if (this.subtrees()) {
      return super.pluralize(locale, entry, count);
    } else {
      if (!isHash(entry)) return entry;
      const key = this.pluralizationKey(entry, count);
      return entry[key];
    }
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

  /** Mirrors: `has_key?` */
  hasKey(key: string): boolean {
    return (this.#subtree != null && key in this.#subtree) || this.get(key) != null;
  }

  /** Mirrors: `[]` */
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

  /** Mirrors: `nil?` */
  nil(): boolean {
    return this.#subtree == null;
  }
}
