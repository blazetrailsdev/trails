import {
  Benchmark,
  Notifications,
  SafeBuffer,
  classAttribute,
  mattrAccessor,
  extend,
  include,
  runLoadHooks,
} from "@blazetrails/activesupport";
import { File, getCrypto } from "@blazetrails/ruby-compat";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import { Metal } from "./metal.js";
import { FlashHash } from "../action-dispatch/middleware/flash.js";
import {
  RequestForgeryProtection,
  commitCsrfToken,
  protectFromForgery,
  resetCsrfToken,
  skipForgeryProtection,
  type RequestForgeryProtectionHost,
} from "./metal/request-forgery-protection.js";
import { respondTo } from "./metal/mime-responds.js";
import { DefaultHeaders } from "./metal/default-headers.js";
import { actionMethods, addFlashTypes, Flash } from "./metal/flash.js";
import { _computeRedirectToLocation, redirectBack, redirectBackOrTo } from "./metal/redirecting.js";
import { fireInherited, type HelpersPathControllerClass } from "./trailties/helpers.js";
import { MissingFile } from "./metal/exceptions.js";
import { defaultRender } from "./metal/implicit-render.js";
import type {
  ActionCallback,
  AroundCallback,
  CallbackOptions,
} from "../abstract-controller/callbacks.js";
import {
  LookupContext,
  ViewPathsClassMethods,
  _defaultLayout,
  _impliedLayoutName,
  _isConditionalLayout,
  _isIncludeLayout,
  _layoutForOption,
  _normalizeLayout,
  _prefixes,
  _processRenderTemplateOptions,
  _writeLayoutMethod,
  isActionHasLayout,
  layout,
  detailsForLookup,
  isAnyTemplates,
  lookupContext,
  templateExists,
  viewPathsPrependViewPath,
  viewPathsFormats,
  viewPathsLocale,
  viewPathsSetFormats,
  viewPathsSetLocale,
} from "@blazetrails/actionview";
import {
  Base as ActionViewBase,
  _processFormat,
  buildViewContextClass,
  isInheritViewContextClass,
  renderToBody as actionViewRenderToBody,
  viewContext,
  viewContextClass,
  viewRenderer,
} from "@blazetrails/actionview";
import { _renderTemplate } from "./metal/streaming.js";
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
import type { LoggerHost } from "../abstract-controller/logger.js";
import { Instrumentation, logProcessAction } from "./metal/instrumentation.js";
import { Redirecting } from "./metal/redirecting.js";
import {
  contentSecurityPolicy,
  contentSecurityPolicyNonce,
  contentSecurityPolicyReportOnly,
  currentContentSecurityPolicy,
  isContentSecurityPolicy,
} from "./metal/content-security-policy.js";
import { helperMethod, type HelperMethodsModule } from "../abstract-controller/helpers.js";
import { defaultFormBuilder } from "./form-builder.js";
import { instrumentPayload, instrumentName } from "./caching.js";
import {
  ConfigMethods,
  cache,
  viewCacheDependencies,
  viewCacheDependency,
  type CachingClassMethods,
} from "../abstract-controller/caching.js";
import {
  combinedFragmentCacheKey,
  expireFragment,
  fragmentCacheKey,
  fragmentExist,
  readFragment,
  writeFragment,
  type FragmentsClassMethods,
} from "../abstract-controller/caching/fragments.js";
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
import {
  sendFileHeadersBang,
  type SendDataOptions,
  type SendFileOptions,
} from "./metal/data-streaming.js";
import {
  Options as ParamsWrapperOptions,
  _defaultWrapModel,
  _performParameterWrapping,
  _wrapperEnabled,
  type ParamsWrapperHost,
} from "./metal/params-wrapper.js";
import {
  _processOptions,
  _renderInPriorities,
  _setHtmlContentType,
  _setRenderedContentType,
  _setVaryHeader,
  _processVariant,
  _normalizeOptions,
  processAction as _processAction,
  renderToString,
} from "./metal/rendering.js";
import { _renderToBodyWithRenderer } from "./metal/renderers.js";
import { urlOptions } from "./metal/url-for.js";
import { UrlFor, type UrlForOptions } from "../action-dispatch/routing/url-for.js";
import type {
  PolymorphicArg,
  PolymorphicOptions,
} from "../action-dispatch/routing/polymorphic-routes.js";
import { Cookies } from "./metal/cookies.js";
import {
  appendInfoToPayload,
  cleanupViewRuntime,
  haltedCallbackHook,
  processAction as _instrumentProcessAction,
  redirectTo as _instrumentRedirectTo,
} from "./metal/instrumentation.js";
import {
  Parameters as StrongParameters,
  StrongParameters as StrongParametersModule,
} from "./metal/strong-parameters.js";
import {
  DEFAULT_PROTECTED_INSTANCE_VARIABLES,
  DoubleRenderError,
  render as abstractRender,
  viewAssigns,
  _normalizeArgs,
  _normalizeRender,
} from "../abstract-controller/rendering.js";

