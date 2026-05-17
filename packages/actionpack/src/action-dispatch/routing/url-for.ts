/**
 * ActionDispatch::Routing::UrlFor
 *
 * Mirrors `action_dispatch/routing/url_for.rb`. Provides the `urlFor` /
 * `fullUrlFor` / `routeFor` instance methods that hosts (controllers,
 * mailers, `Rails.application.routes.urlHelpers`) mix in via the
 * `this`-typed function pattern.
 *
 * @see https://api.rubyonrails.org/classes/ActionDispatch/Routing/UrlFor.html
 */

/**
 * The minimal RouteSet surface UrlFor calls into. Matches Rails'
 * `_routes.url_for(options, route_name)` shape so future work can wire
 * `RouteSet` to it without changing this module.
 */
export interface UrlForRoutes {
  urlFor(options: Record<string, unknown>, routeName?: string | null): string;
  optimizeRoutesGeneration?(): boolean;
}

export interface UrlForHost {
  /** @internal Rails: `@_routes` */
  _routes: UrlForRoutes | null;
  defaultUrlOptions: Record<string, unknown>;
  urlOptions(): Record<string, unknown>;
}

/**
 * Hook overridden in controllers to add request information. Application
 * logic should not go into urlOptions.
 */
export function urlOptions(this: UrlForHost): Record<string, unknown> {
  return this.defaultUrlOptions;
}

/**
 * Generate a URL based on the options provided, `defaultUrlOptions`, and
 * the routes defined in `config/routes.rb`. Delegates to `fullUrlFor`.
 */
export function urlFor(this: UrlForHost, options?: UrlForOptions): string {
  return fullUrlFor.call(this, options);
}

export type UrlForOptions =
  | null
  | undefined
  | string
  | symbol
  | unknown[]
  | Record<string, unknown>
  | (new (...args: never[]) => unknown);

/** @internal */
export function fullUrlFor(this: UrlForHost, options?: UrlForOptions): string {
  if (options == null) {
    return requireRoutes(this).urlFor(symbolizeKeys(this.urlOptions()));
  }
  if (typeof options === "string") {
    return options;
  }
  if (typeof options === "symbol") {
    return handleStringCall(this, options);
  }
  if (Array.isArray(options)) {
    const components = [...options];
    const opts = extractOptions(components);
    return polymorphicUrl(this, components, opts);
  }
  if (typeof options === "function") {
    return handleClassCall(this, options);
  }
  if (typeof options === "object") {
    const hash = { ...(options as Record<string, unknown>) };
    const routeName = (hash["use_route"] ?? null) as string | symbol | null;
    delete hash["use_route"];
    const merged = reverseMerge(symbolizeKeys(hash), this.urlOptions());
    return requireRoutes(this).urlFor(merged, routeName == null ? null : String(routeName));
  }
  return handleModelCall(this, options);
}

/**
 * Allows calling direct or regular named route.
 *
 *     threadablePath(threadable)  // => "/buckets/1"
 *     threadableUrl(threadable)   // => "http://example.com/buckets/1"
 */
export function routeFor(this: UrlForHost, name: string, ...args: unknown[]): string {
  const helper = `${name}Url`;
  const fn = (this as unknown as Record<string, unknown>)[helper];
  if (typeof fn !== "function") {
    throw new Error(`No url helper "${helper}" defined`);
  }
  return (fn as (...a: unknown[]) => string).apply(this, args);
}

/** @internal Rails: `protected def optimize_routes_generation?` */
export function optimizeRoutesGeneration(this: UrlForHost): boolean {
  const routes = requireRoutes(this);
  return (
    (routes.optimizeRoutesGeneration?.() ?? true) &&
    Object.keys(this.defaultUrlOptions).length === 0
  );
}

/** @internal Rails: `private def _with_routes(routes)` */
export function _withRoutes<T>(this: UrlForHost, routes: UrlForRoutes, block: () => T): T {
  const old = this._routes;
  this._routes = routes;
  try {
    return block();
  } finally {
    this._routes = old;
  }
}

/** @internal Rails: `private def _routes_context` */
export function _routesContext(this: UrlForHost): UrlForHost {
  return this;
}

/** @internal */
function requireRoutes(host: UrlForHost): UrlForRoutes {
  if (!host._routes) {
    throw new Error(
      "No routes available on host. Include Rails.application.routes.urlHelpers or assign _routes.",
    );
  }
  return host._routes;
}

/** @internal Rails: `Hash#symbolize_keys` — no-op in TS (keys are strings already). */
function symbolizeKeys(hash: Record<string, unknown>): Record<string, unknown> {
  return { ...hash };
}

/** @internal Rails: `Hash#reverse_merge!` — `defaults` fill in missing keys. */
function reverseMerge(
  hash: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  return { ...defaults, ...hash };
}

/** @internal Rails: `Array#extract_options!` — pops a trailing options hash. */
function extractOptions(arr: unknown[]): Record<string, unknown> {
  const last = arr[arr.length - 1];
  if (
    last != null &&
    typeof last === "object" &&
    !Array.isArray(last) &&
    last.constructor === Object
  ) {
    return arr.pop() as Record<string, unknown>;
  }
  return {};
}

/**
 * Stub — Rails delegates to `HelperMethodBuilder.url.handle_string_call`,
 * which resolves a symbol like `:user_url` against named-route helpers.
 * Not yet ported.
 * @internal
 */
function handleStringCall(_host: UrlForHost, name: symbol): string {
  throw new Error(
    `urlFor(symbol) not yet supported: ${String(name)}. Use the *Url helper directly.`,
  );
}

/**
 * Stub — Rails: `HelperMethodBuilder.url.handle_class_call`. Not yet ported.
 * @internal
 */
function handleClassCall(_host: UrlForHost, cls: new (...args: never[]) => unknown): string {
  throw new Error(`urlFor(class) not yet supported: ${cls.name || "<anon>"}`);
}

/**
 * Stub — Rails: `HelperMethodBuilder.url.handle_model_call`. Not yet ported.
 * @internal
 */
function handleModelCall(_host: UrlForHost, _model: unknown): string {
  throw new Error("urlFor(model) not yet supported — depends on PolymorphicRoutes.");
}

/**
 * Stub — Rails: `polymorphic_url(components, opts)`. PolymorphicRoutes
 * is not yet ported; falls through to model dispatch.
 * @internal
 */
function polymorphicUrl(
  host: UrlForHost,
  components: unknown[],
  _opts: Record<string, unknown>,
): string {
  if (components.length === 1) {
    return handleModelCall(host, components[0]);
  }
  throw new Error("urlFor(array) not yet supported — depends on PolymorphicRoutes.");
}
