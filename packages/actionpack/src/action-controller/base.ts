import { ArgumentError, Notifications, runLoadHooks } from "@blazetrails/activesupport";
import { File, getCrypto } from "@blazetrails/ruby-compat";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import { Metal } from "./metal.js";
import { FlashHash } from "../action-dispatch/middleware/flash.js";
import { RequestForgeryProtection } from "../action-dispatch/request-forgery-protection.js";
import { Collector } from "./metal/mime-responds.js";
import { UnknownFormat } from "./metal/exceptions.js";
import { defaultRender } from "./metal/implicit-render.js";
import type {
  ActionCallback,
  AroundCallback,
  CallbackOptions,
} from "../abstract-controller/callbacks.js";
import {
  LookupContext,
  ViewPathsClassMethods,
  _prefixes,
  detailsForLookup,
  isAnyTemplates,
  lookupContext,
  templateExists,
} from "@blazetrails/actionview";
import {
  Base as ActionViewBase,
  buildViewContextClass,
  inheritViewContextClassQ,
  viewContext,
  viewContextClass,
} from "@blazetrails/actionview";
import type {
  PathSet,
  ViewPathsInput,
  ViewContextHost,
  ViewContextRoutes,
} from "@blazetrails/actionview";
import { BrowserBlocker, type BrowserVersions } from "./metal/allow-browser.js";
import { permissionsPolicy } from "./metal/permissions-policy.js";
import { rateLimit, rateLimiting } from "./metal/rate-limiting.js";
import { logAt } from "./metal/logging.js";
import { logProcessAction } from "./metal/instrumentation.js";
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
import { sendFileHeadersBang, type SendFileHeadersOptions } from "./metal/data-streaming.js";
import { statusCode } from "@blazetrails/rack";
import {
  Options as ParamsWrapperOptions,
  _defaultWrapModel,
  _performParameterWrapping,
  _wrapperEnabled,
  type ParamsWrapperHost,
} from "./metal/params-wrapper.js";
import { processAction as _processAction } from "./metal/rendering.js";
import {
  appendInfoToPayload,
  cleanupViewRuntime,
  haltedCallbackHook,
  processAction as _instrumentProcessAction,
} from "./metal/instrumentation.js";
import { Parameters as StrongParameters } from "./metal/strong-parameters.js";
import {
  DEFAULT_PROTECTED_INSTANCE_VARIABLES,
  DoubleRenderError,
  viewAssigns,
} from "../abstract-controller/rendering.js";

export { type ActionCallback, type AroundCallback, type CallbackOptions };

export type RenderOptions = {
  json?: unknown;
  plain?: string;
  html?: string;
  body?: string;
  text?: string;
  action?: string;
  template?: string;
  partial?: string;
  locals?: Record<string, unknown>;
  collection?: unknown[];
  as?: string;
  callback?: string;
  status?: number | string;
  contentType?: string;
  layout?: boolean | string;
  formats?: string;
};

