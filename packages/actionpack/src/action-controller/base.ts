/**
 * ActionController::Base
 *
 * Full-featured controller with rendering, redirecting, filters,
 * flash, CSRF, content negotiation, caching, rescue, and more.
 */

import { getFs, getPath, getCrypto, Notifications } from "@blazetrails/activesupport";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import { Metal } from "./metal.js";
import { FlashHash } from "../action-dispatch/middleware/flash.js";
import { RequestForgeryProtection } from "../action-dispatch/request-forgery-protection.js";
import { Collector } from "./metal/mime-responds.js";
import { UnknownFormat } from "./metal/exceptions.js";
import type {
  ActionCallback,
  AroundCallback,
  CallbackOptions,
} from "../abstract-controller/callbacks.js";
import { LookupContext } from "@blazetrails/actionview";
import type { RouteHelpersMap } from "../action-dispatch/routing/route-helpers.js";
import { BrowserBlocker, type BrowserVersions } from "./metal/allow-browser.js";
import { permissionsPolicy } from "./metal/permissions-policy.js";
import { rateLimit, rateLimiting } from "./metal/rate-limiting.js";
import {
  contentSecurityPolicy,
  contentSecurityPolicyNonce,
  contentSecurityPolicyReportOnly,
  currentContentSecurityPolicy,
  isContentSecurityPolicy,
} from "./metal/content-security-policy.js";
import { helperMethod, type HelpersClassMethods } from "../abstract-controller/helpers.js";
import { defaultFormBuilder } from "./form-builder.js";
import { instrumentPayload, instrumentName } from "./caching.js";
import {
  authenticateOrRequestWithHttpBasic,
  authenticateWithHttpBasic,
  httpBasicAuthenticateOrRequestWith,
  httpBasicAuthenticateWith,
  requestHttpBasicAuthentication,
  authenticateOrRequestWithHttpDigest,
  authenticateWithHttpDigest,
  requestHttpDigestAuthentication,
} from "./metal/http-authentication.js";
import { sendFileHeadersBang } from "./metal/data-streaming.js";
import {
  Options as ParamsWrapperOptions,
  _defaultWrapModel,
  _performParameterWrapping,
  _wrapperEnabled,
  type ParamsWrapperHost,
} from "./metal/params-wrapper.js";
import { Parameters as StrongParameters } from "./metal/strong-parameters.js";
import {
  DEFAULT_PROTECTED_INSTANCE_VARIABLES,
  DoubleRenderError,
} from "../abstract-controller/rendering.js";

// Re-export callback registration
export { type ActionCallback, type AroundCallback, type CallbackOptions };

export type RenderOptions = {
  json?: unknown;
  plain?: string;
  html?: string;
  body?: string;
  text?: string;
  /** Render a specific action's template */
  action?: string;
  /** Render a partial */
  partial?: string;
  /** Locals to pass to template */
  locals?: Record<string, unknown>;
  /** Collection to render with a partial */
  collection?: unknown[];
  /** Variable name for each collection item */
  as?: string;
  /** JSONP callback function name */
  callback?: string;
  status?: number | string;
  contentType?: string;
  layout?: boolean | string;
  formats?: string;
};

export type RescueHandler = (error: Error) => void | Promise<void>;

/**
 * The full list of modules included by `ActionController::Base`. Mirrors
 * Rails' `MODULES` constant in `action_controller/base.rb`. Trails wires
 * these mixins onto `Base` directly (not via Ruby `include`), so this
 * array is informational and used by {@link Base.withoutModules}.
 */
export const MODULES: readonly string[] = [
  "AbstractController::Rendering",
  "AbstractController::Translation",
  "AbstractController::AssetPaths",
  "Helpers",
  "UrlFor",
  "Redirecting",
  "ActionView::Layouts",
  "Rendering",
  "Renderers::All",
  "ConditionalGet",
  "EtagWithTemplateDigest",
  "EtagWithFlash",
  "Caching",
  "MimeResponds",
  "ImplicitRender",
  "StrongParameters",
  "ParameterEncoding",
  "Cookies",
  "Flash",
  "FormBuilder",
  "RequestForgeryProtection",
  "ContentSecurityPolicy",
  "PermissionsPolicy",
  "RateLimiting",
  "AllowBrowser",
  "Streaming",
  "DataStreaming",
  "HttpAuthentication::Basic::ControllerMethods",
  "HttpAuthentication::Digest::ControllerMethods",
  "HttpAuthentication::Token::ControllerMethods",
  "DefaultHeaders",
  "Logging",
  "AbstractController::Callbacks",
  "Rescue",
  "Instrumentation",
  "ParamsWrapper",
];

