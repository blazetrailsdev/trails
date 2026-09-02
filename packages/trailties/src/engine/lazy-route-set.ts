// Port of `Rails::Engine::LazyRouteSet` from
// `railties/lib/rails/engine/lazy_route_set.rb`. Subclasses `RouteSet` and
// calls `Trails.application?.reloadRoutesUnlessLoaded` before each routing
// operation so the route table is materialised on first use.
//
// `Trails` is read through {@link _Trails}, the zero-import slot, because a
// direct import of `rails.js` closes a module cycle through `Application`; see
// `trails-slot.ts`.
//
// `RoutesReloader#executeUnlessLoaded` loads `config/routes.ts` through a
// dynamic `import()`, so `Application#reloadRoutesUnlessLoaded` is a promise
// where Ruby's is a plain value. `call` — the Rack entry point, and the one
// that has to see a drawn route table — is async and awaits it; the
// synchronous routing ops below make the same call and cannot await the
// result. Closing that residual gap is
// `converge-lazy-route-set-sync-ops-to-await-the-reload`.
import { RouteSet, type DrawCallback } from "@blazetrails/actionpack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { _Trails } from "../trails-slot.js";

/** Rails: `Rails.application&.reload_routes_unless_loaded` (`lazy_route_set.rb:12`). */
function reloadRoutesUnlessLoaded(): Promise<boolean> | undefined {
  return _Trails!.application?.reloadRoutesUnlessLoaded();
}

type AnyFn = (...args: unknown[]) => unknown;
type ProxyHelpers = Record<
  "urlFor" | "fullUrlFor" | "routeFor" | "polymorphicUrl" | "polymorphicPath",
  AnyFn
>;

export class LazyRouteSet extends RouteSet {
  override draw(callback: DrawCallback): void {
    void reloadRoutesUnlessLoaded();
    super.draw(callback);
  }

  override generateExtras(
    options: Record<string, unknown>,
    recall: Record<string, unknown> = {},
  ): [string, string[]] {
    void reloadRoutesUnlessLoaded();
    return super.generateExtras(options, recall);
  }

  override recognizePath(
    path: string,
    environment: { method?: string | null; extras?: Record<string, unknown> } = {},
  ): Record<string, unknown> {
    void reloadRoutesUnlessLoaded();
    return super.recognizePath(path, environment);
  }

  override recognizePathWithRequest(
    req: { requestMethod?: string; method?: string },
    path: string,
    extras: Record<string, unknown> = {},
    options: { raiseOnMissing?: boolean } = {},
  ): Record<string, unknown> | undefined {
    void reloadRoutesUnlessLoaded();
    return super.recognizePathWithRequest(req, path, extras, options);
  }

  /** Rails: `def call(req)` (`lazy_route_set.rb:66-69`). */
  override async call(req: RackEnv): Promise<RackResponse> {
    await reloadRoutesUnlessLoaded();
    return super.call(req);
  }

  /**
   * Rails: `generate_url_helpers(supports_path).tap { |m| m.singleton_class.prepend(ProxyUrlHelpers) }`.
   * Trails wraps each helper directly on the returned module — there is no
   * `singleton_class.prepend` analogue in JS.
   */
  override generateUrlHelpers(supportsPath: boolean): ReturnType<RouteSet["generateUrlHelpers"]> {
    const mod = super.generateUrlHelpers(supportsPath);
    const helpers = mod as unknown as ProxyHelpers;
    const wrap = (name: keyof ProxyHelpers): void => {
      const original = helpers[name].bind(helpers);
      helpers[name] = (...args: unknown[]): unknown => {
        void reloadRoutesUnlessLoaded();
        return original(...args);
      };
    };
    wrap("urlFor");
    wrap("fullUrlFor");
    wrap("routeFor");
    wrap("polymorphicUrl");
    wrap("polymorphicPath");
    return mod;
  }
}
