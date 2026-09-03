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
export interface Rendering {
  lookupContext: LookupContext;
  render(options: RenderOptions | string, extra?: RenderOptions): string;
  renderToString(options: RenderOptions | string, extra?: RenderOptions): string;
  renderToBody(options?: RenderOptions): string;
  /** @internal */
  _normalizeArgs(action: unknown, options?: RenderOptions): RenderOptions;
  _normalizeOptions(options: RenderOptions): RenderOptions;
  _normalizeRender(options: RenderOptions): RenderOptions;
}

/**
 * Stub for `ActionView::Layouts` (`action_view/layouts.rb:205`) — real impl
 * in Phase 4, as the sibling stubs above say.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE (story:
 * port-action-view-layouts-behind-rendering-stubs). Deleted once the module
 * is ported to `actionview/src/layouts.ts`.
 */
export interface Layouts {
  _layoutForRendering(formats: string[]): string | false | undefined;
  _layoutFor(name?: string | symbol): string;
}

/** @internal */
export interface LayoutsClass {
  layout(
    name: string | symbol | false | null | ((...args: unknown[]) => unknown),
    conditions?: { only?: string | string[]; except?: string | string[] },
  ): void;
}

/** @internal */
export interface ViewContextClassMethods {
  _routes?: ViewContextRoutes | null;
  _helpers?: object | null;
  supportsPathQ(): boolean;
  viewContextClass(): typeof Base;
  buildViewContextClass(
    klass: typeof Base,
    supportsPath: boolean,
    routes: ViewContextRoutes | null | undefined,
    helpers: object | null | undefined,
  ): typeof Base;
  inheritViewContextClassQ(): boolean;
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

export function inheritViewContextClassQ(this: ViewContextClassMethods): boolean {
  const superclass = superclassOf(this);
  return (
    typeof superclass?.viewContextClass === "function" &&
    this.supportsPathQ() === superclass.supportsPathQ() &&
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
  if (this.inheritViewContextClassQ()) {
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
      this.supportsPathQ(),
      this._routes,
      this._helpers,
    );
  }

  if (klass.changedQ(this._viewContextClass)) {
    this._viewContextClass = this.buildViewContextClass(
      klass,
      this.supportsPathQ(),
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