/**
 * Instance variables that should not be propagated to the view. Mirrors
 * Rails' `PROTECTED_IVARS` in `action_controller/base.rb`: extends the
 * abstract-layer `DEFAULT_PROTECTED_INSTANCE_VARIABLES` with the controller-
 * level slots (`_params`, `_response`, `_request`, …).
 *
 * Names follow the abstract-layer transliteration convention (Rails
 * `@_action_name` → trails `_actionName`). This is currently a literal
 * Rails-parity constant — `viewAssigns` already filters all leading-`_`
 * fields plus `DEFAULT_PROTECTED_INSTANCE_VARIABLES`, so wiring through
 * `_protectedIvars()` is unnecessary until trails grows underscored
 * backing fields for `params`/`request`/`response` (Rails' `@_params`
 * etc.) and the controller pipeline starts consulting it directly.
 */
export const PROTECTED_IVARS: readonly string[] = [
  ...DEFAULT_PROTECTED_INSTANCE_VARIABLES,
  "_params",
  "_response",
  "_request",
  "_config",
  "_urlOptions",
  "_actionHasLayout",
  "_viewContextClass",
  "_viewRenderer",
  "_lookupContext",
  "_routes",
  "_viewRuntime",
  "_dbRuntime",
  "_helperProxy",
  "_markedForSameOriginVerification",
  "_renderedFormat",
];

export class Base extends Metal {
  /** Flash messages for the current request. */
  flash: FlashHash = new FlashHash();

  /** Session store (simple object). */
  session: Record<string, unknown> = {};

  /** Template resolver (pluggable, legacy). */
  static templateResolver?: (controller: string, action: string, format: string) => string | null;

  /** Pluggable template lookup context (ActionView integration). */
  static lookupContext?: LookupContext;

  /** Layout name. Set to false to disable, or a string name. */
  static layout: string | false = "application";

  /** Route helpers (_path/_url functions) available to controller and templates. */
  static routeHelpers?: RouteHelpersMap;

  /** Rescue handlers (class-level, inherited). */
  private static _rescueHandlers: Array<{
    errorClass: new (...args: any[]) => Error;
    handler: RescueHandler;
  }> = [];

  /**
   * Returns all modules included in {@link MODULES} except those passed
   * as arguments. Mirrors Rails `ActionController::Base.without_modules`.
   *
   *     Base.withoutModules("ParamsWrapper", "Streaming")
   */
  static withoutModules(...modules: string[]): readonly string[] {
    const drop = new Set(modules);
    return MODULES.filter((m) => !drop.has(m));
  }

  /**
   * The ivar names hidden from `viewAssigns`. Rails declares this private
   * on `Base` to extend the abstract-layer default with controller-level
   * slots; see {@link PROTECTED_IVARS}.
   * @internal
   */
  _protectedIvars(): readonly string[] {
    return PROTECTED_IVARS;
  }

  // --- Rendering ---

