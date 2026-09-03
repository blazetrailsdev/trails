import type { LookupContext } from "../lookup-context.js";
import type { Template } from "../template.js";

export type { Template };

export interface RenderableTemplate {
  readonly identifier: string;
  readonly format: string | null;
  readonly variable?: string | null;
  readonly virtualPath?: string | null;
  render(view: ViewContext, locals: Record<string, unknown>): string | Promise<string>;
}

export interface ViewContext {
  readonly lookupContext?: LookupContext;
  _layoutFor?(name?: string): string;
  viewFlow?: { set(key: string, content: string): void };
  prefixPartialPathWithControllerNamespace?: boolean;
  viewRenderer?: { cacheHits: Record<string, number> };
}

export interface RenderOptions {
  template?: string;
  partial?: string | object;
  inline?: string;
  body?: string;
  plain?: string;
  html?: unknown;
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
  stream?: boolean;
  [key: string]: unknown;
}

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
    return this.renderedTemplates[0].format;
  }
}

export class EmptyCollection {
  constructor(readonly format: string) {}
  get body(): null {
    return null;
  }
}

/** @internal */
export interface ObjectRenderingHost {
  contextPrefix: string;
  readonly options: RenderOptions;
}

/** @internal */
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
export function localVariable(this: ObjectRenderingHost, path: string): string {
  const as = this.options["as"];
  if (as !== undefined) {
    if (!/^[a-z_]\w*$/.test(String(as))) raiseInvalidOptionAs(as);
    return String(as);
  }
  const base = path.endsWith("/") ? "" : path.split("/").pop()!;
  const match = /^_?(.*?)(?:\.\w+)*$/.exec(base);
  if (!match) raiseInvalidIdentifier(path);
  return match[1];
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
export function partialPath(this: ObjectRenderingHost, object: unknown, view: ViewContext): string {
  const contextPrefix = this.contextPrefix;
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

/** @internal */
export abstract class AbstractRenderer {
  /** @internal */
  protected readonly lookupContext: LookupContext;

  constructor(lookupContext: LookupContext) {
    this.lookupContext = lookupContext;
  }

  abstract render(
    ...args: unknown[]
  ): Promise<RenderedTemplate> | RenderedTemplate | RenderedCollection;

  templateExists(
    name: string,
    prefixes: readonly string[] = [],
    partial = false,
    keys: readonly string[] = [],
    options: Record<string, readonly (string | symbol)[]> = {},
  ): boolean {
    return this.lookupContext.isExists(name, prefixes, partial, keys, options);
  }

  anyTemplates(name: string, prefixes: readonly string[] = [], partial = false): boolean {
    return this.lookupContext.isAny(name, prefixes, partial);
  }

  get formats(): readonly (string | symbol)[] {
    return this.lookupContext.formats;
  }

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
