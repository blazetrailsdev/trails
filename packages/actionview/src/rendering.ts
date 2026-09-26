/** @internal */

import { include } from "@blazetrails/ruby-compat/include";
import { Base } from "./base.js";
import { DetailsKey, type LookupContext } from "./lookup-context.js";

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
export interface RenderTemplateOptionsHost {
  actionName: string;
  _prefixes(): string[];
}

/** @internal */
export function _processRenderTemplateOptions(
  this: RenderTemplateOptionsHost,
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