  /** Render a response. Supports json, plain, html, body, text, action, partial, collection. */
  render(options: RenderOptions = {}): void {
    if (this.performed) {
      throw new DoubleRenderError(
        "Render and/or redirect were called multiple times in this action.",
      );
    }

    if (options.status) {
      this.status = options.status;
    }

    if (options.json !== undefined) {
      const jsonStr =
        typeof options.json === "string" ? options.json : JSON.stringify(options.json);
      if (options.callback && JSONP_CALLBACK_RE.test(options.callback)) {
        const jsonPayload =
          typeof options.json === "string" ? JSON.stringify(options.json) : jsonStr;
        const safeJson = escapeJsonForJs(jsonPayload);
        this.contentType = options.contentType ?? "text/javascript; charset=utf-8";
        this.body = `/**/\n${options.callback}(${safeJson})`;
      } else {
        this.contentType = options.contentType ?? "application/json; charset=utf-8";
        this.body = jsonStr;
      }
    } else if (options.plain !== undefined) {
      this.contentType = options.contentType ?? "text/plain; charset=utf-8";
      this.body = options.plain;
    } else if (options.html !== undefined) {
      this.contentType = options.contentType ?? "text/html; charset=utf-8";
      this.body = options.html;
    } else if (options.body !== undefined) {
      if (options.contentType != null) {
        this.contentType = String(options.contentType);
      } else if (!this._contentType && !this.response.contentType) {
        this.contentType = "text/plain";
      }
      this.body = options.body;
    } else if (options.text !== undefined) {
      this.contentType = options.contentType ?? "text/plain; charset=utf-8";
      this.body = options.text;
    } else if (options.partial !== undefined) {
      // Render partial via LookupContext (synchronous wrapper, actual render is async)
      this._pendingRender = { type: "partial", options };
      return; // Will be handled by async processAction wrapper
    } else if (options.action !== undefined || options.collection !== undefined) {
      // Render action template or collection via LookupContext
      this._pendingRender = { type: "template", options };
      return; // Will be handled by async processAction wrapper
    } else {
      // Implicit render — try template resolver
      this._renderTemplate(this.actionName, options);
      if (!this.performed) {
        // No template found, render empty 200
        this.contentType = "text/html; charset=utf-8";
        this.body = "";
      }
    }

    this.markPerformed();
  }

  /** Pending async render (for template/partial rendering). */
  _pendingRender: { type: string; options: RenderOptions } | null = null;

  /** Async render — resolves pending template/partial renders. */
  async renderAsync(options: RenderOptions): Promise<void> {
    if (this.performed) {
      throw new DoubleRenderError(
        "Render and/or redirect were called multiple times in this action.",
      );
    }

    if (options.status) {
      this.status = options.status;
    }

    const ctx = (this.constructor as typeof Base).lookupContext;
    if (!ctx) {
      throw new Error(
        "No lookupContext configured. Set YourController.lookupContext = new LookupContext() " +
          "and register resolvers/handlers.",
      );
    }

    const controllerPrefix = this.controllerPath();
    const format = this.request?.format?.symbol ?? "html";
    const routeHelpers = (this.constructor as typeof Base).routeHelpers ?? {};
    const locals = { ...routeHelpers, ...options.locals };
    const layout =
      options.layout === false
        ? false
        : typeof options.layout === "string"
          ? options.layout
          : (this.constructor as typeof Base).layout;

    if (options.partial !== undefined) {
      if (options.collection !== undefined) {
        // Render collection with partial
        this.body = await ctx.renderCollection(
          options.partial,
          controllerPrefix,
          format,
          options.collection,
          options.as,
        );
      } else {
        this.body = await ctx.renderPartial(options.partial, controllerPrefix, format, locals);
      }
    } else {
      const action = options.action ?? this.actionName;
      this.body = await ctx.render(controllerPrefix, action, format, locals, {
        layout: layout === false ? false : layout || undefined,
      });
    }

    this.contentType = options.contentType ?? "text/html; charset=utf-8";
    this.markPerformed();
  }

  /** Render to string without committing the response. */
  renderToString(options: RenderOptions = {}): string {
    // Snapshot the underlying body slot (not the stringified getter) so we
    // can restore the original `null`/non-null state. `body=` now routes
    // through `_responseBody`, which doubles as the `performed?` signal —
    // assigning "" would otherwise leave the controller permanently
    // "performed" after a render-to-string.
    // Snapshot every response-affecting slot — `render()` may mutate
    // status, content-type, and headers in addition to the body, and
    // Rails' `render_to_string` is documented as side-effect free.
    const oldBody = this._responseBody;
    const oldPerformed = this._performed;
    const oldStatus = this._status;
    const oldContentType = this._contentType;
    const oldHeaders = { ...this._headers };
    try {
      this.render(options);
      return this.body;
    } finally {
      this._responseBody = oldBody;
      this._performed = oldPerformed;
      this._status = oldStatus;
      this._contentType = oldContentType;
      this._headers = oldHeaders;
    }
  }

  // --- Redirecting ---

