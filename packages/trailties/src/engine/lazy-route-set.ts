// Port of `Rails::Engine::LazyRouteSet` from
// `railties/lib/rails/engine/lazy_route_set.rb`. Subclasses `RouteSet` and
// calls `Trails.application?.reloadRoutesUnlessLoaded` before each routing
// operation so the route table is materialised on first use.
//
// `Trails.application` lands in PR 2.6; until then the reload hook is
// injected via {@link setReloadRoutesHook}. PR 2.6 wires the global
// `Trails.application?.reloadRoutesUnlessLoaded` callback through this seam.
//
// Skipped vs. Rails:
//   - `NamedRouteCollection` inner class — trails RouteSet keeps named routes
//     in a plain Map; there is no Rails-shape `NamedRouteCollection#route_defined?`
//     hook to override. Re-add when ported.
//   - `method_missing_module` / `ProxyUrlHelpers#optimize_routes_generation?` —
//     JS has no `method_missing`; the proxy wraps explicit helper methods
//     instead (see {@link generateUrlHelpers}).
//   - `def routes; ...; super; end` — trails' `RouteSet#routes` is a private
//     field (no `attr_reader :routes`), so there is no parent method to wrap.
//     If `routes` is later exposed as a Rails-shape getter, mirror the
//     `reloadHook(); super` pattern then.
import { RouteSet, type DrawCallback } from "@blazetrails/actionpack";

type ReloadHook = () => boolean | undefined;
let reloadHook: ReloadHook = () => undefined;

/**
 * @internal Trails-private. Inject the
 * `Trails.application?.reloadRoutesUnlessLoaded` callback. PR 2.6's
 * `Trails.application` setter calls this; tests use it to assert each
 * routing op consults the hook exactly once. Not part of Rails.
 */
export function setReloadRoutesHook(fn: ReloadHook): void {
  reloadHook = fn;
}

/** @internal Reset to the default no-op. Used by tests. */
export function resetReloadRoutesHook(): void {
  reloadHook = () => undefined;
}

type AnyFn = (...args: unknown[]) => unknown;
type ProxyHelpers = Record<
  "urlFor" | "fullUrlFor" | "routeFor" | "polymorphicUrl" | "polymorphicPath",
  AnyFn
>;

export class LazyRouteSet extends RouteSet {
  override draw(callback: DrawCallback): void {
    reloadHook();
    super.draw(callback);
  }

  override generateExtras(
    options: Record<string, unknown>,
    defaults: Record<string, unknown> = {},
  ): [string, string[]] {
    reloadHook();
    return super.generateExtras(options, defaults);
  }

  override recognizePath(
    path: string,
    options: { method?: string | null; extras?: Record<string, unknown> } = {},
  ): Record<string, unknown> {
    reloadHook();
    return super.recognizePath(path, options);
  }

  override recognizePathWithRequest(
    req: { requestMethod?: string; method?: string },
    path: string,
    extras: Record<string, unknown> = {},
    options: { raiseOnMissing?: boolean } = {},
  ): Record<string, unknown> | undefined {
    reloadHook();
    return super.recognizePathWithRequest(req, path, extras, options);
  }

  /** Rails: `def call(req)` — the Rack entrypoint, named `serve` in trails. */
  override serve(req: Parameters<RouteSet["serve"]>[0]): ReturnType<RouteSet["serve"]> {
    reloadHook();
    return super.serve(req);
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
        reloadHook();
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
