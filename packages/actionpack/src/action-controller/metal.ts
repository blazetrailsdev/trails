/**
 * ActionController::Metal
 *
 * Minimal controller with Rack interface. Provides params, request,
 * response accessors and basic status/header management.
 */

import { AbstractController } from "../abstract-controller/base.js";
import { Request } from "../action-dispatch/http/request.js";
import { Response } from "../action-dispatch/http/response.js";
import type { Session } from "../action-dispatch/request/session.js";
import { Parameters } from "./metal/strong-parameters.js";
import type { RackResponse } from "@blazetrails/rack";
import { underscore } from "@blazetrails/activesupport";
import {
  MiddlewareStack as AbstractMiddlewareStack,
  type MiddlewareEntry,
  type RackApp,
  type RackAppObject,
} from "../action-dispatch/middleware/stack.js";
import type { RackEnv } from "@blazetrails/rack";
import { includeContent } from "./metal/head.js";
import { MimeType } from "../action-dispatch/http/mime-type.js";
import { Renderers } from "./metal/renderers.js";
import { resolveStatus } from "./metal/status-codes.js";
import {
  _normalizeOptions as _normalizeOptionsFn,
  _normalizeText as _normalizeTextFn,
  _processOptions as _processOptionsFn,
  _processVariant as _processVariantFn,
  _renderInPriorities as _renderInPrioritiesFn,
  _setHtmlContentType as _setHtmlContentTypeFn,
  _setRenderedContentType as _setRenderedContentTypeFn,
  _setVaryHeader as _setVaryHeaderFn,
} from "./metal/rendering.js";

export class MiddlewareStack extends AbstractMiddlewareStack {
  /**
   * Mirrors `ActionController::MiddlewareStack#build_middleware`
   * (`action_controller/metal.rb:44-52`) — an ActionController entry
   * carries the `:only`/`:except` predicate.
   *
   * @internal
   */
  buildMiddleware(
    klass: MiddlewareEntry["klass"],
    args: unknown[],
    block?: (app: RackApp) => RackApp,
  ): MiddlewareEntry {
    const middleware = Metal.buildMiddleware(klass, args);
    return { klass: middleware.klass, args: middleware.args, block, valid: middleware.valid };
  }

  /**
   * Mirrors `ActionController::MiddlewareStack#build`
   * (`action_controller/metal.rb:31-37`). The non-string arm of `action`
   * only exists so the override stays assignable to
   * `ActionDispatch::MiddlewareStack#build(app)` (`stack.rb:166`), which
   * Ruby does not have to reconcile.
   */
  build(action: string | RackApp | RackAppObject, app?: RackApp | RackAppObject): RackApp {
    if (typeof action !== "string") return super.build(action);
    let current: RackApp =
      typeof app === "function" ? app : (env: RackEnv) => (app as RackAppObject).call(env);
    const middlewares = this.middlewares;
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i];
      if (middleware.valid && !middleware.valid(action)) continue;
      const mw = new middleware.klass(current, ...middleware.args);
      current = (env: RackEnv) => mw.call(env);
    }
    return current;
  }
}

export class Middleware {
  readonly klass: MiddlewareEntry["klass"];
  readonly args: unknown[];

  constructor(klass: MiddlewareEntry["klass"], args: unknown[] = []) {
    this.klass = klass;
    this.args = args;
  }
}

const _middlewareStacks = new WeakMap<object, MiddlewareStack>();

export class Metal extends AbstractController {
  /**
   * Rails: `attr_internal :request` (`metal.rb:164`) and
   * `attr_internal_reader :response` (`metal.rb:170`) — the ivars are
   * `@_request` / `@_response`, which is why `PROTECTED_IVARS` names them and
   * `view_assigns` never carries the request or response into a view.
   */
  _request!: Request;
  _response!: Response;
  /** Rails: `@_params` — `Metal#params` reads `request.parameters` (`metal.rb:181-187`). */
  _params: Parameters = new Parameters({});

  get params(): Parameters {
    return this._params;
  }
  set params(value: Parameters) {
    this._params = value;
  }

  get request(): Request {
    return this._request;
  }
  set request(value: Request) {
    this._request = value;
  }

