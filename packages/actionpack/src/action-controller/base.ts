import {
  Benchmark,
  SafeBuffer,
  classAttribute,
  mattrAccessor,
  extend,
  include,
  type Included,
  runLoadHooks,
} from "@blazetrails/activesupport";
import type { StatusSymbol } from "@blazetrails/rack";
import type { TemplateLocals, TemplateRegistry } from "@blazetrails/actionview";
import type { ToModel } from "../action-dispatch/routing/polymorphic-routes.js";
import { Metal } from "./metal.js";
import type { FlashHash } from "../action-dispatch/middleware/flash.js";
import {
  RequestForgeryProtection,
  commitCsrfToken,
  protectFromForgery,
  resetCsrfToken,
  skipForgeryProtection,
  type RequestForgeryProtectionHost,
} from "./metal/request-forgery-protection.js";
import { respondTo } from "./metal/mime-responds.js";
import {
  ConditionalGet,
  type ClassMethods as ConditionalGetClassMethods,
  type Etagger,
  type combineEtags,
  type expiresIn,
  type expiresNow,
  type freshWhen,
  type httpCacheForever,
  type isStale,
  type noStore,
} from "./metal/conditional-get.js";
import { EtagWithTemplateDigest } from "./metal/etag-with-template-digest.js";
import { EtagWithFlash } from "./metal/etag-with-flash.js";
import { DefaultHeaders } from "./metal/default-headers.js";
import {
  type addFlashTypes,
  Flash,
  type RedirectToResponseOptionsAndFlash,
} from "./metal/flash.js";
import {
  _computeRedirectToLocation,
  redirectBack,
  redirectBackOrTo,
  type RedirectToOptions,
} from "./metal/redirecting.js";
import { fireInherited, type HelpersPathControllerClass } from "./trailties/helpers.js";
import { isShowDetailedExceptions, processAction as _rescueProcessAction } from "./metal/rescue.js";
import { ImplicitRender, type defaultRender } from "./metal/implicit-render.js";
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
  viewPathsViewPaths,
} from "@blazetrails/actionview";
import {
  Base as ActionViewBase,
  Rendering as ActionViewRendering,
  _normalizeArgs,
  _processFormat,
  buildViewContextClass,
  isInheritViewContextClass,
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
import {
  AllowBrowser,
  type ClassMethods as AllowBrowserClassMethods,
} from "./metal/allow-browser.js";
import { permissionsPolicy } from "./metal/permissions-policy.js";
import { rateLimit, rateLimiting } from "./metal/rate-limiting.js";
import { logAt } from "./metal/logging.js";
import type { LoggerHost } from "../abstract-controller/logger.js";
import { AssetPaths } from "../abstract-controller/asset-paths.js";
import { Instrumentation, logProcessAction } from "./metal/instrumentation.js";
import { Redirecting } from "./metal/redirecting.js";
import {
  contentSecurityPolicy,
  contentSecurityPolicyNonce,
  contentSecurityPolicyReportOnly,
  currentContentSecurityPolicy,
  isContentSecurityPolicy,
} from "./metal/content-security-policy.js";
import {
  Helpers as AbstractHelpers,
  type HelperMethodsModule,
  type HelpersClass,
} from "../abstract-controller/helpers.js";
import { ClassMethods as HelpersClassMethods, helpers } from "./metal/helpers.js";
import { defaultFormBuilder } from "./form-builder.js";
import { instrumentPayload, instrumentName } from "./caching.js";
import {
  Caching,
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
import { HttpAuthentication } from "./metal/http-authentication.js";
import { sendFileHeadersBang } from "./metal/data-streaming.js";
import {
  Options as ParamsWrapperOptions,
  _performParameterWrapping,
  _setWrapperOptions,
  _wrapperEnabled,
  inheritedParamsWrapper,
  wrapParameters,
  type ParamsWrapperHost,
} from "./metal/params-wrapper.js";
import {
  _processOptions,
  _setHtmlContentType,
  _setRenderedContentType,
  _setVaryHeader,
  _processVariant,
  _normalizeOptions,
  processAction as _processAction,
  Rendering,
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
  sendData,
  sendFile,
} from "./metal/instrumentation.js";
import {
  Parameters as StrongParameters,
  StrongParameters as StrongParametersModule,
} from "./metal/strong-parameters.js";
import {
  DEFAULT_PROTECTED_INSTANCE_VARIABLES,
  DoubleRenderError,
  Rendering as AbstractControllerRendering,
  viewAssigns,
  _normalizeRender,
} from "../abstract-controller/rendering.js";

export { type ActionCallback, type AroundCallback, type CallbackOptions };

export interface RenderOptions {
  json?: unknown;
  js?: unknown;
  xml?: unknown;
  plain?: string | number | boolean | null;
  html?: string | SafeBuffer;
  body?: string;
  action?: string;
  template?: string;
  file?: string;
  inline?: string;
  type?: string;
  renderable?: { renderIn(...args: never[]): unknown };
  partial?: string;
  locals?: Record<string, unknown>;
  object?: unknown;
  collection?: readonly unknown[];
  as?: string;
  spacerTemplate?: string;
  cached?: boolean | ((...args: never[]) => unknown);
  callback?: string;
  status?: number | StatusSymbol | `:${StatusSymbol}` | `${number}` | `${number} ${string}`;
  contentType?: string;
  location?: UrlForOptions;
  layout?: boolean | string | null | ((...args: never[]) => unknown);
  prefixes?: string[];
  formats?: string | string[];
  variants?: string | string[];
  handlers?: string | string[];
  locale?: string | string[];
  stream?: boolean;
}

type RenderOptionsFor<P extends string> = Omit<RenderOptions, "partial" | "locals"> & {
  partial?: P;
} & (P extends keyof TemplateRegistry
    ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      {} extends TemplateLocals<TemplateRegistry[P]>
      ? { locals?: TemplateLocals<TemplateRegistry[P]> }
      : { locals: TemplateLocals<TemplateRegistry[P]> }
    : { locals?: Record<string, unknown> });

type RenderArgs<P extends string> =
  | []
  | [RenderOptionsFor<P> | StrongParameters]
  | [string | ToModel | NonNullable<RenderOptions["renderable"]>, RenderOptionsFor<P>?];

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
export interface Base
  extends
    Included<typeof HttpAuthentication.Basic.ControllerMethods>,
    Included<typeof HttpAuthentication.Digest.ControllerMethods>,
    Included<typeof HttpAuthentication.Token.ControllerMethods> {
  get params(): StrongParameters;
  set params(value: StrongParameters | Record<string, unknown>);
  helpers(): ActionViewBase;
  urlFor(options?: UrlForOptions): string;
  fullUrlFor(options?: UrlForOptions): string;
  routeFor(name: string, ...args: unknown[]): string;
  polymorphicUrl(recordOrHashOrArray: PolymorphicArg, options?: PolymorphicOptions): string;
  polymorphicPath(recordOrHashOrArray: PolymorphicArg, options?: PolymorphicOptions): string;
  redirectTo<FlashType extends string = never>(
    options?: RedirectToOptions,
    responseOptionsAndFlash?: RedirectToResponseOptionsAndFlash<FlashType>,
  ): number;
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
  static {
    this.abstractBang();
  }

  declare readonly flash: FlashHash;
  declare static addFlashTypes: typeof addFlashTypes;

  declare static _viewPaths: {
    (): PathSet;
    (paths: PathSet): void;
  };
  /** @internal */
  declare static _prefixes: () => string[];
  /** @internal */
  declare static _buildViewPaths: (paths: ViewPathsInput) => PathSet;
  /** @internal */
  declare static localPrefixes: () => string[];
  declare static appendViewPath: (path: ViewPathsInput) => void;
  declare static prependViewPath: (path: ViewPathsInput) => void;
  declare static viewPaths: {
    (): PathSet;
    (paths: ViewPathsInput): void;
  };

  static layout = layout;
  static _writeLayoutMethod = _writeLayoutMethod;
  /** @internal */
  static _impliedLayoutName = _impliedLayoutName;
  declare static _layout: Parameters<typeof layout>[0];
  declare static _layoutConditions: Record<string, string[]>;
  declare static _flashTypes: string[];

  static _routes: ViewContextRoutes | null = null;

  declare static etaggers: Etagger[];
  declare static isEtaggers: boolean;
  declare etaggers: Etagger[];
  declare isEtaggers: boolean;
  declare static etagWithTemplateDigest: boolean;
  declare static isEtagWithTemplateDigest: boolean;
  declare etagWithTemplateDigest: boolean;
  declare isEtagWithTemplateDigest: boolean;
  declare static etag: OmitThisParameter<(typeof ConditionalGetClassMethods)["etag"]>;

  declare static helpersPath: string[];
  declare static isHelpersPath: boolean;
  declare static includeAllHelpers: boolean;
  declare static isIncludeAllHelpers: boolean;

  declare static _helpers?: HelperMethodsModule;
  declare static _helperMethods: string[];
  declare static helperMethod: HelpersClass["helperMethod"];
  declare static helper: HelpersClass["helper"];
  declare static clearHelpers: HelpersClass["clearHelpers"];
  declare static _helpersForModification: HelpersClass["_helpersForModification"];
  /** @internal */
  declare static defaultHelperModuleBang: HelpersClass["defaultHelperModuleBang"];
  declare static allHelpersFromPath: (typeof AbstractHelpers.ClassMethods)["allHelpersFromPath"];
  declare static helperModulesFromPaths: (typeof AbstractHelpers.ClassMethods)["helperModulesFromPaths"];
  static helperAttr = HelpersClassMethods.helperAttr;
  static helpers = HelpersClassMethods.helpers;
  static modulesForHelpers = HelpersClassMethods.modulesForHelpers;
  /** @internal */
  declare _helperProxy?: ActionViewBase | null;

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

  render<P extends string = string>(...args: RenderArgs<P>): void | Promise<void> {
    let renderOutput: void | Promise<void>;
    const viewRuntime = this.cleanupViewRuntime(() =>
      Benchmark.realtime(":float_millisecond", () => {
        if (this.responseBody != null) throw new DoubleRenderError();
        return (renderOutput = (
          super["render" as never] as (...args: unknown[]) => void | Promise<void>
        ).call(this, ...args));
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

  get viewPaths(): PathSet {
    return viewPathsViewPaths.call(this as never);
  }

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

  declare defaultRender: typeof defaultRender;

  /** @internal */
  override async sendAction(method: string, ...args: unknown[]): Promise<unknown> {
    const ret = await super.sendAction(method, ...args);
    if (!this.performed) await this.defaultRender();
    return ret;
  }

  /** @internal */
  renderToBody(options: Record<string, unknown> = {}): unknown {
    const renderer = this._renderToBodyWithRenderer(options);
    if (renderer != null && renderer !== false) return renderer;
    const body = (
      super["renderToBody" as never] as (options: Record<string, unknown>) => unknown
    ).call(this, options);
    return typeof (body as PromiseLike<unknown> | null)?.then === "function"
      ? Promise.resolve(body).then((body) => this.drainStreamingBody(body))
      : body;
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

  declare static allowBrowser: OmitThisParameter<(typeof AllowBrowserClassMethods)["allowBrowser"]>;

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
  instrumentPayload(key: unknown): { controller: string | null; action: string; key: unknown } {
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

  static _setWrapperOptions = _setWrapperOptions;

  static wrapParameters = wrapParameters;

  /** @internal */
  static inheritedParamsWrapper = inheritedParamsWrapper;

  declare static httpBasicAuthenticateWith: OmitThisParameter<
    typeof HttpAuthentication.Basic.ControllerMethods.ClassMethods.httpBasicAuthenticateWith
  >;

  static rescueFrom(errorClass: new (...args: any[]) => Error, handler: RescueHandler): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_rescueHandlers")) {
      (this as any)._rescueHandlers = [];
    }
    (this as any)._rescueHandlers.push({ errorClass, handler });
  }

  /** @internal */
  async processAction(action: string, ...args: unknown[]): Promise<void> {
    await _instrumentProcessAction.call(this as never, () =>
      _rescueProcessAction.call(this, async () => {
        _processAction.call(this as never, action, ...args);
        if (this.request && _wrapperEnabled.call(this as unknown as ParamsWrapperHost)) {
          _performParameterWrapping.call(this as unknown as ParamsWrapperHost);
          this.params = new StrongParameters({
            ...this.request.params,
            ...this.request.pathParameters,
          });
        }
        await super.processAction(action, ...args);
      }),
    );
  }

  declare freshWhen: typeof freshWhen;
  declare isStale: typeof isStale;
  declare expiresIn: typeof expiresIn;
  declare expiresNow: typeof expiresNow;
  declare httpCacheForever: typeof httpCacheForever;
  declare noStore: typeof noStore;
  /** @internal */
  declare combineEtags: typeof combineEtags;

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

  declare sendFile: typeof sendFile;
  declare sendData: typeof sendData;
  declare isShowDetailedExceptions: typeof isShowDetailedExceptions;

  async rescueWithHandler(exception: unknown): Promise<boolean> {
    if (!(exception instanceof Error)) return false;
    const match = this._findRescueHandler(exception);
    if (!match) return false;
    await match.handler.call(this, match.error);
    return true;
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
}

include(Base, AbstractHelpers);
include(Base, AbstractControllerRendering);
include(Base, ActionViewRendering);
include(Base, Rendering);
include(Base, ConfigMethods);
include(Base, AssetPaths);
include(Base, Cookies);
Base.prototype.helpers = helpers;
Base.prototype.redirectBack = redirectBack;
Base.prototype.redirectBackOrTo = redirectBackOrTo;
Base.prototype._computeRedirectToLocation = _computeRedirectToLocation;
include(Base, ConditionalGet);
include(Base, EtagWithTemplateDigest);
include(Base, EtagWithFlash);
include(Base, Flash);
include(Base, AllowBrowser);
Base.prototype.redirectTo = _instrumentRedirectTo;
include(Base, ImplicitRender);
include(Base, StrongParametersModule);
Base.prototype._processRenderTemplateOptions = _processRenderTemplateOptions;
Base.prototype._renderTemplate = _renderTemplate;
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

include(Base, Caching);
extend(Base, ViewPathsClassMethods);
include(Base, HttpAuthentication.Basic.ControllerMethods);
include(Base, HttpAuthentication.Digest.ControllerMethods);
include(Base, HttpAuthentication.Token.ControllerMethods);
extend(Base, DefaultHeaders.ClassMethods);
include(Base, Redirecting);
include(Base, Instrumentation);
include(Base, RequestForgeryProtection);

mattrAccessor.call(Base, "raiseOnOpenRedirects", { default: false });

classAttribute.call(Base, "helpersPath", { default: [] });
classAttribute.call(Base, "includeAllHelpers", { default: true });

runLoadHooks("action_controller_base", Base);
runLoadHooks("action_controller", Base);

include(Base, UrlFor);
Base.prototype.urlOptions = urlOptions;

Base.prototype.sendFile = sendFile;
Base.prototype.sendData = sendData;
Base.prototype.sendFileHeadersBang = sendFileHeadersBang;
Base.prototype.isShowDetailedExceptions = isShowDetailedExceptions;

Base.prototype.appendInfoToPayload = appendInfoToPayload;
Base.prototype.cleanupViewRuntime = cleanupViewRuntime;
Base.prototype.haltedCallbackHook = haltedCallbackHook;

Base.helperMethod("isContentSecurityPolicy", "contentSecurityPolicyNonce");

export { DoubleRenderError };
