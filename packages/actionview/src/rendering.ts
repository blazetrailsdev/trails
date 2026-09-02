/**
 * Module-as-host interfaces mixed into ActionController::Base. Defined as
 * TS interfaces (not classes) so AC can declaration-merge them into its
 * own class without inheriting state. Real method bodies land in Phase 4.
 *
 * @internal stub - real impl in Phase 4
 */

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

/** @internal stub - real impl in Phase 4 */
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

/** @internal stub - real impl in Phase 4 */
export interface LayoutsClass {
  layout(
    name: string | symbol | false | null | ((...args: unknown[]) => unknown),
    conditions?: { only?: string | string[]; except?: string | string[] },
  ): void;
}

/**
 * The class-side of `ActionView::Rendering::ClassMethods`
 * (`actionview/lib/action_view/rendering.rb:45-93`), mixed onto a controller
 * class by the module-mixin convention (`this`-typed functions assigned to the
 * class). `_routes` / `_helpers` / `supportsPathQ` are the reader hooks Rails
 * declares alongside (`rendering.rb:46-51`).
 *
 * @internal
 */
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
  /** @internal Rails: `@view_context_class`. */
  _viewContextClass?: typeof Base;
}

/** The `routes.url_helpers(supports_path)` / `routes.mounted_helpers` pair. */
export interface ViewContextRoutes {
  urlHelpers(supportsPath?: boolean): object;
  mountedHelpers(): object;
}

/** @internal The superclass of a class, as Ruby's `superclass`. */
function superclassOf(klass: ViewContextClassMethods): ViewContextClassMethods | null {
  const parent = Object.getPrototypeOf(klass) as ViewContextClassMethods | null;
  return typeof parent === "function" ? parent : null;
}

/** Mirrors `inherit_view_context_class?` (`rendering.rb:52-57`). */
export function inheritViewContextClassQ(this: ViewContextClassMethods): boolean {
  const superclass = superclassOf(this);
  return (
    typeof superclass?.viewContextClass === "function" &&
    this.supportsPathQ() === superclass.supportsPathQ() &&
    this._routes === superclass._routes &&
    this._helpers === superclass._helpers
  );
}

/**
 * Mirrors `build_view_context_class(klass, supports_path, routes, helpers)` (`rendering.rb:59-73`).
 *
 * @missingRailsArgs include — PERMANENT
 */
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

/** Mirrors `view_context_class` (`rendering.rb:82-92`). */
export function viewContextClass(this: ViewContextClassMethods): typeof Base {
  const klass = DetailsKey.viewContextClass();

  // Ruby's `@view_context_class ||=` reads the ivar on THIS class only; a
  // plain field read would walk the constructor chain to a superclass's memo.
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

/** @internal The instance half of `ActionView::Rendering` (`rendering.rb:95-111`). */
export interface ViewContextHost {
  constructor: ViewContextClassMethods;
  lookupContext: LookupContext;
  viewAssigns(): Record<string, unknown>;
}

/** Mirrors `Rendering#view_context` (`rendering.rb:108-110`). */
export function viewContext(this: ViewContextHost): Base {
  return new (this.constructor.viewContextClass())(
    this.lookupContext,
    this.viewAssigns(),
    this as unknown as null,
  );
}