export { type ActionCallback, type AroundCallback, type CallbackOptions };

export type RenderOptions = {
  json?: unknown;
  plain?: string;
  html?: string | SafeBuffer;
  body?: string;
  action?: string;
  template?: string;
  inline?: string;
  partial?: string;
  locals?: Record<string, unknown>;
  collection?: unknown[];
  as?: string;
  callback?: string;
  status?: number | string;
  contentType?: string;
  layout?: boolean | string;
  formats?: string;
  stream?: boolean;
};

type StreamingBody = { each(block: (chunk: string) => void): Promise<unknown> };

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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Base {
  get params(): StrongParameters;
  set params(value: StrongParameters | Record<string, unknown>);
  urlFor(options?: UrlForOptions): string;
  fullUrlFor(options?: UrlForOptions): string;
  routeFor(name: string, ...args: unknown[]): string;
  polymorphicUrl(recordOrHashOrArray: PolymorphicArg, options?: PolymorphicOptions): string;
  polymorphicPath(recordOrHashOrArray: PolymorphicArg, options?: PolymorphicOptions): string;
  redirectTo(options?: unknown, responseOptionsAndFlash?: Record<string, unknown>): unknown;
  redirectBack: typeof redirectBack;
  redirectBackOrTo: typeof redirectBackOrTo;
  _computeRedirectToLocation: typeof _computeRedirectToLocation;
  allowForgeryProtection: boolean;
  isProtectAgainstForgery(): boolean;
  verifyAuthenticityToken(): void;
  formAuthenticityToken(options?: { formOptions?: { action?: string; method?: string } }): string;
  resetCsrfToken: typeof resetCsrfToken;
  commitCsrfToken: typeof commitCsrfToken;
  verifySameOriginRequest(): void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Base extends Metal {
  get flash(): FlashHash {
    return this.request.flash!;
  }

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

  static layout = layout;
  static _writeLayoutMethod = _writeLayoutMethod;
  /** @internal */
  static _impliedLayoutName = _impliedLayoutName;
  declare static _layout: Parameters<typeof layout>[0];
  declare static _layoutConditions: Record<string, string[]>;
  declare static _flashTypes: string[];
  static addFlashTypes = addFlashTypes;
  static override actionMethods = actionMethods;

  static _routes: ViewContextRoutes | null = null;

  declare static helpersPath: string[];
  declare static isHelpersPath: boolean;
  declare static includeAllHelpers: boolean;
  declare static isIncludeAllHelpers: boolean;

  declare static _helpers?: HelperMethodsModule;
  declare static _helperMethods?: string[];
  static helperMethod = helperMethod;

  constructor(...args: unknown[]) {
    super(...(args as []));
    this._urlOptions = null;
    this._actionHasLayout = true;
    fireInherited(
      new.target as unknown as HelpersPathControllerClass,
      Base as unknown as HelpersPathControllerClass,
    );
  }

  static isInheritViewContextClass = isInheritViewContextClass;
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

  declare viewRenderer: typeof viewRenderer;

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

  viewRuntime: number | null = null;

  render(...args: unknown[]): void | Promise<void> {
    let renderOutput: void | Promise<void>;
    const viewRuntime = this.cleanupViewRuntime(() =>
      Benchmark.realtime(":float_millisecond", () => {
        if (this.performed) throw new DoubleRenderError();
        return (renderOutput = abstractRender.call(this, ...args));
      }),
    ) as number | Promise<number>;
    if (typeof viewRuntime === "number") {
      this.viewRuntime = viewRuntime;
      return renderOutput!;
    }
    return viewRuntime.then((ms) => {
      this.viewRuntime = ms;
    });
  }

  /** @internal */
  _prefixes = _prefixes;

  /** @internal */
  _lookupContext?: LookupContext;

  get lookupContext(): LookupContext {
    return lookupContext.call(this as never);
  }

  detailsForLookup = detailsForLookup;

  get formats(): ReadonlyArray<string | symbol> {
    return viewPathsFormats.call(this as never);
  }
  set formats(values: ReadonlyArray<string | symbol> | null) {
    viewPathsSetFormats.call(this as never, values);
  }

  get locale(): string | null {
    return viewPathsLocale.call(this as never);
  }
  set locale(value: string | null) {
    viewPathsSetLocale.call(this as never, value);
  }

  templateExists = templateExists;

  prependViewPath: (path: ViewPathsInput) => void = viewPathsPrependViewPath;

  isAnyTemplates = isAnyTemplates;

  defaultRender = defaultRender;

  /** @internal */
  override async _dispatchAction(action: string, ...args: unknown[]): Promise<void> {
    await super._dispatchAction(action, ...args);
    if (!this.performed) await this.defaultRender();
  }

  /** @internal */
  renderToBody(options: Record<string, unknown> = {}): unknown {
    const truthy = (v: unknown): boolean => v != null && v !== false;
    const renderer = this._renderToBodyWithRenderer(options);
    if (truthy(renderer)) return renderer;
    return actionViewRenderToBody
      .call(this as never, options)
      .then((body) => this.drainStreamingBody(body))
      .then((body) => {
        if (truthy(body)) return body;
        const priority = _renderInPriorities(options);
        if (truthy(priority)) return priority;
        return " ";
      });
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE response-carries-async-streaming-body
   */
  async drainStreamingBody(body: unknown): Promise<unknown> {
    if (!Array.isArray(body) && typeof (body as StreamingBody | null)?.each === "function") {
      const chunks: string[] = [];
      await (body as StreamingBody).each((chunk) => chunks.push(chunk));
      return chunks;
    }
    return body;
  }

  renderedFormat(): unknown {
    return this._renderedFormat;
  }

  respondTo = respondTo;

  declare readonly notice: unknown;
  declare readonly alert: unknown;

  declare static configAccessor: RequestForgeryProtectionHost["configAccessor"];
  declare static logger: LoggerHost["logger"] | null;
  declare static requestForgeryProtectionToken: RequestForgeryProtectionHost["requestForgeryProtectionToken"];
  declare static forgeryProtectionStrategy: RequestForgeryProtectionHost["forgeryProtectionStrategy"];
  declare static allowForgeryProtection: RequestForgeryProtectionHost["allowForgeryProtection"];
  declare static logWarningOnCsrfFailure: RequestForgeryProtectionHost["logWarningOnCsrfFailure"];
  declare static forgeryProtectionOriginCheck: RequestForgeryProtectionHost["forgeryProtectionOriginCheck"];
  declare static perFormCsrfTokens: RequestForgeryProtectionHost["perFormCsrfTokens"];
  declare static csrfTokenStorageStrategy: RequestForgeryProtectionHost["csrfTokenStorageStrategy"];
  static protectFromForgery = protectFromForgery;
  static skipForgeryProtection = skipForgeryProtection;

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

      await Notifications.instrument(
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

  declare static _wrapperOptions: ParamsWrapperOptions;
  declare static is_wrapperOptions: boolean;
  declare _wrapperOptions: ParamsWrapperOptions;

  static {
    classAttribute.call(this, "_wrapperOptions", {
      default: ParamsWrapperOptions.fromHash({ format: [] }),
    });
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
      this.headers.set("etag", etag);
    }
    if (options.lastModified) {
      // boundary: Realm-safe Date check (instanceof breaks across vm/iframe
      const isDate = Object.prototype.toString.call(options.lastModified) === "[object Date]";
      // boundary: bridge Temporal.Instant input → Date for toUTCString rendering.
      const lm = isDate
        ? (options.lastModified as Date)
        : new Date((options.lastModified as Temporal.Instant).epochMilliseconds);
      this.headers.set("last-modified", lm.toUTCString());
    }
    if (options.public) {
      this.headers.set("cache-control", "public");
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
    this.headers.set("cache-control", parts.join(", "));
  }

  expiresNow(): void {
    this.headers.set("cache-control", "no-cache");
  }

  /** @internal */
  _actionHasLayout?: boolean;
  /** @internal */
  declare _layoutConditions: Record<string, string[]>;
  /** @internal */
  declare _processRenderTemplateOptions: typeof _processRenderTemplateOptions;
  /** @internal */
  declare _processOptions: typeof _processOptions;
  /** @internal */
  declare _renderTemplate: typeof _renderTemplate;
  /** @internal */
  declare _processFormat: typeof _processFormat;
  /** @internal */
  declare _processVariant: typeof _processVariant;
  /** @internal */
  declare _normalizeRender: typeof _normalizeRender;
  /** @internal */
  declare _normalizeArgs: typeof _normalizeArgs;
  /** @internal */
  declare _normalizeOptions: typeof _normalizeOptions;
  declare renderToString: typeof renderToString;
  /** @internal */
  declare _setHtmlContentType: typeof _setHtmlContentType;
  /** @internal */
  declare _setRenderedContentType: typeof _setRenderedContentType;
  /** @internal */
  declare _setVaryHeader: typeof _setVaryHeader;
  declare _renderToBodyWithRenderer: typeof _renderToBodyWithRenderer;
  /** @internal */
  _renderedFormat?: unknown;
  declare isActionHasLayout: typeof isActionHasLayout;
  /** @internal */
  declare _isConditionalLayout: typeof _isConditionalLayout;
  /** @internal */
  declare _layout: (
    lookupContext: LookupContext,
    formats: readonly string[],
    keys: readonly string[],
  ) => unknown;
  /** @internal */
  declare _layoutForOption: typeof _layoutForOption;
  /** @internal */
  declare _normalizeLayout: typeof _normalizeLayout;
  /** @internal */
  declare _defaultLayout: typeof _defaultLayout;
  /** @internal */
  declare _isIncludeLayout: typeof _isIncludeLayout;
  declare viewCacheDependencies: typeof viewCacheDependencies;
  declare cache: typeof cache;
  declare combinedFragmentCacheKey: typeof combinedFragmentCacheKey;
  declare writeFragment: typeof writeFragment;
  declare readFragment: typeof readFragment;
  declare fragmentExist: typeof fragmentExist;
  declare expireFragment: typeof expireFragment;

  /** @internal */
  declare cookies: Cookies["cookies"];
  declare urlOptions: typeof urlOptions;
  /** @internal */
  declare _urlOptions: Readonly<Record<string, unknown>> | null;
  declare defaultUrlOptions: Record<string, unknown>;

  /** @internal */
  declare sendFileHeadersBang: typeof sendFileHeadersBang;
  /** @internal */
  declare appendInfoToPayload: typeof appendInfoToPayload;
  /** @internal */
  declare cleanupViewRuntime: typeof cleanupViewRuntime;
  /** @internal */
  declare haltedCallbackHook: typeof haltedCallbackHook;

  sendFile(path: string, options: SendFileOptions = {}): void {
    if (!(File.isFile(path) && File.isReadable(path))) {
      throw new MissingFile(`Cannot read file ${path}`);
    }

    if (!options.urlBasedFilename) options.filename ??= File.basename(path);
    this.sendFileHeadersBang(options);

    this.status = options.status ?? 200;
    if (Object.hasOwn(options, "contentType")) this.contentType = options.contentType!;
    this.response.sendFile(path);
  }

  /** @missingRailsCall merge — PERMANENT */
  sendData(data: string | Buffer, options: SendDataOptions = {}): void | Promise<void> {
    this.sendFileHeadersBang(options);
    return this.render({
      status: options.status,
      contentType: options.contentType,
      body: Buffer.isBuffer(data) ? data.toString("latin1") : data,
    });
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
    const etag = this.headers.get("etag");
    const lastModified = this.headers.get("last-modified");

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

include(Base, ConfigMethods);
include(Base, Cookies);
Base.prototype.redirectBack = redirectBack;
Base.prototype.redirectBackOrTo = redirectBackOrTo;
Base.prototype._computeRedirectToLocation = _computeRedirectToLocation;
include(Base, Flash);
Base.prototype.redirectTo = _instrumentRedirectTo;
include(Base, StrongParametersModule);
Base.prototype._processRenderTemplateOptions = _processRenderTemplateOptions;
Base.prototype._processOptions = _processOptions;
Base.prototype._renderTemplate = _renderTemplate;
Base.prototype.viewRenderer = viewRenderer;
Base.prototype._processFormat = _processFormat;
Base.prototype._processVariant = _processVariant;
Base.prototype._normalizeRender = _normalizeRender;
Base.prototype._normalizeArgs = _normalizeArgs;
Base.prototype._normalizeOptions = _normalizeOptions;
Base.prototype.renderToString = renderToString;
Base.prototype._setHtmlContentType = _setHtmlContentType;
Base.prototype._setRenderedContentType = _setRenderedContentType;
Base.prototype._setVaryHeader = _setVaryHeader;
Base.prototype._renderToBodyWithRenderer = _renderToBodyWithRenderer;
Base.prototype.isActionHasLayout = isActionHasLayout;
Base.prototype._isConditionalLayout = _isConditionalLayout;
Base.prototype._layoutForOption = _layoutForOption;
Base.prototype._normalizeLayout = _normalizeLayout;
Base.prototype._defaultLayout = _defaultLayout;
Base.prototype._isIncludeLayout = _isIncludeLayout;
classAttribute.call(Base, "_layout", { instanceAccessor: false });
classAttribute.call(Base, "_layoutConditions", {
  instanceAccessor: false,
  instanceReader: true,
  default: {},
});
Base._writeLayoutMethod();
Base.prototype.viewCacheDependencies = viewCacheDependencies;
Base.prototype.cache = cache;
Base.prototype.combinedFragmentCacheKey = combinedFragmentCacheKey;
Base.prototype.writeFragment = writeFragment;
Base.prototype.readFragment = readFragment;
Base.prototype.fragmentExist = fragmentExist;
Base.prototype.expireFragment = expireFragment;
(
  Base as unknown as FragmentsClassMethods & { fragmentCacheKey: typeof fragmentCacheKey }
).fragmentCacheKey = fragmentCacheKey;
(
  Base as unknown as CachingClassMethods & { viewCacheDependency: typeof viewCacheDependency }
).viewCacheDependency = viewCacheDependency;

classAttribute.call(Base, "fragmentCacheKeys", { default: [] });
Base.helperMethod("combinedFragmentCacheKey");

extend(Base, ConfigMethods);
extend(Base, DefaultHeaders.ClassMethods);
include(Base, Redirecting);
include(Base, Instrumentation);
include(Base, RequestForgeryProtection);

const _Configurable = Base as unknown as {
  configAccessor(...names: string[]): void;
} & CachingClassMethods;

_Configurable.configAccessor("defaultStaticExtension");
_Configurable.defaultStaticExtension ??= ".html";

_Configurable.configAccessor("performCaching");
if (_Configurable.performCaching == null) _Configurable.performCaching = true;

mattrAccessor.call(Base, "raiseOnOpenRedirects", { default: false });

classAttribute.call(Base, "helpersPath", { default: [] });
classAttribute.call(Base, "includeAllHelpers", { default: true });

_Configurable.configAccessor("enableFragmentCacheLogging");
_Configurable.enableFragmentCacheLogging = false;

classAttribute.call(Base, "_viewCacheDependencies", { default: [] });
Base.helperMethod("viewCacheDependencies");

runLoadHooks("action_controller_base", Base);
runLoadHooks("action_controller", Base);

include(Base, UrlFor);
Base.prototype.urlOptions = urlOptions;

Base.prototype.sendFileHeadersBang = sendFileHeadersBang;

Base.prototype.appendInfoToPayload = appendInfoToPayload;
Base.prototype.cleanupViewRuntime = cleanupViewRuntime;
Base.prototype.haltedCallbackHook = haltedCallbackHook;

Base.helperMethod("isContentSecurityPolicy", "contentSecurityPolicyNonce");

export { DoubleRenderError };
