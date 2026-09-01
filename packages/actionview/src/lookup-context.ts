/**
 * ActionView::LookupContext
 *
 * Orchestrates template resolution and rendering. Combines resolvers
 * (which find templates) with handlers (which render them).
 *
 * Usage:
 *   const ctx = new LookupContext();
 *   ctx.addResolver(new FileSystemResolver("app/views"));
 *   ctx.addResolver(new InMemoryResolver()); // fallback
 *
 *   const output = await ctx.render("posts", "index", "html", { posts: [...] });
 *
 * Phase 1d fleshes out the registered-details cascade (locale, formats,
 * variants, handlers) and a real `DetailsKey` cache mirroring
 * `action_view/lookup_context.rb`.
 */

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

// I18n is not yet ported; fall back to a single "en" locale.
registerDetail("locale", () => ["en"]);
registerDetail(
  "formats",
  () => Base.defaultFormats ?? ["html", "text", "js", "css", "xml", "json"],
);
registerDetail("variants", () => []);
registerDetail("handlers", () => TemplateHandlers.extensions() as DetailValue);

export class MissingTemplate extends Error {
  /** Rails-shape accessors — refined in Phase 1d. @internal stub - real impl in Phase 1d */
  readonly path: string;
  /** @internal stub - real impl in Phase 1d */
  readonly paths: string[];
  /** @internal stub - real impl in Phase 1d */
  readonly prefixes: string[];
  /** @internal stub - real impl in Phase 1d */
  readonly partial: boolean;
  /** @internal stub - real impl in Phase 1d */
  readonly templateKeys: readonly string[];

  /** Flat list of all template paths known to the resolvers at throw time. @internal */
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

  /**
   * Mirrors `ActionView::MissingTemplate#corrections` — suggests the closest
   * known template paths using `DidYouMean::Jaro.distance`. Rails weights
   * prefix and basename separately; this port scores the full path string,
   * which produces equivalent rankings for the common case.
   */
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

/**
 * Per-process cache of `{locale, formats, variants, handlers}` detail
 * tuples + their associated digest caches. Mirrors
 * `ActionView::LookupContext::DetailsKey`.
 */
export class DetailsKey {
  /** @internal */
  static _detailsKeys = new Map<string, Requested>();
  /** @internal */
  static _digestCache = new Map<Requested, Map<string, string>>();

  /** Canonical Requested object for a given detail tuple. */
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

  /** Digest cache scoped to a given detail tuple. */
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

  /**
   * Clear the details and digest caches, plus any resolver caches
   * advertised by `PathRegistry`. Until the resolver port (Phase 1c)
   * wires real entries into `PathRegistry`, the resolver loop is a
   * no-op.
   */
  static clear(): void {
    for (const resolver of PathRegistry.allResolvers()) {
      resolver.clearCache?.();
    }
    DetailsKey._detailsKeys.clear();
    DetailsKey._digestCache.clear();
  }

  /** @internal Per-symbol identity tag, so two non-global Symbols with
   * the same description don't collide in `_stableKey`. Mirrors Ruby's
   * symbol interning (where `:foo == :foo` is always true) by giving
   * each non-interned Symbol a stable per-process numeric id. Stored
   * in a WeakMap so unreferenced symbols can be GC'd. */
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

  /** @internal Unambiguous key for a details tuple — JSON encoding so
   * raw `:`, `,`, or `|` inside a detail value can't collide. */
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

  /** Names of detail facets registered process-wide. */
  static get registeredDetails(): ReadonlyArray<string> {
    return REGISTERED_DETAILS;
  }

  /** @internal Register a new detail facet (used by extensions). */
  static registerDetail(name: string, proc: DefaultProc): void {
    registerDetail(name, proc);
  }

  /** @internal */
  static _defaultProcs(): Record<string, DefaultProc> {
    return DEFAULT_PROCS;
  }

  // --- Existing high-level renderer state (kept for AC integration) ---
  private layoutName: string | false | null = "application";