  /** Rails: `delegate :session, to: "@_request"` (`metal.rb:176`). */
  get session(): Session {
    return this.request.session;
  }

  get response(): Response {
    return this._response;
  }
  /** Mirrors `Metal#response=` (`metal.rb:268-273`). */
  set response(value: Response) {
    this.setResponseBang(value);

    // Rails: `@_response_body = true` — "Force `performed?` to return true".
    // trails' `_responseBody` is the body slot, not a flag, so the same forcing
    // is spelled through `markPerformed`.
    this.markPerformed();
  }

  static controllerPath(): string {
    return underscore(this.name.replace(/Controller$/, ""));
  }

  static controllerName(): string {
    const path = this.controllerPath();
    const lastSlash = path.lastIndexOf("/");
    return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  }

  static makeResponseBang(request: Request): Response {
    const res = new Response();
    res.request = request;
    return res;
  }

  static actionEncodingTemplate(_action: string): false {
    return false;
  }

  /**
   * `class_attribute :middleware_stack` (`metal.rb:288`) plus the
   * `inherited` hook's `subclass.middleware_stack = middleware_stack.dup`
   * (`metal.rb:148`). JS has no hook that fires when a subclass is defined,
   * so the dup happens on first read instead, which is the same value.
   */
  static middleware(): MiddlewareStack {
    let stack = _middlewareStacks.get(this);
    if (!stack) {
      const superclass = Object.getPrototypeOf(this) as typeof Metal | null;
      stack =
        superclass && typeof superclass.middleware === "function"
          ? superclass.middleware().dup()
          : new MiddlewareStack();
      _middlewareStacks.set(this, stack);
    }
    return stack;
  }

  static use(...args: unknown[]): void {
    this.middleware().use(args[0] as MiddlewareEntry["klass"], ...(args.slice(1) as any));
  }

  /**
   * Returns a Rack endpoint for the given action name — mirrors
   * `ActionController::Metal.action` (`action_controller/metal.rb:315-327`).
   */
  static action(this: typeof Metal, name: string): RackApp {
    const app: RackApp = async (env: RackEnv) => {
      const req = new Request(env);
      const res = this.makeResponseBang(req);
      const controller = new this();
      await controller.dispatch(name, req, res);
      return controller.toRackResponse();
    };

    if (this.middleware().isAny()) {
      return this.middleware().build(name, app);
    } else {
      return app;
    }
  }

  /**
   * Direct dispatch to the controller. Instantiates the controller, then
   * executes the action named `name` — mirrors
   * `ActionController::Metal.dispatch` (`action_controller/metal.rb:331-337`).
   */
  static async dispatch(
    this: typeof Metal,
    name: string,
    req: Request,
    res: Response,
  ): Promise<RackResponse> {
    if (this.middleware().isAny()) {
      return await this.middleware().build(name, async () => {
        const controller = new this();
        await controller.dispatch(name, req, res);
        return controller.toRackResponse();
      })(req.env);
    } else {
      const controller = new this();
      await controller.dispatch(name, req, res);
      return controller.toRackResponse();
    }
  }

  controllerPath(): string {
    return (this.constructor as typeof Metal).controllerPath();
  }

  controllerName(): string {
    return (this.constructor as typeof Metal).controllerName();
  }

  inspect(): string {
    return `#<${this.constructor.name}>`;
  }

  urlFor(string: string): string {
    return string;
  }

  /** Dispatch an action in the context of a request/response (`metal.rb:249-255`). */
  async dispatch(name: string, request: Request, response: Response): Promise<RackResponse> {
    this.setRequestBang(request);
    this.setResponseBang(response);
    const reqParams = request.parameters;
    this.params = reqParams instanceof Parameters ? reqParams : new Parameters(reqParams);

    await this.processAction(name);

    request.commitFlash();

    return this.toRackResponse();
  }

  setRequestBang(request: Request): void {
    this.request = request;
    request.controllerInstance = this;
  }

  setResponseBang(response: Response): void {
    this._response = response;
  }

  resetSession(): void {
    if (this.request && typeof (this.request as any).resetSession === "function") {
      (this.request as any).resetSession();
    }
  }

