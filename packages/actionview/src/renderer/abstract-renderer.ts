import type { LookupContext } from "../lookup-context.js";
import type { Template } from "../template.js";

export type { Template };

/**
 * Minimal "renderable" interface shared by `Template` and its subtypes
 * (Text, HTML, Inline, Renderable, RawFile). Mirrors the duck type that
 * Rails relies on in `TemplateRenderer` / `PartialRenderer`.
 */
export interface RenderableTemplate {
  readonly identifier: string;
  readonly format: string | null;
  /** Partial local-variable name derived from the virtual path. */
  readonly variable?: string | null;
  /** Virtual path relative to the view root (e.g. `"users/_card"`). */
  readonly virtualPath?: string | null;
  /** Render the template body, returning the HTML/text output. */
  render(locals: Record<string, unknown>, context?: ViewContext): Promise<string>;
}

/**
 * The view context passed to every render call — the ActionView::Base-like
 * object that templates execute against. Phase 4 will flesh this out with
 * `output_buffer`, `view_flow`, `_layout_for`, etc.
 */
export interface ViewContext {
  readonly lookupContext?: LookupContext;
  /** Render the named `content_for` region or the default yield. */
  _layoutFor?(name?: string): string;
  /** View flow for layout yield tracking. Phase 4. */
  viewFlow?: { set(key: string, content: string): void };
  /** Whether to prefix object partial paths with the controller namespace. */
  prefixPartialPathWithControllerNamespace?: boolean;
  /** The active renderer (for cache_hits tracking). */
  viewRenderer?: { cacheHits: Record<string, number> };
}

/**
 * Raw render options hash — mirrors the kwargs accepted by Rails'
 * `ActionView::Renderer#render` / `ActionController::Base#render`.
 */
export interface RenderOptions {
  template?: string;
  partial?: string | object;
  inline?: string;
  body?: string;
  plain?: string;
  html?: string;
  file?: string;
  renderable?: { renderIn(context: ViewContext): string };
  layout?:
    | string
    | false
    | null
    | ((ctx: LookupContext, formats: readonly string[], keys: readonly string[]) => string);
  locals?: Record<string, unknown>;
  collection?: readonly unknown[];
  as?: string;
  spacerTemplate?: string;
  object?: unknown;
  prefixes?: string[];
  type?: string;
  formats?: string[];
  variants?: string[];
  cached?: boolean;
  [key: string]: unknown;
}

/**
 * Carries the rendered body together with the template that produced it.
 * Mirrors `ActionView::AbstractRenderer::RenderedTemplate`.
 */
export class RenderedTemplate {
  static readonly EMPTY_SPACER: RenderedTemplate = new RenderedTemplate("", null);

  constructor(
    readonly body: string,
    readonly template: RenderableTemplate | null,
  ) {}

  get format(): string | null {
    return this.template?.format ?? null;
  }
}

/**
 * Carries the rendered body of an entire collection.
 * Mirrors `ActionView::AbstractRenderer::RenderedCollection`.
 */
export class RenderedCollection {
  static empty(format: string): EmptyCollection {
    return new EmptyCollection(format);
  }

  constructor(
    readonly renderedTemplates: RenderedTemplate[],
    private readonly spacer: RenderedTemplate,
  ) {}

  get body(): string {
    return this.renderedTemplates.map((t) => t.body).join(this.spacer.body);
  }

  get format(): string | null {
    return this.renderedTemplates[0]!.format;
  }
}

/** Mirrors `ActionView::AbstractRenderer::RenderedCollection::EmptyCollection`. */
export class EmptyCollection {
  constructor(readonly format: string) {}
  get body(): null {
    return null;
  }
}

/**
 * ActionView::AbstractRenderer::ObjectRendering
 *
 * Mixin used by ObjectRenderer and CollectionRenderer — provides partial-path
 * inference from model objects and local-variable naming helpers.
 * @internal
 */
export interface ObjectRenderingHost extends AbstractRenderer {
  contextPrefix: string;
}

/** Cached map: `[contextPrefix][objectPath] → prefixed path`. @internal */
const PREFIXED_PARTIAL_NAMES = new Map<string, Map<string, string>>();

function getPrefixedName(contextPrefix: string, objectPath: string): string | undefined {
  return PREFIXED_PARTIAL_NAMES.get(contextPrefix)?.get(objectPath);
}

function setPrefixedName(contextPrefix: string, objectPath: string, value: string): void {
  let inner = PREFIXED_PARTIAL_NAMES.get(contextPrefix);
  if (!inner) {
    inner = new Map();
    PREFIXED_PARTIAL_NAMES.set(contextPrefix, inner);
  }
  inner.set(objectPath, value);
}

const IDENTIFIER_ERROR_MESSAGE =
  "The partial name (%s) is not a valid Ruby identifier; " +
  "make sure your partial name starts with underscore.";

const OPTION_AS_ERROR_MESSAGE =
  "The value (%s) of the option `as` is not a valid Ruby identifier; " +
  "make sure it starts with lowercase letter, " +
  "and is followed by any combination of letters, numbers and underscores.";

