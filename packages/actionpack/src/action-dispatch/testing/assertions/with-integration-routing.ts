import { include, rbObjMethod, rbObjSingletonClass, type Method } from "@blazetrails/ruby-compat";
import { RouteSet } from "../../routing/route-set.js";
import { ActionDispatch } from "../../../namespaces.js";
import type { IntegrationTest, Session } from "../integration.js";
import type { TestClass } from "./routing.js";

// eslint-disable-next-line @typescript-eslint/no-namespace -- Ruby `module WithIntegrationRouting` (`testing/assertions/routing.rb:18`) nests its own `ClassMethods`; a namespace keeps both at their Rails names beside RoutingAssertions' same-named members.
export namespace WithIntegrationRouting {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- `WithIntegrationRouting::ClassMethods` (`routing.rb:21`).
  export namespace ClassMethods {
    export function withRouting(
      this: TestClass<IntegrationTest>,
      block: (routes: RouteSet) => unknown,
    ): void {
      let oldRoutes: RouteSet | undefined;
      let oldRoutesCallMethod: Method | undefined;
      let oldIntegrationSession: Session | undefined;

      this.setup(function () {
        oldRoutes = (this.app as { routes: RouteSet }).routes;
        oldRoutesCallMethod = rbObjMethod(oldRoutes, "call");
        oldIntegrationSession = this.integrationSession;
        createRoutes.call(this, block);
      });

      this.teardown(function () {
        resetRoutes.call(this, oldRoutes!, oldRoutesCallMethod!, oldIntegrationSession!);
      });
    }
  }

  export function withRouting<T>(this: IntegrationTest, block: (routes: RouteSet) => T): T {
    const oldRoutes = (this.app as { routes: RouteSet }).routes;
    const oldRoutesCallMethod = rbObjMethod(oldRoutes, "call");
    const oldIntegrationSession = this.integrationSession;
    let result: T;
    try {
      result = createRoutes.call<IntegrationTest, [(r: RouteSet) => T], T>(this, block);
    } catch (e) {
      resetRoutes.call(this, oldRoutes, oldRoutesCallMethod, oldIntegrationSession);
      throw e;
    }
    if (typeof (result as { then?: unknown } | null)?.then === "function") {
      return Promise.resolve(result).finally(() =>
        resetRoutes.call(this, oldRoutes, oldRoutesCallMethod, oldIntegrationSession),
      ) as T;
    }
    resetRoutes.call(this, oldRoutes, oldRoutesCallMethod, oldIntegrationSession);
    return result;
  }

  /** @internal */
  export function createRoutes<T>(this: IntegrationTest, block: (routes: RouteSet) => T): T {
    const app = this.app as { routes: RouteSet };
    const routes = new RouteSet();

    this._originalRoutes ??= app.routes;
    const routesCallMethod = rbObjMethod(routes, "call");
    (rbObjSingletonClass(this._originalRoutes).prototype as { call: unknown }).call = (
      ...args: unknown[]
    ) => routesCallMethod.call(...args);

    const https = this.integrationSession.isHttps();
    const host = this.integrationSession.host;

    app.routes = routes;
    const klass = class extends ActionDispatch.Integration.Session {};
    include(klass, app.routes.urlHelpers());
    include(klass, app.routes.mountedHelpers());
    this._integrationSession = new klass(app);
    this._integrationSession.httpsBang(https);
    this._integrationSession.hostBang(host);
    this.routes = routes;

    return block(routes);
  }

  /** @internal */
  export function resetRoutes(
    this: IntegrationTest,
    oldRoutes: RouteSet,
    oldRoutesCallMethod: Method,
    oldIntegrationSession: Session,
  ): void {
    (this.app as { routes: RouteSet }).routes = oldRoutes;
    (rbObjSingletonClass(this._originalRoutes!).prototype as { call: unknown }).call = (
      ...args: unknown[]
    ) => oldRoutesCallMethod.call(...args);
    this._integrationSession = oldIntegrationSession;
    this.routes = oldRoutes;
  }
}