  /** Redirect to a URL. */
  redirectTo(
    url: string,
    options: { status?: number | string; allow_other_host?: boolean } = {},
  ): void {
    if (this.performed) {
      throw new DoubleRenderError(
        "Render and/or redirect were called multiple times in this action.",
      );
    }

    const status = options.status ? Metal.resolveStatus(options.status) : 302;
    this.status = status;
    this.setHeader("location", url);
    this.contentType = "text/html; charset=utf-8";
    this.body = `<html><body>You are being <a href="${url}">redirected</a>.</body></html>`;
    this.markPerformed();
  }

  /** Redirect back to the referer or a fallback URL. */
  redirectBack(options: {
    fallbackLocation: string;
    status?: number | string;
    allow_other_host?: boolean;
  }): void {
    const referer = this.request?.getHeader("referer");
    const url = referer ?? options.fallbackLocation;
    this.redirectTo(url, { status: options.status });
  }

  // --- Content Negotiation ---

  /** Content negotiation via respond_to. */
  respondTo(block: (collector: Collector) => void): void {
    const collector = new Collector();
    block(collector);

    const format = this.request?.format?.symbol ?? undefined;
    const accept = this.request?.getHeader("accept") ?? undefined;

    const result = collector.negotiate({ format, accept });
    if (!result) {
      throw new UnknownFormat();
    }

    result.handler();
  }

  // --- Flash ---

  /** Set a flash notice. */
  set notice(value: string) {
    this.flash.notice = value;
  }

  get notice(): unknown {
    return this.flash.notice;
  }

  /** Set a flash alert. */
  set alert(value: string) {
    this.flash.alert = value;
  }

  get alert(): unknown {
    return this.flash.alert;
  }

  // --- CSRF Protection ---

  private static _csrfProtection: RequestForgeryProtection | null = null;

  /** Enable CSRF protection (class-level). */
  static protectFromForgery(
    options: { with?: "exception" | "reset_session" | "null_session" } = {},
  ): void {
    this._csrfProtection = new RequestForgeryProtection({
      strategy: options.with ?? "exception",
    });
  }

  /** Verify the CSRF token. Called as a before_action. */
  verifyAuthenticityToken(): void {
    const csrf = (this.constructor as typeof Base)._csrfProtection;
    if (!csrf) return;

    const token =
      (this.params.get("authenticity_token") as string) ??
      this.request?.getHeader("x-csrf-token") ??
      null;

    const result = csrf.verifyRequest({
      method: this.request?.method ?? "GET",
      session: this.session,
      token,
      host: this.request?.host ?? "localhost",
    });

    if (!result.verified) {
      csrf.handleUnverified(this.session);
    }
  }

  /** Get the form authenticity token for the current session. */
  formAuthenticityToken(): string {
    const csrf = (this.constructor as typeof Base)._csrfProtection;
    if (!csrf) return "";
    const realToken = csrf.getRealToken(this.session);
    return csrf.maskToken(realToken);
  }

  // --- Allow Browser ---

  static allowBrowser(options: {
    versions: BrowserVersions;
    block?: ((this: Base) => void | Promise<void>) | string;
    only?: string[];
    except?: string[];
  }): void {
    const { versions, block } = options;
    const callbackOptions: CallbackOptions = {};
    if (options.only) callbackOptions.only = options.only;
    if (options.except) callbackOptions.except = options.except;

    this.beforeAction(async function (controller): Promise<boolean> {
      const base = controller as Base;
      const userAgent = base.request?.getHeader("user-agent") ?? "";
      const blocker = new BrowserBlocker(userAgent, versions);
      if (!blocker.blocked) return true;

      await Notifications.instrumentAsync(
        "browser_block.action_controller",
        {
          user_agent: userAgent,
          method: base.request?.method ?? "GET",
          path: base.request?.path ?? "/",
          versions,
        },
        async () => {
          if (typeof block === "function") {
            await block.call(base);
          } else if (typeof block === "string" && typeof (base as any)[block] === "function") {
            await (base as any)[block].call(base);
          } else {
            base.head(406);
          }
        },
      );
      return false;
    }, callbackOptions);
  }

  // --- Permissions Policy ---

  /**
   * Override the globally configured Permissions-Policy on a per-action basis.
   * Mirrors Rails `permissions_policy` class DSL.
   */
  static permissionsPolicy = permissionsPolicy;

  // --- Content Security Policy ---