/** @internal */
export function localVariable(path: string, options: Record<string, unknown>): string {
  const as = options["as"];
  if (as !== undefined) {
    if (!/^[a-z_]\w*$/.test(String(as))) raiseInvalidOptionAs(as);
    return String(as);
  }
  const base = path.endsWith("/") ? "" : path.split("/").pop()!;
  const match = /^_?(.*?)(?:\.\w+)*$/.exec(base);
  if (!match) raiseInvalidIdentifier(path);
  return match![1];
}

/** @internal */
export function raiseInvalidIdentifier(path: string): never {
  throw new Error(IDENTIFIER_ERROR_MESSAGE.replace("%s", path));
}

/** @internal */
export function raiseInvalidOptionAs(as: unknown): never {
  throw new Error(OPTION_AS_ERROR_MESSAGE.replace("%s", String(as)));
}

/** @internal */
export function partialPath(object: unknown, view: ViewContext, contextPrefix: string): string {
  const model =
    object !== null &&
    object !== undefined &&
    typeof (object as { toModel?: () => unknown }).toModel === "function"
      ? (object as { toModel(): unknown }).toModel()
      : object;

  let path: string;
  if (
    model !== null &&
    model !== undefined &&
    typeof (model as { toPartialPath?: () => string }).toPartialPath === "function"
  ) {
    path = (model as { toPartialPath(): string }).toPartialPath();
  } else {
    throw new Error(
      `'${String(model)}' is not an ActiveModel-compatible object. It must implement #toPartialPath.`,
    );
  }

  if (view.prefixPartialPathWithControllerNamespace && contextPrefix) {
    const cached = getPrefixedName(contextPrefix, path);
    if (cached !== undefined) return cached;
    const merged = mergePrefixIntoObjectPath(contextPrefix, path);
    setPrefixedName(contextPrefix, path, merged);
    return merged;
  }
  return path;
}

/** @internal */
export function mergePrefixIntoObjectPath(prefix: string, objectPath: string): string {
  if (prefix.includes("/") && objectPath.includes("/")) {
    const prefixes: string[] = [];
    const prefixArray = prefix.split("/").slice(0, -1);
    const objectPathArray = objectPath.split("/").slice(0, -2);

    for (let i = 0; i < prefixArray.length; i++) {
      if (prefixArray[i] === objectPathArray[i]) break;
      prefixes.push(prefixArray[i]);
    }

    return [...prefixes, objectPath].join("/");
  }
  return objectPath;
}

/**
 * ActionView::AbstractRenderer
 *
 * Base class for all renderer objects. Each concrete subclass handles one
 * rendering mode (template, partial, collection, streaming). A new instance
 * is created per `render` call — no per-instance state is reused across
 * invocations.
 * @internal
 */
export abstract class AbstractRenderer {
  /** @internal */
  protected readonly lookupContext: LookupContext;

  constructor(lookupContext: LookupContext) {
    this.lookupContext = lookupContext;
  }

  abstract render(
    ...args: unknown[]
  ): Promise<RenderedTemplate> | RenderedTemplate | RenderedCollection;

  // --- delegates to lookupContext (mirrors AbstractRenderer's `delegate`) ---

  /** Mirrors Rails `template_exists?`. */
  templateExists(
    name: string,
    prefixes: readonly string[] = [],
    partial = false,
    keys: readonly string[] = [],
    options: Record<string, readonly (string | symbol)[]> = {},
  ): boolean {
    return this.lookupContext.isExists(name, prefixes, partial, keys, options);
  }

  /** Mirrors Rails `any_templates?`. */
  anyTemplates(name: string, prefixes: readonly string[] = [], partial = false): boolean {
    return this.lookupContext.isAny(name, prefixes, partial);
  }

  get formats(): readonly (string | symbol)[] {
    return this.lookupContext.formats;
  }

  // --- private helpers (exposed as protected for subclasses) ---

  /** @internal */
  protected extractDetails(
    options: Record<string, unknown>,
  ): Record<string, readonly (string | symbol)[]> {
    const details: Record<string, readonly (string | symbol)[]> = {};
    for (const key of this.lookupContext.constructor
      ? ((this.lookupContext.constructor as unknown as { registeredDetails?: readonly string[] })
          .registeredDetails ?? [])
      : []) {
      const value = options[key];
      if (value) details[key] = Array.isArray(value) ? value : [value as string | symbol];
    }
    return details;
  }

  /** @internal */
  protected prependFormats(formats: string | string[] | null | undefined): void {
    const arr = formats ? (Array.isArray(formats) ? formats : [formats]) : [];
    if (arr.length === 0 || this.lookupContext.htmlFallbackForJs) return;
    const existing = this.lookupContext.formats as readonly string[];
    this.lookupContext.formats = [...new Set([...arr, ...existing])];
  }

  /** @internal */
  protected buildRenderedTemplate(
    content: string,
    template: RenderableTemplate | null,
  ): RenderedTemplate {
    return new RenderedTemplate(content, template);
  }

  /** @internal */
  protected buildRenderedCollection(
    templates: RenderedTemplate[],
    spacer: RenderedTemplate,
  ): RenderedCollection {
    return new RenderedCollection(templates, spacer);
  }
}
