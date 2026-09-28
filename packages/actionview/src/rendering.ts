/** @internal */

import type { SafeBuffer } from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat/include";
import { Base } from "./base.js";
import { DetailsKey, type LookupContext } from "./lookup-context.js";
import { Renderer } from "./renderer.js";
import { Template } from "./template.js";

export interface RenderOptions {
  template?: string;
  partial?: string;
  action?: string;
  layout?: string | false;
  formats?: string[];
  locals?: Record<string, unknown>;
  status?: number;
  body?: string;
  plain?: string;
  html?: string;
  json?: unknown;
  inline?: string;
  [k: string]: unknown;
}

/** @internal */
export interface ViewContextClassMethods {
  _routes?: ViewContextRoutes | null;
  _helpers?: object | null;
  supportsPath(): boolean;
  viewContextClass(): typeof Base;
  buildViewContextClass(
    klass: typeof Base,
    supportsPath: boolean,
    routes: ViewContextRoutes | null | undefined,
    helpers: object | null | undefined,
  ): typeof Base;
  isInheritViewContextClass(): boolean;
  /** @internal */
  _viewContextClass?: typeof Base;
}

export interface ViewContextRoutes {
  urlHelpers(supportsPath?: boolean): object;
  mountedHelpers(): object;
}

/** @internal */
function superclassOf(klass: ViewContextClassMethods): ViewContextClassMethods | null {
  const parent = Object.getPrototypeOf(klass) as ViewContextClassMethods | null;
  return typeof parent === "function" ? parent : null;
}

export function isInheritViewContextClass(this: ViewContextClassMethods): boolean {
  const superclass = superclassOf(this);
  return (
    typeof superclass?.viewContextClass === "function" &&
    this.supportsPath() === superclass.supportsPath() &&
    this._routes === superclass._routes &&
    this._helpers === superclass._helpers
  );
}

/** @missingRailsArgs include — PERMANENT */
export function buildViewContextClass(
  this: ViewContextClassMethods,
  klass: typeof Base,
  supportsPath: boolean,
  routes: ViewContextRoutes | null | undefined,
  helpers: object | null | undefined,
): typeof Base {
  if (this.isInheritViewContextClass()) {
    return superclassOf(this)!.viewContextClass();
  }

  const subclass = class extends klass {};
  if (routes) {
    include(subclass, routes.urlHelpers(supportsPath));
    include(subclass, routes.mountedHelpers());
  }

  if (helpers) {
    include(subclass, helpers);
  }
  return subclass;
}

export function viewContextClass(this: ViewContextClassMethods): typeof Base {
  const klass = DetailsKey.viewContextClass();

  if (this._viewContextClass === undefined || !Object.hasOwn(this, "_viewContextClass")) {
    this._viewContextClass = this.buildViewContextClass(
      klass,
      this.supportsPath(),
      this._routes,
      this._helpers,
    );
  }

  if (klass.isChanged(this._viewContextClass)) {
    this._viewContextClass = this.buildViewContextClass(
      klass,
      this.supportsPath(),
      this._routes,
      this._helpers,
    );
  }

  return this._viewContextClass;
}

/** @internal */
export interface ViewContextHost {
  constructor: ViewContextClassMethods;
  lookupContext: LookupContext;
  viewAssigns(): Record<string, unknown>;
}

export function viewContext(this: ViewContextHost): Base {
  return new (this.constructor.viewContextClass())(
    this.lookupContext,
    this.viewAssigns(),
    this as unknown as null,
  );
}

/** @internal */
export interface ViewRendererHost {
  lookupContext: LookupContext;
  /** @internal */
  _viewRenderer?: Renderer;
}

export function viewRenderer(this: ViewRendererHost): Renderer {
  return (this._viewRenderer ??= new Renderer(this.lookupContext));
}

/** @internal */
export interface RenderToBodyHost {
  lookupContext: LookupContext;
  viewContext(): Base;
  /** @internal */
  _renderedFormat?: unknown;
  /** @internal */
  _processOptions(options: Record<string, unknown>): void;
  /** @internal */
  _processRenderTemplateOptions(options: Record<string, unknown>): void;
  /** @internal */
  _renderTemplate(options: Record<string, unknown>): Promise<string | SafeBuffer | null>;
}

export async function renderToBody(
  this: RenderToBodyHost,
  options: Record<string, unknown> = {},
): Promise<string | SafeBuffer | null> {
  this._processOptions(options);
  this._processRenderTemplateOptions(options);
  return this._renderTemplate(options);
}

/** @internal */
export async function _renderTemplate(
  this: RenderToBodyHost,
  options: Record<string, unknown>,
): Promise<string | SafeBuffer | null> {
  const variant = options["variant"];
  delete options["variant"];
  const assigns = options["assigns"];
  delete options["assigns"];
  const context = this.viewContext();

  if (assigns != null && assigns !== false) context.assign(assigns as Record<string, unknown>);
  if (variant != null && variant !== false) this.lookupContext.variants = variant as string[];

  const renderedTemplate = await context.inRenderingContext(options, (renderer) =>
    renderer.renderToObject(context, options),
  );

  const renderedFormat = renderedTemplate.format ?? this.lookupContext.formats[0];
  this._renderedFormat = Template.Types.get(renderedFormat as string);

  return renderedTemplate.body;
}

/** @internal */
export function _processFormat(
  this: { lookupContext: LookupContext },
  format: { toSym?(): string | null; toString(): string },
): void {
  if (format.toSym?.() != null) this.lookupContext.formats = [format.toSym() as string];
}

/** @internal */
export function _processRenderTemplateOptions(
  this: { actionName: string; _prefixes(): string[] },
  options: Record<string, unknown>,
): void {
  if (options["partial"] === true) {
    options["partial"] = this.actionName;
  }

  if (!["partial", "file", "template"].some((k) => k in options)) {
    options["prefixes"] ??= this._prefixes();
  }

  options["template"] ??= String(options["action"] ?? this.actionName);
}
