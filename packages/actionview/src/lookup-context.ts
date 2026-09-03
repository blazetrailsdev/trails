import type { RenderContext } from "./template/handlers.js";
import { Base } from "./base.js";
import { TemplateHandlers } from "./template/handlers.js";
import type { Template } from "./template.js";
import { Jaro } from "@blazetrails/did-you-mean";
import { PathRegistry } from "./path-registry.js";
import { PathSet, type PathSetResolver } from "./path-set.js";
import { Requested } from "./template-details.js";
import { Types } from "./template/types.js";

type DetailValue = ReadonlyArray<string | symbol>;
type DetailsMap = Record<string, DetailValue>;
type DefaultProc = () => DetailValue;

const DEFAULT_PROCS: Record<string, DefaultProc> = {};
const REGISTERED_DETAILS: string[] = [];

function registerDetail(name: string, proc: DefaultProc): void {
  if (!REGISTERED_DETAILS.includes(name)) REGISTERED_DETAILS.push(name);
  DEFAULT_PROCS[name] = proc;
}

registerDetail("locale", () => ["en"]);
registerDetail(
  "formats",
  () => Base.defaultFormats ?? ["html", "text", "js", "css", "xml", "json"],
);
registerDetail("variants", () => []);
registerDetail("handlers", () => TemplateHandlers.extensions() as DetailValue);

export class MissingTemplate extends Error {
  /** @internal */
  readonly path: string;
  /** @internal */
  readonly paths: string[];
  /** @internal */
  readonly prefixes: string[];
  /** @internal */
  readonly partial: boolean;
  /** @internal */
  readonly templateKeys: readonly string[];

  /** @internal */
  readonly candidatePaths: readonly string[];

  #cachedCorrections?: string[];

  constructor(
    public readonly controller: string,
    public readonly action: string,
    public readonly format: string,
    public readonly searchedPaths: string[],
    candidatePaths: readonly string[] = [],
  ) {
    const templatePath = controller ? `${controller}/${action}` : action;
    super(
      `Missing template ${templatePath} with format "${format}". ` +
        `Searched in: ${searchedPaths.length > 0 ? searchedPaths.join(", ") : "(no resolvers)"}`,
    );
    this.name = "MissingTemplate";
    this.path = controller ? `${controller}/${action}` : action;
    this.paths = searchedPaths;
    this.prefixes = controller ? [controller] : [];
    this.partial = action.startsWith("_");
    this.templateKeys = [format];
    this.candidatePaths = candidatePaths;
  }

  get corrections(): string[] {
    if (this.#cachedCorrections !== undefined) return this.#cachedCorrections;

    const isPartialBasename = (p: string) => {
      const slash = p.lastIndexOf("/");
      const base = slash === -1 ? p : p.slice(slash + 1);
      return base.startsWith("_");
    };

    const candidates = this.candidatePaths.filter((p) =>
      this.partial ? isPartialBasename(p) : !isPartialBasename(p),
    );

    if (candidates.length === 0) {
      this.#cachedCorrections = [];
      return this.#cachedCorrections;
    }

    const lookup = this.path;
    const scored = candidates.map((c) => ({ c, score: -Jaro.distance(lookup, c) }));
    scored.sort((a, b) => a.score - b.score);
    const top = scored
      .slice(0, 6)
      .map(({ c }) => (this.partial ? c.replace(/_([^/]+)$/, "$1") : c));

    this.#cachedCorrections = top;
    return this.#cachedCorrections;
  }
}

export class DetailsKey {
  /** @internal */
  static _detailsKeys = new Map<string, Requested>();
  /** @internal */
  static _digestCache = new Map<Requested, Map<string, string>>();