  /**
   * Override the globally configured Content-Security-Policy on a
   * per-action basis. Mirrors Rails `content_security_policy` class DSL.
   */
  static contentSecurityPolicy = contentSecurityPolicy;

  /**
   * Override the globally configured Content-Security-Policy-Report-Only
   * header. Mirrors Rails `content_security_policy_report_only` class DSL.
   */
  static contentSecurityPolicyReportOnly = contentSecurityPolicyReportOnly;

  /**
   * Defined as prototype methods (not instance fields) so subclasses can
   * override via the normal class-method syntax — the DSL dispatches through
   * `this.currentContentSecurityPolicy` (content-security-policy.ts:80) for
   * Rails parity (content_security_policy.rb:42 resolves via `self`).
   */
  /** @internal Private in Rails; exposed for parity coverage. */
  isContentSecurityPolicy(): boolean {
    return isContentSecurityPolicy.call(this as never);
  }
  /** @internal Private in Rails; exposed for parity coverage. */
  contentSecurityPolicyNonce(): string | null {
    return contentSecurityPolicyNonce.call(this as never);
  }
  /** @internal Private in Rails; exposed for parity coverage. */
  currentContentSecurityPolicy(): ReturnType<typeof currentContentSecurityPolicy> {
    return currentContentSecurityPolicy.call(this as never);
  }

  /**
   * Apply a rate limit to all actions (or those selected by `only:`/`except:`).
   * Mirrors Rails `rate_limit` class DSL.
   */
  static rateLimit = rateLimit;

  /**
   * Per-request enforcement. Private in Rails; exposed as a prototype
   * method so subclass overrides win (the DSL dispatches through
   * `this.rateLimiting`). Listed in AbstractController._internalMethods
   * so it isn't picked up as an action.
   * @internal
   */
  async rateLimiting(args: Parameters<typeof rateLimiting>[0]): Promise<void> {
    return rateLimiting.call(this, args);
  }

  /**
   * Class DSL: override the default form builder for all views rendered by
   * this controller and its subclasses. Mirrors Rails
   * `ActionController::FormBuilder::ClassMethods#default_form_builder`.
   */
  static defaultFormBuilder = defaultFormBuilder;

  /** Instance reader for the configured form builder (Rails parity). */
  defaultFormBuilder(): unknown {
    return defaultFormBuilder.call(this);
  }

  /** @internal Rails parity — caching instrumentation payload. */
  instrumentPayload(key: unknown): { controller: string; action: string; key: unknown } {
    return instrumentPayload.call(this, key);
  }

  /** @internal Rails parity — caching instrumentation name. */
  instrumentName(): string {
    return instrumentName.call(this);
  }

  // --- Params Wrapper ---

  /**
   * Class-level wrapper options. Mirrors Rails'
   * `class_attribute :_wrapper_options, default: Options.from_hash(format: [])`.
   * Statics are inherited through the class chain; `wrapParameters` assigns an
   * own property on the calling subclass.
   */
  static _wrapperOptions: ParamsWrapperOptions = ParamsWrapperOptions.fromHash({ format: [] });

  /** Instance accessor for the active wrapper options (reads from constructor). */
  get _wrapperOptions(): ParamsWrapperOptions {
    return (this.constructor as typeof Base)._wrapperOptions;
  }