export type RescueHandler = (error: Error) => void | Promise<void>;

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
  get flash(): FlashHash {
    return this.request.flash!;
  }

  static templateResolver?: (controller: string, action: string, format: string) => string | null;

  static _viewPaths: {
    (): PathSet;
    (paths: PathSet): void;
  } = ViewPathsClassMethods._viewPaths;
  static appendViewPath: (path: ViewPathsInput) => void = ViewPathsClassMethods.appendViewPath;
  static prependViewPath: (path: ViewPathsInput) => void = ViewPathsClassMethods.prependViewPath;
  static viewPaths: {
    (): PathSet;
    (paths: ViewPathsInput): void;
  } = ViewPathsClassMethods.viewPaths;

  static layout: string | false = "application";

  static _routes: ViewContextRoutes | null = null;

  static inheritViewContextClassQ = inheritViewContextClassQ;
  static buildViewContextClass = buildViewContextClass;
  static viewContextClass = viewContextClass;
  /** @internal */
  static _viewContextClass?: typeof ActionViewBase;

  viewContextClass(): typeof ActionViewBase {
    return (
      this.constructor as unknown as { viewContextClass(): typeof ActionViewBase }
    ).viewContextClass();
  }

  viewAssigns = viewAssigns;

  viewContext(): ActionViewBase {
    return viewContext.call(this as unknown as ViewContextHost);
  }

  private static _rescueHandlers: Array<{
    errorClass: new (...args: any[]) => Error;
    handler: RescueHandler;
  }> = [];

  static withoutModules(...modules: string[]): readonly string[] {
    const drop = new Set(modules);
    return MODULES.filter((m) => !drop.has(m));
  }

  /** @internal */
  _protectedIvars(): readonly string[] {
    return PROTECTED_IVARS;
  }

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
      } else if (!this.response.mediaType) {
        this.contentType = "text/plain";
      }
      this.body = options.body;
    } else if (options.text !== undefined) {
      this.contentType = options.contentType ?? "text/plain; charset=utf-8";
      this.body = options.text;
    } else if (options.partial !== undefined) {
      this._pendingRender = { type: "partial", options };
      return;
    } else if (
      options.template !== undefined ||
      options.action !== undefined ||
      options.collection !== undefined
    ) {
      this._pendingRender = { type: "template", options };
      return;
    } else if (this.lookupContext.viewPaths.size > 0) {
      this._pendingRender = { type: "template", options };
      return;
    } else {
      this._renderTemplate(this.actionName, options);
      if (!this.performed) {
        this.contentType = "text/html; charset=utf-8";
        this.body = "";
      }
    }

    this.markPerformed();
  }

  _pendingRender: { type: string; options: RenderOptions } | null = null;

  /** @internal */
  _prefixes = _prefixes;

  /** @internal */
  _lookupContext?: LookupContext;

  get lookupContext(): LookupContext {
    return lookupContext.call(this as never);
  }

  detailsForLookup = detailsForLookup;

  get formats(): ReadonlyArray<string | symbol> {
    return this.lookupContext.formats;
  }
  set formats(values: ReadonlyArray<string | symbol> | null) {
    this.lookupContext.formats = values;
  }

  get locale(): string | symbol | null {
    return this.lookupContext.locale;
  }
  set locale(value: string | symbol | null) {
    this.lookupContext.locale = value;
  }

  templateExists = templateExists;

  isAnyTemplates = isAnyTemplates;

  defaultRender = defaultRender;

  /** @internal */
  override async _dispatchAction(action: string, ...args: unknown[]): Promise<void> {
    await super._dispatchAction(action, ...args);
    if (!this.performed && !this._pendingRender) this.defaultRender();
  }

  async renderAsync(options: RenderOptions): Promise<void> {
    if (this.performed) {
      throw new DoubleRenderError(
        "Render and/or redirect were called multiple times in this action.",
      );
    }

    if (options.status) {
      this.status = options.status;
    }

    const ctx = this.lookupContext;

    const controllerPrefix = this.controllerPath();
    const formats = this.formats;
    const format = String(formats[0] ?? "html");
    const locals = { ...options.locals };
    const view = this.viewContext();
    const layout =
      options.layout === false
        ? false
        : typeof options.layout === "string"
          ? options.layout
          : (this.constructor as typeof Base).layout;

    if (options.partial !== undefined) {
      if (options.collection !== undefined) {
        this.body = await ctx.renderCollection(
          options.partial,
          controllerPrefix,
          format,
          options.collection,
          options.as,
        );
      } else {
        this.body = await ctx.renderPartial(
          options.partial,
          controllerPrefix,
          format,
          locals,
          view,
        );
      }
    } else {
      const template = String(options.template ?? options.action ?? this.actionName);
      const [action, prefixes] = ctx.normalizeName(
        template,
        options.template !== undefined ? [] : _prefixes.call(this as never),
      );
      this.body = await ctx.render(prefixes, action, formats, locals, {
        layout: layout === false ? false : layout || undefined,
        view,
      });
    }

    this.contentType = options.contentType ?? "text/html; charset=utf-8";
    this.markPerformed();
  }

  renderToString(options: RenderOptions = {}): string {
    const oldBody = this._responseBody;
    const oldPerformed = this._performed;
    const oldStatus = this.response.status;
    const oldHeaders = this.response.headers.toHash();
    try {
      this.render(options);
      return this.body;
    } finally {
      this._responseBody = oldBody;
      this._performed = oldPerformed;
      this.response.status = oldStatus;
      for (const key of Object.keys(this.response.headers.toHash())) {
        this.response.deleteHeader(key);
      }
      for (const [key, value] of Object.entries(oldHeaders)) this.response.setHeader(key, value);
    }
  }

  redirectTo(
    options: string,
    responseOptions: { status?: number | string; allow_other_host?: boolean } = {},
  ): void {
    if (this.performed) {
      throw new DoubleRenderError(
        "Render and/or redirect were called multiple times in this action.",
      );
    }

    const proposedStatus = responseOptions.status ? statusCode(responseOptions.status) : 302;
    this.status = proposedStatus;
    this.setHeader("location", options);
    this.contentType = "text/html; charset=utf-8";
    this.body = `<html><body>You are being <a href="${options}">redirected</a>.</body></html>`;
    this.markPerformed();
  }

  redirectBack(options: {
    fallbackLocation: string;
    status?: number | string;
    allow_other_host?: boolean;
  }): void {
    const referer = this.request?.getHeader("referer");
    const url = referer ?? options.fallbackLocation;
    this.redirectTo(url, { status: options.status });
  }

  respondTo(...mimes: Array<string | ((collector: Collector) => void)>): void {
    const last = mimes[mimes.length - 1];
    const block = typeof last === "function" ? (mimes.pop() as (c: Collector) => void) : undefined;
    if (mimes.length > 0 && block) {
      throw new ArgumentError("respond_to takes either types or a block, never both");
    }

    const collector = new Collector(mimes as string[], this.request?.variant ?? null);
    if (block) block(collector);

    const format = this.request?.format?.symbol ?? undefined;
    const accept = this.request?.getHeader("accept") ?? undefined;

    const result = collector.negotiate({ format, accept });
    if (!result) {
      throw new UnknownFormat();
    }

    result.handler();
  }

  set notice(value: string) {
    this.flash.notice = value;
  }

  get notice(): unknown {
    return this.flash.notice;
  }

  set alert(value: string) {
    this.flash.alert = value;
  }

  get alert(): unknown {
    return this.flash.alert;
  }

  private static _csrfProtection: RequestForgeryProtection | null = null;

  static protectFromForgery(
    options: { with?: "exception" | "reset_session" | "null_session" } = {},
  ): void {
    this._csrfProtection = new RequestForgeryProtection({
      strategy: options.with ?? "exception",
    });
  }

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

  formAuthenticityToken(): string {
    const csrf = (this.constructor as typeof Base)._csrfProtection;
    if (!csrf) return "";
    const realToken = csrf.getRealToken(this.session);
    return csrf.maskToken(realToken);
  }

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
      const blocker = new BrowserBlocker(base.request, versions);
      if (!blocker.blocked) return true;

      await Notifications.instrumentAsync(
        "browser_block.action_controller",
        {
          user_agent: base.request?.userAgent ?? "",
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

  static permissionsPolicy = permissionsPolicy;

  static contentSecurityPolicy = contentSecurityPolicy;

  static contentSecurityPolicyReportOnly = contentSecurityPolicyReportOnly;

  /** @internal */
  isContentSecurityPolicy(): boolean {
    return isContentSecurityPolicy.call(this as never);
  }
  /** @internal */
  contentSecurityPolicyNonce(): string | null {
    return contentSecurityPolicyNonce.call(this as never);
  }
  /** @internal */
  currentContentSecurityPolicy(): ReturnType<typeof currentContentSecurityPolicy> {
    return currentContentSecurityPolicy.call(this as never);
  }

  static rateLimit = rateLimit;

  static logAt = logAt;
  static logProcessAction = logProcessAction;

  /** @internal */
  async rateLimiting(args: Parameters<typeof rateLimiting>[0]): Promise<void> {
    return rateLimiting.call(this, args);
  }

  static defaultFormBuilder = defaultFormBuilder;

  defaultFormBuilder(): unknown {
    return defaultFormBuilder.call(this);
  }

  /** @internal */
  instrumentPayload(key: unknown): { controller: string; action: string; key: unknown } {
    return instrumentPayload.call(this, key);
  }

  /** @internal */
  instrumentName(): string {
    return instrumentName.call(this);
  }

  static _wrapperOptions: ParamsWrapperOptions = ParamsWrapperOptions.fromHash({ format: [] });

  get _wrapperOptions(): ParamsWrapperOptions {
    return (this.constructor as typeof Base)._wrapperOptions;
  }

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
      opts = nameOrModelOrOptions;
    } else {
      model = nameOrModelOrOptions;
    }
    const current = this._wrapperOptions;
    const merged = { format: current.format ?? [], ...opts };
    const newOpts = ParamsWrapperOptions.fromHash(merged);
    newOpts.model = model;
    newOpts.klass = this;
    if ((newOpts.format?.length ?? 0) > 0 && !newOpts.name) {
      newOpts.name = _defaultWrapModel.call({ _wrapperOptions: newOpts });
    }
    this._wrapperOptions = newOpts;
  }

  /** @internal */
  static inheritedParamsWrapper(): void {
    const inherited = this._wrapperOptions;
    if (!inherited.format || inherited.format.length === 0) return;
    const dup = ParamsWrapperOptions.fromHash({
      format: inherited.format,
      include: inherited.include,
      exclude: inherited.exclude,
    });
    dup.model = inherited.model;
    dup.klass = this;
    if (inherited.nameSet) {
      dup.name = inherited.name;
      dup.nameSet = true;
    } else {
      dup.name = _defaultWrapModel.call({ _wrapperOptions: dup });
    }
    this._wrapperOptions = dup;
  }

  static httpBasicAuthenticateWith = httpBasicAuthenticateWith;
  httpBasicAuthenticateOrRequestWith = httpBasicAuthenticateOrRequestWith;
  authenticateOrRequestWithHttpBasic = authenticateOrRequestWithHttpBasic;
  authenticateWithHttpBasic = authenticateWithHttpBasic;
  requestHttpBasicAuthentication = requestHttpBasicAuthentication;

  authenticateOrRequestWithHttpDigest = authenticateOrRequestWithHttpDigest;
  authenticateWithHttpDigest = authenticateWithHttpDigest;
  requestHttpDigestAuthentication = requestHttpDigestAuthentication;

  static rescueFrom(errorClass: new (...args: any[]) => Error, handler: RescueHandler): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_rescueHandlers")) {
      (this as any)._rescueHandlers = [];
    }
    (this as any)._rescueHandlers.push({ errorClass, handler });
  }

  /** @internal */
  async processAction(action: string, ...args: unknown[]): Promise<void> {
    this.actionName = action;
    await _instrumentProcessAction.call(this as never, async () => {
      try {
        _processAction.call(this as never, action, ...args);
        if (this.request && _wrapperEnabled.call(this as unknown as ParamsWrapperHost)) {
          _performParameterWrapping.call(this as unknown as ParamsWrapperHost);
          this.params = new StrongParameters({
            ...this.request.params,
            ...this.request.pathParameters,
          });
        }
        await super.processAction(action, ...args);

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
    });
  }

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

  stale(options: {
    etag?: string;
    lastModified?: Date | Temporal.Instant;
    public?: boolean;
  }): boolean {
    this.freshWhen(options);
    return !this.performed;
  }

  expiresIn(seconds: number, options: { public?: boolean; mustRevalidate?: boolean } = {}): void {
    const parts = [`max-age=${seconds}`];
    if (options.public) parts.push("public");
    if (options.mustRevalidate) parts.push("must-revalidate");
    this.setHeader("cache-control", parts.join(", "));
  }

  expiresNow(): void {
    this.setHeader("cache-control", "no-cache");
  }

  /** @internal */
  declare sendFileHeadersBang: typeof sendFileHeadersBang;
  /** @internal */
  declare appendInfoToPayload: typeof appendInfoToPayload;
  /** @internal */
  declare cleanupViewRuntime: typeof cleanupViewRuntime;
  /** @internal */
  declare haltedCallbackHook: typeof haltedCallbackHook;

  sendFile(path: string, options: SendFileHeadersOptions = {}): void {
    const content = Buffer.from(
      File.open(path, "rb", (file) => file.read()),
      "latin1",
    );
    const filename = options.filename ?? File.basename(path);

    this.sendFileHeadersBang({ ...options, filename });
    this.body = content.toString();
    this.setHeader("content-length", String(content.length));
    this.markPerformed();
  }

  sendData(data: string | Buffer, options: SendFileHeadersOptions = {}): void {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

    this.sendFileHeadersBang(options);
    this.body = buf.toString();
    this.setHeader("content-length", String(buf.length));
    this.markPerformed();
  }

  get cookies(): Record<string, string> {
    return (this.request as any)?.cookies ?? {};
  }

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
      return new Date(ifModifiedSince) >= new Date(lastModified);
    }
    return false;
  }
}

runLoadHooks("action_controller_base", Base);
runLoadHooks("action_controller", Base);

Base.prototype.sendFileHeadersBang = sendFileHeadersBang;

Base.prototype.appendInfoToPayload = appendInfoToPayload;
Base.prototype.cleanupViewRuntime = cleanupViewRuntime;
Base.prototype.haltedCallbackHook = haltedCallbackHook;

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