  // --- Rails-faithful state ---
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

  /**
   * @internal
   * Populate `target` with the registered detail facets, falling back to
   * each facet's default proc when `details` doesn't supply a value.
   * Mirrors `LookupContext#initialize_details`.
   */
  initializeDetails(target: DetailsMap, details: DetailsMap): DetailsMap {
    for (const k of REGISTERED_DETAILS) {
      target[k] = details[k] ?? DEFAULT_PROCS[k]();
    }
    return target;
  }

  // --- prefixes ---
  get prefixes(): string[] {
    return this._prefixes;
  }
  set prefixes(value: string[]) {
    this._prefixes = value;
  }

  // --- details accessors ---
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

  // --- cache controls (DetailsCache module) ---
  get cache(): boolean {
    return this._detailsCache;
  }
  set cache(value: boolean) {
    this._detailsCache = value;
  }

  /** Cache key for the current details tuple (null when cache is off). */
  detailsKey(): Requested | null {
    if (!this._detailsCache) return null;
    if (!this._detailsKey) this._detailsKey = DetailsKey.detailsCacheKey(this._details);
    return this._detailsKey;
  }

  /** Run `block` with the details cache disabled. */
  disableCache<T>(block: () => T): T {
    const prev = this._detailsCache;
    this._detailsCache = false;
    try {
      return block();
    } finally {
      this._detailsCache = prev;
    }
  }

  /** Digest cache scoped to the current details tuple. */
  digestCache(): Map<string, string> {
    return DetailsKey.digestCache(this._details);
  }

  /**
   * Return a sibling `LookupContext` whose `formats` detail is replaced
   * with the given list. Mirrors `LookupContext#with_prepended_formats`.
   */
  withPrependedFormats(formats: DetailValue): LookupContext {
    const details = { ...this._details, formats };
    return new LookupContext(this._viewPaths, details, this._prefixes);
  }

  // --- ViewPaths module ---
  /** Frozen `PathSet` of resolvers used for Rails-shape lookups. */
  get viewPaths(): PathSet {
    return this._viewPaths;
  }

  /**
   * @internal
   * Whenever setting view paths, make a copy so we can manipulate them
   * per-instance without aliasing. Mirrors
   * `ViewPaths#build_view_paths` (the `String`/`Pathname` wrapping there
   * is deferred to the resolver port).
   */
  buildViewPaths(paths: PathSet | ReadonlyArray<PathSetResolver> | null): PathSet {
    if (paths instanceof PathSet) return paths;
    return new PathSet(paths ?? []);
  }

  /** Append `paths` to the current view-path set. */
  appendViewPaths(paths: ReadonlyArray<PathSetResolver>): void {
    this._viewPaths = this.buildViewPaths([...this._viewPaths.toArray(), ...paths]);
  }

  /** Prepend `paths` to the current view-path set. */
  prependViewPaths(paths: ReadonlyArray<PathSetResolver>): void {
    this._viewPaths = this.buildViewPaths([...paths, ...this._viewPaths.toArray()]);
  }

  /**
   * Find one matching template (Rails-shape signature). Aliased as
   * `findTemplate` for the existing 3-arg call sites.
   */
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

  /** Rails-shape `find_all`. */
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

  /** Rails-shape `exists?` / `template_exists?`. */
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

  /**
   * Rails-shape `any?` / `any_templates?` — ignores format/locale/variant
   * constraints by using `detail_args_for_any`.
   */
  isAny(name: string, prefixes: ReadonlyArray<string> = [], partial = false): boolean {
    const [base, pfxs] = this.normalizeName(name, prefixes);
    const [details, key] = this.detailArgsForAny();
    return this._viewPaths.exists(base, pfxs, partial, details, key, []);
  }

