import { I18n, camelize, isPresent, kernelArray } from "@blazetrails/activesupport";
import {
  ArgumentError,
  Module,
  include,
  isSymbol,
  rbEqual,
  rbInspect,
  rbObjRespondTo,
  stringToSym,
  symbolToS,
} from "@blazetrails/ruby-compat";
import type { NestedDependencies } from "./digestor.js";
import { Base } from "./base.js";
import { TemplateHandlers } from "./template/handlers.js";
import { Template } from "./template.js";
import { PathRegistry } from "./path-registry.js";
import { PathSet, type PathSetResolver } from "./path-set.js";
import { Requested } from "./template-details.js";

type DetailValue = ReadonlyArray<string | symbol>;
type DetailsMap = Record<string, DetailValue>;
type DefaultProc = () => DetailValue;

const REGISTERED_DETAILS: string[] = [];

type DetailWriter = DetailValue | string | symbol | null | undefined;

export const Accessors = Object.assign(new Module(), {
  DEFAULT_PROCS: {} as Record<string, DefaultProc>,
});

type Accessors = {
  get formats(): DetailValue;
  set formats(value: DetailWriter);
  get variants(): DetailValue;
  set variants(value: DetailWriter);
  get handlers(): DetailValue;
  set handlers(value: DetailWriter);
  get locale(): unknown;
  set locale(value: DetailWriter);
  defaultLocale(): DetailValue;
  defaultFormats(): DetailValue;
  defaultVariants(): DetailValue;
  defaultHandlers(): DetailValue;
};

type DigestCache = Map<string | NestedDependencies, string | NestedDependencies>;

export class DetailsKey {
  /** @internal */
  static _detailsKeys = new Map<string, Requested>();
  /** @internal */
  static _digestCache = new Map<Requested, DigestCache>();

  static detailsCacheKey(details: DetailsMap): Requested {
    let formats = details.formats;
    if (formats && !Template.Types.isValidSymbols(formats)) {
      formats = formats.filter(
        (f) => typeof f === "string" && Template.Types.symbols().includes(f),
      ) as DetailValue;
    }
    const normalized: DetailsMap = { ...details, formats: formats ?? [] };
    const key = DetailsKey._stableKey(normalized);
    let req = DetailsKey._detailsKeys.get(key);
    if (req) return req;
    req = new Requested({
      locale: normalized.locale ?? [],
      handlers: normalized.handlers ?? [],
      formats: normalized.formats ?? [],
      variants: normalized.variants ?? [],
    });
    DetailsKey._detailsKeys.set(key, req);
    return req;
  }

  static digestCache(details: DetailsMap): DigestCache {
    const req = DetailsKey.detailsCacheKey(details);
    let cache = DetailsKey._digestCache.get(req);
    if (!cache) {
      cache = new Map();
      DetailsKey._digestCache.set(req, cache);
    }
    return cache;
  }

  static digestCaches(): Array<DigestCache> {
    return Array.from(DetailsKey._digestCache.values());
  }

  static viewContextClass(): typeof Base {
    return (DetailsKey._viewContextClass ??= Base.withEmptyTemplateCache());
  }

  /** @internal */
  private static _viewContextClass: typeof Base | null = null;

  static clear(): void {
    for (const resolver of PathRegistry.allResolvers()) {
      resolver.clearCache?.();
    }
    DetailsKey._viewContextClass = null;
    DetailsKey._detailsKeys.clear();
    DetailsKey._digestCache.clear();
  }

  /** @internal */
  private static _symbolIds: WeakMap<WeakKey, number> = new WeakMap();
  private static _nextSymbolId = 0;
  private static _tagSymbol(s: symbol): string {
    const keyed = Symbol.keyFor(s);
    if (keyed !== undefined) return `S@${keyed}`;
    let id = DetailsKey._symbolIds.get(s as unknown as WeakKey);
    if (id === undefined) {
      id = ++DetailsKey._nextSymbolId;
      DetailsKey._symbolIds.set(s as unknown as WeakKey, id);
    }
    return `s#${id}`;
  }

  /** @internal */
  private static _stableKey(details: DetailsMap): string {
    return JSON.stringify(
      REGISTERED_DETAILS.map((k) => [
        k,
        (details[k] ?? []).map((v) => (typeof v === "symbol" ? DetailsKey._tagSymbol(v) : v)),
      ]),
    );
  }
}

export class LookupContext extends (Object as unknown as new () => Accessors) {
  static DetailsKey: typeof DetailsKey;
  static Accessors: typeof Accessors;

  static get registeredDetails(): ReadonlyArray<string> {
    return REGISTERED_DETAILS;
  }