  /** Delegates to `ActionDispatch::Response#status=` (`metal.rb:183-184`). */
  set status(value: number | string) {
    this.response.status = value;
  }

  /** Delegates to `ActionDispatch::Response#status` (`metal.rb:195-196`). */
  get status(): number {
    return this.response.status;
  }

  /** Delegates to `ActionDispatch::Response#headers` (`metal.rb:179-180`). */
  get headers(): Response["headers"] {
    return this.response.headers;
  }

  /** `headers[name] = value` through the delegated `headers` (`metal.rb:179-180`). */
  setHeader(name: string, value: string): void {
    this.response.setHeader(name, value);
  }

  /** `headers[name]` through the delegated `headers` (`metal.rb:179-180`). */
  getHeader(name: string): string | undefined {
    return this.response.getHeader(name);
  }

  /** Delegates to `ActionDispatch::Response#content_type=` (`metal.rb:191-192`). */
  set contentType(value: string) {
    this.response.contentType = value;
  }

  /** Delegates to `ActionDispatch::Response#content_type` (`metal.rb:203-204`). */
  get contentType(): string | null {
    return this.response.contentType ?? null;
  }

  /** Delegates to `ActionDispatch::Response#media_type` (`metal.rb:207-208`). */
  get mediaType(): string | undefined {
    return this.response.mediaType;
  }

  /** Send a head-only response with given status. Mirrors Rails'
   * `ActionController::Head#head` (`actionpack/lib/action_controller/metal/head.rb`):
   * sets status, optional `location` / `content_type` / extra headers,
   * and assigns `response_body = ""` to mark `performed?` true. */
  head(status: number | string | null, options?: Record<string, unknown>): true {
    if (status !== null && typeof status === "object") {
      throw new Error(`${JSON.stringify(status)} is not a valid value for \`status\`.`);
    }
    const resolvedStatus = status ?? "ok";
    let location: unknown;
    let contentType: unknown;
    if (options) {
      location = options.location;
      contentType = options.content_type;
      for (const [key, value] of Object.entries(options)) {
        if (key === "location" || key === "content_type") continue;
        // Rails capitalizes each `-`/`_`-separated segment (`cache_control`
        // → `Cache-Control`), but `setHeader` lowercases keys for storage,
        // so the case transformation has no observable effect — only the
        // underscore-to-hyphen normalization matters here.
        this.setHeader(key.replace(/_/g, "-"), String(value));
      }
    }
    this.status = resolvedStatus;
    if (location !== undefined && location !== null) {
      this.setHeader("location", this.urlFor(String(location)));
    }
    if (includeContent(this.status)) {
      if (!this.mediaType) {
        const f = (this as Metal & { formats?: ReadonlyArray<string | symbol> }).formats;
        const negotiated =
          f && f.length > 0 && MimeType.isRegistered(String(f[0]))
            ? MimeType.lookup(String(f[0])).toString()
            : undefined;
        this.contentType =
          contentType != null ? String(contentType) : (negotiated ?? MimeType.HTML.toString());
      }
      this.response.charset = false;
    }
    // Route through the public setter so the response stream is updated
    // in lock-step (mirrors Rails' `self.response_body = ""` in head.rb).
    this.responseBody = "";
    return true;
  }

  /** Writes through `response_body=` (`metal.rb:238-246`) so the Response carries it. */
  set body(value: string) {
    this.responseBody = value;
  }

  get body(): string {
    return this.responseBody;
  }

  /**
   * Public Rails-style setter that writes through to the underlying
   * response. Mirrors `ActionController::Metal#response_body=`. After
   * assignment, `isPerformed()` returns true.
   */
  override set responseBody(body: string | string[] | Buffer | null | undefined) {
    if (body === null || body === undefined) {
      this.response.resetBodyBang();
      return;
    }
    const str = Array.isArray(body)
      ? body.join("")
      : Buffer.isBuffer(body)
        ? body.toString()
        : body;
    this._responseBody = str;
    if (this.response) this.response.body = str;
  }

  override get responseBody(): string {
    const body = this._responseBody;
    return typeof body === "string" ? body : (body?.toString() ?? "");
  }

