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
import { TemplateHandlerRegistry } from "./template/handlers.js";
import type { TemplateResolver } from "./template-resolver.js";
import type { Template } from "./template.js";
import { PathRegistry } from "./path-registry.js";
import { Requested } from "./template-details.js";

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
registerDetail("formats", () => ["html", "text", "js", "css", "xml", "json"]);
registerDetail("variants", () => []);
registerDetail("handlers", () => TemplateHandlerRegistry.extensions as DetailValue);

/** Whitelist of format symbols recognized by `formats=`. */
const VALID_FORMAT_SYMBOLS: ReadonlySet<string> = new Set([
  "html",
  "text",
  "js",
  "css",
  "xml",
  "json",
  "rss",
  "atom",
  "yaml",
  "multipart_form",
  "url_encoded_form",
  "ics",
  "csv",
  "vcf",
  "tsx",
]);

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

  constructor(
    public readonly controller: string,
    public readonly action: string,
    public readonly format: string,
    public readonly searchedPaths: string[],
  ) {
    super(
      `Missing template ${controller}/${action} with format "${format}". ` +
        `Searched in: ${searchedPaths.length > 0 ? searchedPaths.join(", ") : "(no resolvers)"}`,
    );
    this.name = "MissingTemplate";
    this.path = `${controller}/${action}`;
    this.paths = searchedPaths;
    this.prefixes = controller ? [controller] : [];
    this.partial = action.startsWith("_");
    this.templateKeys = [format];
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
    const key = DetailsKey._stableKey(details);
    let req = DetailsKey._detailsKeys.get(key);
    if (req) return req;
    let formats = details.formats;
    if (formats && !formats.every((f) => typeof f === "string" && VALID_FORMAT_SYMBOLS.has(f))) {
      formats = formats.filter(
        (f) => typeof f === "string" && VALID_FORMAT_SYMBOLS.has(f),
      ) as DetailValue;
    }
    req = new Requested({
      locale: details.locale ?? [],
      handlers: details.handlers ?? [],
      formats: formats ?? [],
      variants: details.variants ?? [],
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

  /** Clear every resolver cache, plus the details and digest caches. */
  static clear(): void {
    for (const resolver of PathRegistry.allResolvers()) {
      const r = resolver as TemplateResolver & { clearCache?: () => void };
      r.clearCache?.();
    }
    DetailsKey._detailsKeys.clear();
    DetailsKey._digestCache.clear();
  }

  /** @internal Stable JSON-ish key for a details tuple. */
  private static _stableKey(details: DetailsMap): string {
    return REGISTERED_DETAILS.map(
      (k) => `${k}:${(details[k] ?? []).map((v) => String(v)).join(",")}`,
    ).join("|");
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
  private resolvers: TemplateResolver[] = [];
  private layoutName: string | false | null = "application";

  // --- Rails-faithful state ---
  private _details: DetailsMap;
  private _prefixes: string[];
  private _detailsKey: Requested | null = null;
  private _detailsCache = true;
  private _htmlFallbackForJs = false;

  constructor(details: DetailsMap = {}, prefixes: string[] = []) {
    this._prefixes = prefixes;
    this._details = {};
    for (const k of REGISTERED_DETAILS) {
      this._details[k] = details[k] ?? DEFAULT_PROCS[k]();
    }
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
    const wildIdx = arr.indexOf("*/*");
    if (wildIdx >= 0) {
      arr.splice(wildIdx, 1);
      arr = arr.concat(DEFAULT_PROCS.formats());
    }
    arr = Array.from(new Set(arr));
    const invalid = arr.filter((f) => typeof f !== "string" || !VALID_FORMAT_SYMBOLS.has(f));
    if (invalid.length > 0) {
      throw new Error(`Invalid formats: ${invalid.map((v) => String(v)).join(", ")}`);
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

  /** Add a resolver to the lookup chain. First added = highest priority. */
  addResolver(resolver: TemplateResolver): void {
    this.resolvers.push(resolver);
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
    const extensions = TemplateHandlerRegistry.extensions;
    if (extensions.length === 0) return null;

    for (const resolver of this.resolvers) {
      const template = resolver.find(name, prefix, format, extensions);
      if (template) return template;
    }
    return null;
  }

  /**
   * Find a partial template. Partials are prefixed with underscore.
   */
  findPartial(name: string, prefix: string, format: string): Template | null {
    return this.findTemplate(`_${name}`, prefix, format);
  }

  /**
   * Find a layout template.
   *
   * @internal
   */
  findLayout(name: string, format: string): Template | null {
    const extensions = TemplateHandlerRegistry.extensions;
    if (extensions.length === 0) return null;

    for (const resolver of this.resolvers) {
      if (resolver.findLayout) {
        const layout = resolver.findLayout(name, format, extensions);
        if (layout) return layout;
      }
      // Fallback: look in "layouts" prefix
      const template = resolver.find(name, "layouts", format, extensions);
      if (template) {
        return { ...template, isLayout: true };
      }
    }
    return null;
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
      throw new MissingTemplate(controller, action, format, this.resolverNames());
    }

    const context: RenderContext = {
      controller,
      action,
      format,
    };

    // Render the template
    let output = await this.renderTemplate(template, locals, context);

    // Apply layout
    const layoutName = options.layout !== undefined ? options.layout : this.layoutName;
    if (layoutName !== false && layoutName) {
      const layoutTemplate = this.findLayout(layoutName, format);
      if (layoutTemplate) {
        const layoutContext: RenderContext = {
          ...context,
          yield: output,
        };
        output = await this.renderTemplate(layoutTemplate, locals, layoutContext);
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
      throw new MissingTemplate(prefix, `_${name}`, format, this.resolverNames());
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
   * Render a Template with its handler.
   */
  async renderTemplate(
    template: Template,
    locals: Record<string, unknown>,
    context: RenderContext,
  ): Promise<string> {
    const handler = TemplateHandlerRegistry.handlerForExtension(template.extension);
    if (!handler) {
      throw new Error(
        `No template handler registered for ".${template.extension}". ` +
          `Register one with TemplateHandlerRegistry.register(handler).`,
      );
    }

    return handler.render(template.source, locals, {
      ...context,
      templatePath: template.fullPath ?? template.identifier,
    });
  }

  private resolverNames(): string[] {
    return this.resolvers.map((r) => r.constructor.name);
  }
}

(LookupContext as { DetailsKey: typeof DetailsKey }).DetailsKey = DetailsKey;