  /** @internal */
  static registerDetail(name: string, block: DefaultProc): void {
    REGISTERED_DETAILS.push(name);
    Accessors.DEFAULT_PROCS[name] = block;

    const defaultName = camelize(`default_${name}`, false);
    Accessors.defineMethod(defaultName, block);
    Accessors.moduleEval((mod) => {
      Object.defineProperty(mod, camelize(name, false), {
        get(this: LookupContext): DetailValue {
          return this._details[name] ?? [];
        },
        set(this: LookupContext, value: DetailWriter) {
          const detail: DetailValue = isPresent(value)
            ? kernelArray(value as (string | symbol)[])
            : (this as unknown as Record<string, DefaultProc>)[defaultName]();
          if (!rbEqual(detail, this._details[name])) this._setDetail(name, detail);
        },
        configurable: true,
      });
    });
  }

  private _details: DetailsMap;
  private _prefixes: string[];
  private _detailsKey: Requested | null = null;
  private _detailsCache = true;
  private _htmlFallbackForJs = false;
  private _viewPaths: PathSet;
  private _detailArgsForAny: [DetailsMap, Requested | null] | null = null;

  constructor(
    viewPaths: PathSet | ReadonlyArray<PathSetResolver> | null = null,
    details: DetailsMap = {},
    prefixes: string[] = [],
  ) {
    super();
    this._prefixes = prefixes;
    this._details = this.initializeDetails({}, details);
    this._viewPaths = this.buildViewPaths(viewPaths);
  }

  /** @internal */
  initializeDetails(target: DetailsMap, details: DetailsMap): DetailsMap {
    for (const k of REGISTERED_DETAILS) {
      target[k] = details[k] ?? Accessors.DEFAULT_PROCS[k].call(undefined);
    }
    return target;
  }

  get prefixes(): string[] {
    return this._prefixes;
  }
  set prefixes(value: string[]) {
    this._prefixes = value;
  }

  override get locale(): string | null {
    return (this._details.locale[0] as string | undefined) ?? null;
  }
  override set locale(value: string | null) {
    if (value != null) {
      const config = rbObjRespondTo(I18n.config(), "originalConfig")
        ? (I18n.config() as unknown as { originalConfig: ReturnType<typeof I18n.config> })
            .originalConfig
        : I18n.config();
      config.locale = isSymbol(value) ? symbolToS(value) : value;
    }

    super.locale = this.defaultLocale();
  }

  override get formats(): DetailValue {
    return super.formats;
  }
  override set formats(values: DetailValue | null | undefined) {
    if (values) {
      let arr = [...values];
      if (arr.includes("*/*")) arr = arr.filter((v) => v !== "*/*").concat(this.defaultFormats());
      arr = Array.from(new Set(arr));

      if (!Template.Types.isValidSymbols(arr)) {
        const invalidValues = arr.filter(
          (f) => typeof f !== "string" || !Template.Types.symbols().includes(f),
        );
        throw new ArgumentError(`Invalid formats: ${invalidValues.map(rbInspect).join(", ")}`);
      }

      if (arr.length === 1 && arr[0] === ":js") {
        arr.push(":html");
        this._htmlFallbackForJs = true;
      }
      values = arr;
    }
    super.formats = values;
  }
  get htmlFallbackForJs(): boolean {
    return this._htmlFallbackForJs;
  }

  /** @internal */
  private _setDetail(key: string, value: DetailValue): void {
    this._detailsKey = null;
    this._details = { ...this._details, [key]: value };
  }

  get cache(): boolean {
    return this._detailsCache;
  }
  set cache(value: boolean) {
    this._detailsCache = value;
  }

  detailsKey(): Requested | null {
    if (!this._detailsCache) return null;
    if (!this._detailsKey) this._detailsKey = DetailsKey.detailsCacheKey(this._details);
    return this._detailsKey;
  }

  disableCache<T>(block: () => T): T {
    const prev = this._detailsCache;
    this._detailsCache = false;
    try {
      return block();
    } finally {
      this._detailsCache = prev;
    }
  }

  digestCache(): DigestCache {
    return DetailsKey.digestCache(this._details);
  }

  withPrependedFormats(formats: DetailValue): LookupContext {
    const details = { ...this._details, formats };
    return new LookupContext(this._viewPaths, details, this._prefixes);
  }

  get viewPaths(): PathSet {
    return this._viewPaths;
  }

  /** @internal */
  buildViewPaths(paths: PathSet | ReadonlyArray<PathSetResolver> | null): PathSet {
    if (paths instanceof PathSet) return paths;
    return new PathSet(paths ?? []);
  }

  appendViewPaths(paths: ReadonlyArray<PathSetResolver>): void {
    this._viewPaths = this.buildViewPaths([...this._viewPaths.toArray(), ...paths]);
  }