  /**
   * Class DSL: configure parameter wrapping. Mirrors Rails
   * `ActionController::ParamsWrapper::ClassMethods#wrap_parameters`.
   *
   *     wrapParameters({ format: ["json"] })
   *     wrapParameters("person", { include: ["name"] })
   *     wrapParameters(false)                    // disable wrapping
   *     wrapParameters(SomeModelClass)
   */
  static wrapParameters(
    nameOrModelOrOptions:
      | string
      | false
      | Record<string, unknown>
      | (new (...args: never[]) => unknown),
    options: Record<string, unknown> = {},
  ): void {
    let model: unknown = null;
    let opts: Record<string, unknown> = options;
    if (nameOrModelOrOptions === false) {
      opts = { ...opts, format: [] };
    } else if (typeof nameOrModelOrOptions === "string") {
      opts = { ...opts, name: nameOrModelOrOptions };
    } else if (
      typeof nameOrModelOrOptions === "object" &&
      nameOrModelOrOptions !== null &&
      !Array.isArray(nameOrModelOrOptions)
    ) {
      opts = nameOrModelOrOptions as Record<string, unknown>;
    } else {
      model = nameOrModelOrOptions;
    }
    const current = this._wrapperOptions;
    const merged = { format: current.format ?? [], ...opts };
    const newOpts = ParamsWrapperOptions.fromHash(merged);
    newOpts.model = model;
    newOpts.klass = this;
    // Rails' `Options#name` is a lazy getter that derives a default from
    // `klass.controller_name.singularize` (or `model.to_s.demodulize.underscore`)
    // on first read. We store name eagerly, so assign the derived default
    // here when wrapping is enabled but no name was provided — otherwise
    // `_wrapperEnabled` would always return false for the common Rails form
    // `wrap_parameters format: [...]`. `nameSet` stays `false` in that
    // case so subclasses re-derive from their own `klass` via
    // `inheritedParamsWrapper`.
    if ((newOpts.format?.length ?? 0) > 0 && !newOpts.name) {
      newOpts.name = _defaultWrapModel.call({ _wrapperOptions: newOpts });
    }
    this._wrapperOptions = newOpts;
  }

  /**
   * Rails' ParamsWrapper `inherited` hook duplicates the parent's options
   * and rebinds `klass` to the subclass when wrapping is enabled (format
   * non-empty). JS class statics already inherit; this static method should
   * be invoked explicitly by subclasses that need a per-subclass `klass`
   * rebind for `_defaultWrapModel` to derive a name from the subclass.
   * @internal
   */
  static inheritedParamsWrapper(): void {
    const inherited = this._wrapperOptions;
    if (!inherited.format || inherited.format.length === 0) return;
    // Mirrors Rails' `Options#dup` semantics: copy all fields including
    // `nameSet`, then rebind `klass`. Pass `null` for name so fromHash's
    // `nameSet` defaults to false, then assign explicitly below to
    // preserve the parent's explicit-vs-derived state.
    const dup = ParamsWrapperOptions.fromHash({
      format: inherited.format,
      include: inherited.include,
      exclude: inherited.exclude,
    });
    dup.model = inherited.model;
    dup.klass = this;
    if (inherited.nameSet) {
      // Parent's name was explicitly provided — inherit it as-is.
      dup.name = inherited.name;
      dup.nameSet = true;
    } else {
      // Parent's name (if any) was auto-derived; re-derive from the
      // subclass `klass` so `Child < Parent` wraps under its own name.
      dup.name = _defaultWrapModel.call({ _wrapperOptions: dup });
    }
    this._wrapperOptions = dup;
  }

  // --- HTTP Basic authentication (Rails parity, P17a) ---

  /** Class DSL: `http_basic_authenticate_with name:, password:, realm:, **options`. */
  static httpBasicAuthenticateWith = httpBasicAuthenticateWith;
  httpBasicAuthenticateOrRequestWith = httpBasicAuthenticateOrRequestWith;
  authenticateOrRequestWithHttpBasic = authenticateOrRequestWithHttpBasic;
  authenticateWithHttpBasic = authenticateWithHttpBasic;
  requestHttpBasicAuthentication = requestHttpBasicAuthentication;

  // --- HTTP Digest authentication ---

  authenticateOrRequestWithHttpDigest = authenticateOrRequestWithHttpDigest;
  authenticateWithHttpDigest = authenticateWithHttpDigest;
  requestHttpDigestAuthentication = requestHttpDigestAuthentication;

  // --- Rescue ---