  /**
   * @internal
   * Compute the (details, detailsKey) pair for a lookup. Returns the
   * memoized request details when `options` is empty (the hot path).
   */
  detailArgsFor(options: Record<string, DetailValue>): [DetailsMap, Requested | null] {
    if (Object.keys(options).length === 0) return [this._details, this.detailsKey()];
    const userDetails = { ...this._details, ...options };
    const key = this._detailsCache ? DetailsKey.detailsCacheKey(userDetails) : null;
    return [userDetails, key];
  }

  /**
   * @internal
   * Details tuple for `any?` lookups — every facet at its default except
   * `variants`, which is wildcarded.
   */
  detailArgsForAny(): [DetailsMap, Requested | null] {
    if (this._detailArgsForAny) return this._detailArgsForAny;
    const details: DetailsMap = {};
    for (const k of REGISTERED_DETAILS) {
      details[k] = DEFAULT_PROCS[k]();
    }
    // Rails passes `variants: :any` here; the canonical Requested uses
    // a sentinel-array branch ("any") that matches every variant. We
    // bypass DetailsKey._detailsKeys for this special form since
    // `Requested.variantsIdx === "any"` is not representable in the
    // DetailsMap.
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

  /**
   * @internal
   * Splits a possibly-namespaced template name (`"admin/users/show"`)
   * into `(name, prefixes)`. Mirrors `ViewPaths#normalize_name`.
   */
  normalizeName(name: string, prefixes: ReadonlyArray<string>): [string, ReadonlyArray<string>] {
    const idx = name.lastIndexOf("/");
    if (idx < 0) return [name, prefixes.length > 0 ? prefixes : [""]];
    let pathPrefix = name.slice(0, idx);
    if (pathPrefix.startsWith("/")) pathPrefix = pathPrefix.slice(1);
    const base = name.slice(idx + 1);
    const pfxs = prefixes.length === 0 ? [pathPrefix] : prefixes.map((p) => `${p}/${pathPrefix}`);
    return [base, pfxs];
  }

  /**
   * Add a resolver to the lookup chain. First added = highest priority.
   * An alias for Rails' `append_view_paths` (`view_paths.rb:87-89`), so
   * every resolver reaches the same `PathSet` the Rails-shape lookups read.
   *
   * @noRailsEquivalent CONVERGEABLE actionview-drop-add-resolver-for-append-view-paths
   */
  addResolver(resolver: PathSetResolver): void {
    this.appendViewPaths([resolver]);
  }

  /** Set the layout to use. Pass false to disable layout. */
  setLayout(name: string | false): void {
    this.layoutName = name;
  }

  /** Get the current layout name. */
  getLayout(): string | false | null {
    return this.layoutName;
  }

  /**
   * Find a template across all resolvers.
   *
   * @internal
   */
  findTemplate(name: string, prefix: string, format: string): Template | null {
    return (this.findAll(name, [prefix], false, [], { formats: [format] })[0] as Template) ?? null;
  }

  /**
   * Find a partial template. Partials are prefixed with underscore.
   */
  findPartial(name: string, prefix: string, format: string): Template | null {
    return (this.findAll(name, [prefix], true, [], { formats: [format] })[0] as Template) ?? null;
  }

  /**
   * Find a layout template.
   *
   * @internal
   */
  findLayout(name: string, format: string): Template | null {
    const template = this.findAll(name, ["layouts"], false, [], { formats: [format] })[0] as
      | Template
      | undefined;
    return template ? template.asLayout() : null;
  }

  /**
   * Render a template by controller/action.
   *
   * @param controller Controller name (e.g., "posts")
   * @param action     Action name (e.g., "index")
   * @param format     Response format (e.g., "html")
   * @param locals     Template variables
   * @param options    Additional options
   * @returns Rendered output string
   */
  async render(
    controller: string,
    action: string,
    format: string,
    locals: Record<string, unknown> = {},
    options: { layout?: string | false } = {},
  ): Promise<string> {
    const template = this.findTemplate(action, controller, format);
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

    // Rails renders the content template and its layout against the SAME view
    // (`TemplateRenderer#render_with_layout`, `template_renderer.rb:71-78`:
    // `view.view_flow.set(:layout, yield(layout)); layout.render(view, locals)`),
    // which is what carries a `content_for` section from one to the other.
    const view = this.buildViewContext();
    let output = await this.renderTemplate(template, locals, { ...context, view });

    const layoutName = options.layout !== undefined ? options.layout : this.layoutName;
    if (layoutName !== false && layoutName) {
      const layoutTemplate = this.findLayout(layoutName, format);
      if (layoutTemplate) {
        view.viewFlow.set("layout", output);
        output = await this.renderTemplate(layoutTemplate, locals, { ...context, view });
      }
    }

    return output;
  }

  /**
   * Render a partial.
   *
   * @param name       Partial name (without underscore prefix)
   * @param prefix     Controller prefix
   * @param format     Response format
   * @param locals     Template variables
   * @returns Rendered partial output
   */
  async renderPartial(
    name: string,
    prefix: string,
    format: string,
    locals: Record<string, unknown> = {},
  ): Promise<string> {
    const template = this.findPartial(name, prefix, format);
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

    return this.renderTemplate(template, locals, context);
  }

  /**
   * Render a collection of items with a partial.
   *
   * @param partial    Partial name
   * @param prefix     Controller prefix
   * @param format     Response format
   * @param collection Array of items
   * @param as         Local variable name for each item (defaults to partial name)
   * @returns Rendered collection output
   */
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

  /**
   * Render a Template against a view, as `Template#render` (`template.rb:271`)
   * does.
   */
  async renderTemplate(
    template: Template,
    locals: Record<string, unknown>,
    context: RenderContext & { view?: Base },
  ): Promise<string> {
    const view = context.view ?? this.buildViewContext();
    if (context.yield !== undefined) view.viewFlow.set("layout", context.yield);
    return template.render(view, locals);
  }

  /**
   * Render a partial synchronously, for a nested `render partial:` inside a
   * compiled template. Rails needs no such entry point: partial rendering is
   * synchronous end to end and the template's own `self` answers `render`.
   * trails' handler protocol permits an async `render`, so a handler that
   * returns a promise says so rather than emitting `[object Promise]`.
   *
   * A qualified `name` ("users/user") replaces `prefix` with its leading
   * segments, mirroring `PartialRenderer#partial_path`
   * (`actionview/lib/action_view/renderer/partial_renderer.rb`).
   *
   * @noRailsEquivalent PERMANENT — trails' render path is asynchronous by
   * design where Rails' is synchronous, so the synchronous entry point a
   * compiled template needs has no Rails counterpart and will not converge.
   */
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

    const template = this.findPartial(partialName, partialPrefix, format);
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

  /**
   * The view a template renders against. Rails caches the view class on
   * `LookupContext::DetailsKey` (`lookup_context.rb`,
   * `DetailsKey.view_context_class`), which is a `with_empty_template_cache`
   * subclass, so compiled methods are shared across renders but never across
   * caches. Rails builds it on the controller instead; see
   * `port-view-context-class-on-controller`.
   */
  private buildViewContext(): Base {
    this._viewContextClass ??= Base.withEmptyTemplateCache();
    return new this._viewContextClass(this, {}, null);
  }

  private _viewContextClass: typeof Base | null = null;

  private resolverNames(): string[] {
    return this._viewPaths.toArray().map((r) => r.constructor.name);
  }

  /** @internal Collect all template paths from resolvers that expose them. */
  private allCandidatePaths(): string[] {
    const seen = new Set<string>();
    for (const resolver of this._viewPaths) {
      try {
        const paths = resolver.allTemplatePaths?.();
        if (paths) {
          for (const p of paths) seen.add(p.virtual);
        }
      } catch {
        // best-effort — don't let enumeration errors mask the MissingTemplate
      }
    }
    return Array.from(seen);
  }
}

(LookupContext as { DetailsKey: typeof DetailsKey }).DetailsKey = DetailsKey;