  prependViewPaths(paths: ReadonlyArray<PathSetResolver>): void {
    this._viewPaths = this.buildViewPaths([...paths, ...this._viewPaths.toArray()]);
  }

  find(
    name: string,
    prefixes: ReadonlyArray<string> = [],
    partial = false,
    keys: ReadonlyArray<string> = [],
    options: Record<string, DetailValue> = {},
  ): unknown {
    const [base, pfxs] = this.normalizeName(name, prefixes);
    const [details, key] = this.detailArgsFor(options);
    return this._viewPaths.find(base, pfxs, partial, details, key, keys);
  }

  findTemplate(
    name: string,
    prefixes: ReadonlyArray<string> = [],
    partial = false,
    keys: ReadonlyArray<string> = [],
    options: Record<string, DetailValue> = {},
  ): unknown {
    return this.find(name, prefixes, partial, keys, options);
  }

  findAll(
    name: string,
    prefixes: ReadonlyArray<string> = [],
    partial = false,
    keys: ReadonlyArray<string> = [],
    options: Record<string, DetailValue> = {},
  ): unknown[] {
    const [base, pfxs] = this.normalizeName(name, prefixes);
    const [details, key] = this.detailArgsFor(options);
    return this._viewPaths.findAll(base, pfxs, partial, details, key, keys);
  }

  isExists(
    name: string,
    prefixes: ReadonlyArray<string> = [],
    partial = false,
    keys: ReadonlyArray<string> = [],
    options: Record<string, DetailValue> = {},
  ): boolean {
    const [base, pfxs] = this.normalizeName(name, prefixes);
    const [details, key] = this.detailArgsFor(options);
    return this._viewPaths.exists(base, pfxs, partial, details, key, keys);
  }

  isAny(name: string, prefixes: ReadonlyArray<string> = [], partial = false): boolean {
    const [base, pfxs] = this.normalizeName(name, prefixes);
    const [details, key] = this.detailArgsForAny();
    return this._viewPaths.exists(base, pfxs, partial, details, key, []);
  }

  /** @internal */
  detailArgsFor(options: Record<string, DetailValue>): [DetailsMap, Requested | null] {
    if (Object.keys(options).length === 0) return [this._details, this.detailsKey()];
    const userDetails = { ...this._details, ...options };
    const key = this._detailsCache ? DetailsKey.detailsCacheKey(userDetails) : null;
    return [userDetails, key];
  }

  /** @internal */
  detailArgsForAny(): [DetailsMap, Requested | null] {
    if (this._detailArgsForAny) return this._detailArgsForAny;
    const details: DetailsMap = {};
    for (const k of REGISTERED_DETAILS) {
      details[k] = Accessors.DEFAULT_PROCS[k]();
    }
    const key = this._detailsCache
      ? new Requested({
          locale: details.locale,
          handlers: details.handlers,
          formats: details.formats,
          variants: "any",
        })
      : null;
    this._detailArgsForAny = [details, key];
    return this._detailArgsForAny;
  }

  /** @internal */
  normalizeName(name: string, prefixes: ReadonlyArray<string>): [string, ReadonlyArray<string>] {
    const idx = name.lastIndexOf("/");
    if (idx < 0) return [name, prefixes.length > 0 ? prefixes : [""]];
    let pathPrefix = name.slice(0, idx);
    if (pathPrefix.startsWith("/")) pathPrefix = pathPrefix.slice(1);
    const base = name.slice(idx + 1);
    const pfxs = prefixes.length === 0 ? [pathPrefix] : prefixes.map((p) => `${p}/${pathPrefix}`);
    return [base, pfxs];
  }

  private buildViewContext(): Base {
    return new (DetailsKey.viewContextClass())(this, {}, null);
  }
}

(LookupContext as { DetailsKey: typeof DetailsKey }).DetailsKey = DetailsKey;
LookupContext.Accessors = Accessors;
include(LookupContext, Accessors);

LookupContext.registerDetail("locale", () => {
  const locales: (string | symbol)[] = [stringToSym(I18n.locale() as string)];
  if (rbObjRespondTo(I18n, "fallbacks"))
    locales.push(
      ...I18n.fallbacks()
        .get(I18n.locale() as string)
        .map(stringToSym),
    );
  locales.push(stringToSym(I18n.defaultLocale()));
  return [...new Set(locales)];
});
LookupContext.registerDetail(
  "formats",
  () => Base.defaultFormats ?? [":html", ":text", ":js", ":css", ":xml", ":json"],
);
LookupContext.registerDetail("variants", () => []);
LookupContext.registerDetail("handlers", () => TemplateHandlers.extensions());