  /** Register a rescue handler for a specific error class. */
  static rescueFrom(errorClass: new (...args: any[]) => Error, handler: RescueHandler): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_rescueHandlers")) {
      (this as any)._rescueHandlers = [];
    }
    (this as any)._rescueHandlers.push({ errorClass, handler });
  }

  /**
   * Process action with rescue handling and async template rendering.
   *
   * @internal
   */
  async processAction(action: string, ...args: unknown[]): Promise<void> {
    try {
      if (this.request && _wrapperEnabled.call(this as unknown as ParamsWrapperHost)) {
        _performParameterWrapping.call(this as unknown as ParamsWrapperHost);
        // Rails' controller `params` is `request.parameters` by reference, so
        // the merge in `_performParameterWrapping` is visible to actions. Our
        // Metal.dispatch snapshots `request.params` into `this.params` before
        // processAction runs, so we re-sync after wrapping to surface the
        // wrapped root key to the action.
        this.params = new StrongParameters({
          ...this.request.params,
          ...this.request.pathParameters,
        });
      }
      await super.processAction(action, ...args);

      // Resolve any pending async renders (template/partial)
      if (this._pendingRender && !this.performed) {
        await this.renderAsync(this._pendingRender.options);
        this._pendingRender = null;
      }
    } catch (error) {
      if (error instanceof Error) {
        const match = this._findRescueHandler(error);
        if (match) {
          await match.handler.call(this, match.error);
          return;
        }
      }
      throw error;
    }
  }

  // --- Caching / Conditional GET ---

  /** Check if the response should be fresh (304 Not Modified). */
  freshWhen(options: {
    etag?: string;
    lastModified?: Date | Temporal.Instant;
    public?: boolean;
  }): void {
    if (options.etag) {
      const etag = this._generateEtag(options.etag);
      this.setHeader("etag", etag);
    }
    if (options.lastModified) {
      // boundary: Realm-safe Date check (instanceof breaks across vm/iframe
      // realms). Last-Modified is RFC 7231 — emit via Date#toUTCString,
      // bridging a Temporal.Instant input through epoch ms.
      const isDate = Object.prototype.toString.call(options.lastModified) === "[object Date]";
      // boundary: bridge Temporal.Instant input → Date for toUTCString rendering.
      const lm = isDate
        ? (options.lastModified as Date)
        : new Date((options.lastModified as Temporal.Instant).epochMilliseconds);
      this.setHeader("last-modified", lm.toUTCString());
    }
    if (options.public) {
      this.setHeader("cache-control", "public");
    }

    if (this._isFresh()) {
      this.head(304);
    }
  }

  /** Check if the resource is stale. Returns true if a re-render is needed. */
  stale(options: {
    etag?: string;
    lastModified?: Date | Temporal.Instant;
    public?: boolean;
  }): boolean {
    this.freshWhen(options);
    return !this.performed;
  }

  /** Set cache control headers. */
  expiresIn(seconds: number, options: { public?: boolean; mustRevalidate?: boolean } = {}): void {
    const parts = [`max-age=${seconds}`];
    if (options.public) parts.push("public");
    if (options.mustRevalidate) parts.push("must-revalidate");
    this.setHeader("cache-control", parts.join(", "));
  }

  /** Mark response as expired. */
  expiresNow(): void {
    this.setHeader("cache-control", "no-cache");
  }

  // --- Send File / Send Data ---

  /** Mirrors Rails `send_file_headers!`; wired below via `Base.prototype`. */
  declare sendFileHeadersBang: typeof sendFileHeadersBang;

  /** Send file content. */
  sendFile(
    filePath: string,
    options: { type?: string; disposition?: string; filename?: string } = {},
  ): void {
    const content = getFs().readFileSync(filePath);
    const filename = options.filename ?? getPath().basename(filePath);
    const ext = getPath().extname(filename).toLowerCase();

    this.contentType = options.type ?? SEND_FILE_MIME_TYPES[ext] ?? "application/octet-stream";
    this.body = content.toString();

    if (options.disposition !== undefined && options.disposition !== null) {
      this.setHeader("content-disposition", `${options.disposition}; filename="${filename}"`);
    } else {
      this.setHeader("content-disposition", `attachment; filename="${filename}"`);
    }

    this.setHeader("content-length", String(content.length));
    this.markPerformed();
  }

  /** Send raw data as a download. */
  sendData(
    data: string | Buffer,
    options: { type?: string; disposition?: string; filename?: string } = {},
  ): void {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

    let guessedType = "application/octet-stream";
    if (options.filename) {
      const ext = getPath().extname(options.filename).toLowerCase();
      guessedType = SEND_FILE_MIME_TYPES[ext] ?? "application/octet-stream";
    }
    this.contentType = options.type ?? guessedType;
    this.body = buf.toString();

    if (options.filename) {
      const disposition = options.disposition ?? "attachment";
      this.setHeader("content-disposition", `${disposition}; filename="${options.filename}"`);
    } else if (options.disposition) {
      this.setHeader("content-disposition", options.disposition);
    }

    this.setHeader("content-length", String(buf.length));
    this.markPerformed();
  }

  // --- Cookies ---

  /** Get cookie jar (from request). */
  get cookies(): Record<string, string> {
    return (this.request as any)?.cookies ?? {};
  }

  // --- Private helpers ---

  private _renderTemplate(action: string, _options: RenderOptions): void {
    const resolver = (this.constructor as typeof Base).templateResolver;
    if (!resolver) return;

    const controllerPrefix = this.controllerPath();
    const format = this.request?.format?.symbol ?? "html";
    const template = resolver(controllerPrefix, action, format);
    if (template) {
      this.contentType = "text/html; charset=utf-8";
      this.body = template;
      this.markPerformed();
    }
  }

  private _findRescueHandler(error: Error): { handler: RescueHandler; error: Error } | null {
    const hierarchy: Array<typeof Base> = [];
    let klass = this.constructor as typeof Base;
    while (klass && klass !== (Object as unknown)) {
      hierarchy.unshift(klass);
      klass = Object.getPrototypeOf(klass);
    }

    const matchHandler = (err: Error): RescueHandler | null => {
      for (let i = hierarchy.length - 1; i >= 0; i--) {
        const k = hierarchy[i];
        if (Object.prototype.hasOwnProperty.call(k, "_rescueHandlers")) {
          const handlers = (k as any)._rescueHandlers as Array<{
            errorClass: new (...args: any[]) => Error;
            handler: RescueHandler;
          }>;
          for (let j = handlers.length - 1; j >= 0; j--) {
            if (err instanceof handlers[j].errorClass) return handlers[j].handler;
          }
        }
      }
      return null;
    };

    let current: Error | undefined = error;
    const seen = new Set<Error>();
    while (current) {
      if (seen.has(current)) break;
      seen.add(current);
      const handler = matchHandler(current);
      if (handler) return { handler, error: current };
      current = (current as any).cause instanceof Error ? (current as any).cause : undefined;
    }

    return null;
  }

  private _generateEtag(seed: string): string {
    const hash = getCrypto().createHash("sha256").update(seed).digest("hex").slice(0, 32);
    return `W/"${hash}"`;
  }

  private _isFresh(): boolean {
    if (!this.request) return false;
    const ifNoneMatch = this.request.getHeader("if-none-match");
    const ifModifiedSince = this.request.getHeader("if-modified-since");
    const etag = this.getHeader("etag");
    const lastModified = this.getHeader("last-modified");

    if (ifNoneMatch && etag) {
      return ifNoneMatch === etag;
    }
    if (ifModifiedSince && lastModified) {
      // boundary: HTTP If-Modified-Since / Last-Modified are RFC 7231 date
      // strings; parse via Date.parse semantics for comparison.
      return new Date(ifModifiedSince) >= new Date(lastModified);
    }
    return false;
  }
}

