import { RuntimeError, constSet, rbCallSuper } from "@blazetrails/ruby-compat";
import { Concern, extend, include } from "@blazetrails/activesupport";
import { UrlFor as RoutingUrlFor } from "../action-dispatch/routing/url-for.js";
import { AbstractController } from "../namespaces.js";

export interface NamedRoutesLike {
  helperNames(): readonly string[];
}

export interface RouteSetLike {
  namedRoutes: NamedRoutesLike;
  defaultEnv?(): Record<string, unknown>;
}

interface UrlForClass {
  readonly _routes: RouteSetLike | null;
  _actionMethodCache?: ReadonlySet<string>;
}

export const ClassMethods = {
  get _routes(): RouteSetLike | null {
    return null;
  },

  actionMethods(this: UrlForClass): ReadonlySet<string> {
    if (!Object.hasOwn(this, "_actionMethodCache") || !this._actionMethodCache) {
      const routes = this._routes;
      if (routes) {
        const helperNames = new Set(routes.namedRoutes.helperNames());
        this._actionMethodCache = new Set(
          [...(rbCallSuper(this, ClassMethods.actionMethods) as ReadonlySet<string>)].filter(
            (name) => !helperNames.has(name),
          ),
        );
      } else {
        this._actionMethodCache = rbCallSuper(
          this,
          ClassMethods.actionMethods,
        ) as ReadonlySet<string>;
      }
    }
    return this._actionMethodCache;
  },
};

export const UrlFor = {
  ClassMethods,

  get _routes(): never {
    throw new RuntimeError(
      "In order to use #url_for, you must include routing helpers explicitly. " +
        "For instance, `include Trails.application.routes.url_helpers`.",
    );
  },
};
extend(UrlFor, Concern);
include(UrlFor, RoutingUrlFor);
constSet(AbstractController, "UrlFor", UrlFor);