  /**
   * Tests if render or redirect has already happened. Mirrors
   * `ActionController::Metal#performed?` which returns
   * `response_body || response.committed?`.
   */
  isPerformed(): boolean {
    return this.performed || (this.response?.committed ?? false);
  }

  /**
   * Mirrors `ActionController::Metal#to_a` (`metal.rb:280-282`) — `response.to_a`.
   * `to_a` is a Ruby core protocol name (SKIP_GROUPS in
   * `scripts/parity/conventions.ts`), so it keeps its trails spelling.
   */
  toRackResponse(): RackResponse {
    return this.response.toRack() as RackResponse;
  }

  /** Resolve a status symbol to a number. */
  static resolveStatus = resolveStatus;

  /**
   * Rails `Metal.build_middleware` — wraps a middleware klass + args
   * into the action-aware `:only`/`:except` predicate form consumed by
   * the dispatch middleware stack.
   *
   * @internal
   */
  static buildMiddleware(
    klass: MiddlewareEntry["klass"],
    args: unknown[],
    _block?: unknown,
  ): Middleware & { valid(action: string): boolean } {
    const next = [...args];
    const last = next[next.length - 1];
    // Clone the options object so we can safely delete `only`/`except`
    // without mutating the caller's hash (Rails' `extract_options!` pops
    // the trailing hash off `args` — the hash itself is still the caller's
    // reference; trails defensively copies to avoid surprising the caller).
    const options: Record<string, unknown> =
      last && typeof last === "object" && !Array.isArray(last)
        ? { ...(next.pop() as Record<string, unknown>) }
        : {};
    const only = ([] as string[]).concat((options.only as string | string[]) ?? []).map(String);
    const except = ([] as string[]).concat((options.except as string | string[]) ?? []).map(String);
    delete options.only;
    delete options.except;
    if (Object.keys(options).length > 0) next.push(options);

    let strategy: (list: string[] | null, action: string) => boolean = () => true;
    let list: string[] | null = null;
    if (only.length > 0) {
      strategy = (l, a) => (l ?? []).includes(a);
      list = only;
    } else if (except.length > 0) {
      strategy = (l, a) => !(l ?? []).includes(a);
      list = except;
    }
    const wrapped = new Middleware(klass, next) as Middleware & {
      valid(action: string): boolean;
    };
    wrapped.valid = (action: string) => strategy(list, action);
    return wrapped;
  }

  /**
   * Composes the Rails `render_to_body` chain. With `ActionController::Base`'s
   * include order, the effective chain is:
   *
   *   Rendering#render_to_body   → super || _render_in_priorities(options) || " "
   *   Renderers#render_to_body   → _render_to_body_with_renderer(options) || super
   *   AbstractController         → (nil — no-op base)
   *
   * Flattened: try the registered renderers first, then the
   * `:body`/`:plain`/`:html` priority resolver, finally the
   * single-space fallback. Subclasses that template-render override
   * this and delegate back via `super`.
   * @internal
   */
  renderToBody(options: Record<string, unknown> = {}): unknown {
    // Match Ruby `||` short-circuit semantics: skip on `nil`/`false`,
    // keep `""` and `0` (truthy in Ruby).
    const truthy = (v: unknown): boolean => v != null && v !== false;
    const renderer = Renderers._renderToBodyWithRenderer(options);
    if (truthy(renderer)) return renderer;
    const priority = _renderInPrioritiesFn(options);
    if (truthy(priority)) return priority;
    return " ";
  }

  // Rails-private rendering helpers — wired onto the class so the
  // `metal/rendering.rb` privates resolve as `Metal._foo` (parity:api
  // surface) while keeping the implementation in `metal/rendering.ts`.
  /** @internal */
  static _normalizeOptions = _normalizeOptionsFn;
  /** @internal */
  static _normalizeText = _normalizeTextFn;
  /** @internal */
  static _processOptions = _processOptionsFn;
  /** @internal */
  static _processVariant = _processVariantFn;
  /** @internal */
  static _renderInPriorities = _renderInPrioritiesFn;
  /** @internal */
  static _setHtmlContentType = _setHtmlContentTypeFn;
  /** @internal */
  static _setRenderedContentType = _setRenderedContentTypeFn;
  /** @internal */
  static _setVaryHeader = _setVaryHeaderFn;
}