// Rails: `ActionController::DataStreaming#send_file_headers!` mixed in via
// `include DataStreaming`. Trails wires it onto Base.prototype explicitly.
Base.prototype.sendFileHeadersBang = sendFileHeadersBang;

// Rails: `included do helper_method :content_security_policy?,
// :content_security_policy_nonce end` (content_security_policy.rb:13).
// Trails wires mixins onto Base explicitly, so register the helper-method
// proxies here so templates can call these via the helpers module.
helperMethod(
  Base as unknown as HelpersClassMethods,
  "isContentSecurityPolicy",
  "contentSecurityPolicyNonce",
);

export { DoubleRenderError };

const JSONP_CALLBACK_RE = /^[a-zA-Z_$][0-9a-zA-Z_$]*(?:\.[a-zA-Z_$][0-9a-zA-Z_$]*)*$/;

function escapeJsonForJs(json: string): string {
  return json.replace(/[<>&\u2028\u2029]/g, (c) => {
    switch (c) {
      case "<":
        return "\\u003c";
      case ">":
        return "\\u003e";
      case "&":
        return "\\u0026";
      case "\u2028":
        return "\\u2028";
      case "\u2029":
        return "\\u2029";
      default:
        return c;
    }
  });
}

const SEND_FILE_MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".txt": "text/plain",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".csv": "text/csv",
};