  static detailsCacheKey(details: DetailsMap): Requested {
    let formats = details.formats;
    if (formats && !Types.isValidSymbols(formats)) {
      formats = formats.filter(
        (f) => typeof f === "string" && Types.symbols().includes(f),
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

  static digestCache(details: DetailsMap): Map<string, string> {
    const req = DetailsKey.detailsCacheKey(details);
    let cache = DetailsKey._digestCache.get(req);
    if (!cache) {
      cache = new Map();
      DetailsKey._digestCache.set(req, cache);
    }
    return cache;
  }

  static digestCaches(): Array<Map<string, string>> {
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

export class LookupContext {
  static DetailsKey: typeof DetailsKey;

  static get registeredDetails(): ReadonlyArray<string> {
    return REGISTERED_DETAILS;
  }

  /** @internal */
  static registerDetail(name: string, proc: DefaultProc): void {
    registerDetail(name, proc);
  }

  /** @internal */
  static _defaultProcs(): Record<string, DefaultProc> {
    return DEFAULT_PROCS;
  }

  private layoutName: string | false | null = "application";

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
    this._prefixes = prefixes;
    this._details = this.initializeDetails({}, details);
    this._viewPaths = this.buildViewPaths(viewPaths);
  }

  /** @internal */
  initializeDetails(target: DetailsMap, details: DetailsMap): DetailsMap {
    for (const k of REGISTERED_DETAILS) {
      target[k] = details[k] ?? DEFAULT_PROCS[k]();
    }
    return target;
  }

  get prefixes(): string[] {
    return this._prefixes;
  }
  set prefixes(value: string[]) {
    this._prefixes = value;
  }

  get locale(): string | symbol | null {
    return this._details.locale[0] ?? null;
  }
  set locale(value: string | symbol | null) {
    this._setDetail("locale", value == null ? DEFAULT_PROCS.locale() : [value]);
  }

  get formats(): DetailValue {
    return this._details.formats;
  }
  set formats(values: DetailValue | null | undefined) {
    if (!values) {
      this._setDetail("formats", DEFAULT_PROCS.formats());
      return;
    }
    let arr = [...values];
    const hadWildcard = arr.includes("*/*");
    if (hadWildcard) {
      arr = arr.filter((v) => v !== "*/*").concat(DEFAULT_PROCS.formats());
    }
    arr = Array.from(new Set(arr));
    if (!Types.isValidSymbols(arr)) {
      const invalidValues = arr.filter(
        (f) => typeof f !== "string" || !Types.symbols().includes(f),
      );
      throw new Error(`Invalid formats: ${invalidValues.map((v) => String(v)).join(", ")}`);
    }
    if (arr.length === 1 && arr[0] === "js") {
      arr.push("html");
      this._htmlFallbackForJs = true;
    }
    this._setDetail("formats", arr);
  }
  get htmlFallbackForJs(): boolean {
    return this._htmlFallbackForJs;
  }

  get variants(): DetailValue {
    return this._details.variants;
  }
  set variants(values: DetailValue | null | undefined) {
    this._setDetail(
      "variants",
      values && values.length > 0 ? [...values] : DEFAULT_PROCS.variants(),
    );
  }

  get handlers(): DetailValue {
    return this._details.handlers;
  }
  set handlers(values: DetailValue | null | undefined) {
    this._setDetail(
      "handlers",
      values && values.length > 0 ? [...values] : DEFAULT_PROCS.handlers(),
    );
  }

  /** @internal */
  private _setDetail(key: string, value: DetailValue): void {
    if (this._details[key] === value) return;
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

  digestCache(): Map<string, string> {
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
      details[k] = DEFAULT_PROCS[k]();
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

  /** @noRailsEquivalent CONVERGEABLE actionview-drop-add-resolver-for-append-view-paths */
  addResolver(resolver: PathSetResolver): void {
    this.appendViewPaths([resolver]);
  }

  setLayout(name: string | false): void {
    this.layoutName = name;
  }

  getLayout(): string | false | null {
    return this.layoutName;
  }

  /** @internal */
  findTemplate(
    name: string,
    prefixes: ReadonlyArray<string> = [],
    formats?: DetailValue,
  ): Template | null {
    return (
      (this.findAll(name, prefixes, false, [], formats ? { formats } : {})[0] as Template) ?? null
    );
  }

  findPartial(
    name: string,
    prefixes: ReadonlyArray<string> = [],
    formats?: DetailValue,
  ): Template | null {
    return (
      (this.findAll(name, prefixes, true, [], formats ? { formats } : {})[0] as Template) ?? null
    );
  }

  /** @internal */
  findLayout(
    name: string,
    prefixes: ReadonlyArray<string> = ["layouts"],
    formats?: DetailValue,
  ): Template | null {
    const template = this.findAll(name, prefixes, false, [], formats ? { formats } : {})[0] as
      | Template
      | undefined;
    return template ? template.asLayout() : null;
  }

  async render(
    prefixes: ReadonlyArray<string>,
    action: string,
    formats: DetailValue,
    locals: Record<string, unknown> = {},
    options: { layout?: string | false; view?: Base } = {},
  ): Promise<string> {
    const controller = String(prefixes[0] ?? "");
    const format = String(formats[0] ?? "html");
    const template = this.findTemplate(action, prefixes, formats);
    if (!template) {
      throw new MissingTemplate(
        controller,
        action,
        format,
        this.resolverNames(),
        this.allCandidatePaths(),
      );
    }

    const context: RenderContext = {
      controller,
      action,
      format,
    };

    const view = options.view ?? this.buildViewContext();
    let output = await this.renderTemplate(template, locals, { ...context, view });

    const layoutName = options.layout !== undefined ? options.layout : this.layoutName;
    if (layoutName !== false && layoutName) {
      const layoutTemplate = this.findLayout(layoutName, ["layouts"], formats);
      if (layoutTemplate) {
        view.viewFlow.set("layout", output);
        output = await this.renderTemplate(layoutTemplate, locals, { ...context, view });
      }
    }

    return output;
  }

  async renderPartial(
    name: string,
    prefix: string,
    format: string,
    locals: Record<string, unknown> = {},
    view?: Base,
  ): Promise<string> {
    const template = this.findPartial(name, [prefix], [format]);
    if (!template) {
      throw new MissingTemplate(
        prefix,
        `_${name}`,
        format,
        this.resolverNames(),
        this.allCandidatePaths(),
      );
    }

    const context: RenderContext = {
      controller: prefix,
      action: `_${name}`,
      format,
    };

    return this.renderTemplate(template, locals, { ...context, view });
  }

  async renderCollection(
    partial: string,
    prefix: string,
    format: string,
    collection: unknown[],
    as?: string,
  ): Promise<string> {
    const varName = as ?? partial;
    const parts: string[] = [];

    for (let i = 0; i < collection.length; i++) {
      const locals: Record<string, unknown> = {
        [varName]: collection[i],
        [`${varName}_counter`]: i,
        [`${varName}_iteration`]: { index: i, first: i === 0, last: i === collection.length - 1 },
      };
      parts.push(await this.renderPartial(partial, prefix, format, locals));
    }

    return parts.join("");
  }

  async renderTemplate(
    template: Template,
    locals: Record<string, unknown>,
    context: RenderContext & { view?: Base },
  ): Promise<string> {
    const view = context.view ?? this.buildViewContext();
    if (context.yield !== undefined) view.viewFlow.set("layout", context.yield);
    return template.render(view, locals);
  }

  /** @noRailsEquivalent PERMANENT */
  renderPartialSync(
    name: string,
    prefix: string,
    format: string,
    locals: Record<string, unknown> = {},
    view?: Base,
  ): string {
    const slash = name.lastIndexOf("/");
    const partialPrefix = slash === -1 ? prefix : name.slice(0, slash);
    const partialName = slash === -1 ? name : name.slice(slash + 1);

    const template = this.findPartial(partialName, [partialPrefix], [format]);
    if (!template) {
      throw new MissingTemplate(
        partialPrefix,
        `_${partialName}`,
        format,
        this.resolverNames(),
        this.allCandidatePaths(),
      );
    }

    const partialView = view ?? this.buildViewContext();

    return template.render(partialView, locals);
  }

  /** @noRailsEquivalent PERMANENT */
  renderTemplateSync(
    name: string,
    prefix: string,
    format: string,
    locals: Record<string, unknown> = {},
    view?: Base,
  ): string {
    const slash = name.lastIndexOf("/");
    const templatePrefix = slash === -1 ? prefix : name.slice(0, slash);
    const templateName = slash === -1 ? name : name.slice(slash + 1);

    const template = this.findTemplate(templateName, [templatePrefix], [format]);
    if (!template) {
      throw new MissingTemplate(
        templatePrefix,
        templateName,
        format,
        this.resolverNames(),
        this.allCandidatePaths(),
      );
    }

    return template.render(view ?? this.buildViewContext(), locals);
  }

  private buildViewContext(): Base {
    return new (DetailsKey.viewContextClass())(this, {}, null);
  }

  private resolverNames(): string[] {
    return this._viewPaths.toArray().map((r) => r.constructor.name);
  }

  /** @internal */
  private allCandidatePaths(): string[] {
    const seen = new Set<string>();
    for (const resolver of this._viewPaths) {
      try {
        const paths = resolver.allTemplatePaths?.();
        if (paths) {
          for (const p of paths) seen.add(p.virtual);
        }
      } catch {
        /** @empty */
      }
    }
    return Array.from(seen);
  }
}

(LookupContext as { DetailsKey: typeof DetailsKey }).DetailsKey = DetailsKey;
