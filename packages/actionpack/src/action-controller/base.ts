import {
  SafeBuffer,
  classAttribute,
  extend,
  include,
  type Included,
  type Rescuable,
  type Module,
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
  type protectFromForgery,
  resetCsrfToken,
  type skipForgeryProtection,
  type RequestForgeryProtectionHost,
} from "./metal/request-forgery-protection.js";
import { respondTo } from "./metal/mime-responds.js";
import type { head } from "./metal/head.js";
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
import { ParameterEncoding, type ParameterEncodingHost } from "./metal/parameter-encoding.js";
import {
  type addFlashTypes,
  Flash,
  type RedirectToResponseOptionsAndFlash,
} from "./metal/flash.js";
import type {
  _computeRedirectToLocation,
  redirectBack,
  redirectBackOrTo,
  urlFrom,
  RedirectToOptions,
} from "./metal/redirecting.js";
import { fireInherited, type HelpersPathControllerClass } from "./trailties/helpers.js";
import { Rescue, type isShowDetailedExceptions } from "./metal/rescue.js";
import { ImplicitRender, type defaultRender } from "./metal/implicit-render.js";
import type {
  ActionCallback,
  AroundCallback,
  CallbackOptions,
} from "../abstract-controller/callbacks.js";
import {
  Layouts,
  LookupContext,
  ViewPathsClassMethods,
  type _defaultLayout,
  type _impliedLayoutName,
  type _isConditionalLayout,
  type _isIncludeLayout,
  type _layoutForOption,
  type _normalizeLayout,
  _prefixes,
  type _processRenderTemplateOptions,
  type _writeLayoutMethod,
  type isActionHasLayout,
  type layout,
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
  type _normalizeArgs,
  type _processFormat,
  buildViewContextClass,
  isInheritViewContextClass,
  viewContext,
  viewContextClass,
  viewRenderer,
} from "@blazetrails/actionview";
import { Streaming, type _renderTemplate } from "./metal/streaming.js";
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
import {
  PermissionsPolicy,
  type ClassMethods as PermissionsPolicyClassMethods,
} from "./metal/permissions-policy.js";
import {
  RateLimiting,
  type ClassMethods as RateLimitingClassMethods,
} from "./metal/rate-limiting.js";
import { Logging, type logAt } from "./metal/logging.js";
import type { LoggerHost } from "../abstract-controller/logger.js";
import { AssetPaths } from "../abstract-controller/asset-paths.js";
import { Instrumentation, type logProcessAction } from "./metal/instrumentation.js";
import { Redirecting } from "./metal/redirecting.js";
import {
  ContentSecurityPolicy,
  type contentSecurityPolicy,
  type contentSecurityPolicyNonce,
  type contentSecurityPolicyReportOnly,
  type currentContentSecurityPolicy,
  type isContentSecurityPolicy,
} from "./metal/content-security-policy.js";
import { type Resolution, type HelpersClass } from "../abstract-controller/helpers.js";
import { Helpers, type helperAttr, type modulesForHelpers } from "./metal/helpers.js";
import { FormBuilder, type defaultFormBuilder } from "./form-builder.js";
import { instrumentPayload, instrumentName } from "./caching.js";
import {
  Caching,
  type cache,
  type viewCacheDependencies,
  type viewCacheDependency,
} from "../abstract-controller/caching.js";
import type {
  combinedFragmentCacheKey,
  expireFragment,
  fragmentCacheKey,
  fragmentExist,
  readFragment,
  writeFragment,
} from "../abstract-controller/caching/fragments.js";
import { HttpAuthentication } from "./metal/http-authentication.js";
import { DataStreaming, type sendFileHeadersBang } from "./metal/data-streaming.js";
import {
  Options as ParamsWrapperOptions,
  ParamsWrapper,
  type _setWrapperOptions,
  type wrapParameters,
} from "./metal/params-wrapper.js";
import {
  _processOptions,
  _setHtmlContentType,
  _setRenderedContentType,
  _setVaryHeader,
  _processVariant,
  _normalizeOptions,
  Rendering,
  renderToString,
} from "./metal/rendering.js";
import type { Renderer } from "./renderer.js";
import { Renderers, _renderToBodyWithRenderer } from "./metal/renderers.js";
import { UrlFor, type urlOptions } from "./metal/url-for.js";
import type { UrlForOptions } from "../action-dispatch/routing/url-for.js";
import type {
  PolymorphicArg,
  PolymorphicOptions,
} from "../action-dispatch/routing/polymorphic-routes.js";
import { Cookies } from "./metal/cookies.js";
import {
  appendInfoToPayload,
  cleanupViewRuntime,
  haltedCallbackHook,
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
import {
  Translation,
  type l,
  type localize,
  type t,
  type translate,
} from "../abstract-controller/translation.js";

export { type ActionCallback, type AroundCallback, type CallbackOptions };

export interface RenderOptions {
  json?: unknown;
  js?: unknown;
  xml?: unknown;
  plain?: string | number | boolean | null;
  html?: string | SafeBuffer;
  body?: string | Buffer;
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

declare class RequestForgeryProtectionPrivate {
  /** @internal */
  protected verifyAuthenticityToken(): void;
  /** @internal */
  protected verifySameOriginRequest(): void;
  /** @internal */
  protected formAuthenticityToken(options?: {
    formOptions?: { action?: string; method?: string };
  }): string;
  /** @internal */
  protected isProtectAgainstForgery(): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Base
  extends
    Included<typeof HttpAuthentication.Basic.ControllerMethods>,
    Included<typeof HttpAuthentication.Digest.ControllerMethods>,
    Included<typeof HttpAuthentication.Token.ControllerMethods>,
    RequestForgeryProtectionPrivate {
  render<P extends string = string>(...args: RenderArgs<P>): void | Promise<void>;
  /** @internal */
  renderToBody(options?: Record<string, unknown>): unknown;
  get params(): StrongParameters;
  set params(value: StrongParameters | Record<string, unknown>);
  viewRuntime: number | null;
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
  urlFrom: typeof urlFrom;
  _computeRedirectToLocation: typeof _computeRedirectToLocation;
  allowForgeryProtection: boolean;
  csrfTokenStorageStrategy: RequestForgeryProtectionHost["csrfTokenStorageStrategy"];
  resetCsrfToken: typeof resetCsrfToken;
  commitCsrfToken: typeof commitCsrfToken;
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

  declare static layout: OmitThisParameter<typeof layout>;
  declare static _writeLayoutMethod: OmitThisParameter<typeof _writeLayoutMethod>;
  /** @internal */
  declare static _impliedLayoutName: OmitThisParameter<typeof _impliedLayoutName>;
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

  declare static helpersPath: string | string[];
  declare static isHelpersPath: boolean;
  declare static includeAllHelpers: boolean;
  declare static raiseOnOpenRedirects: boolean;
  declare static isIncludeAllHelpers: boolean;

  declare static _helpers: Module;
  declare readonly _helpers: Module;
  declare static _helperMethods: string[];
  declare static helperMethod: HelpersClass["helperMethod"];
  declare static helper: HelpersClass["helper"];
  declare static clearHelpers: HelpersClass["clearHelpers"];
  declare static _helpersForModification: HelpersClass["_helpersForModification"];
  /** @internal */
  declare static defineHelpersModule: HelpersClass["defineHelpersModule"];
  /** @internal */
  declare static defaultHelperModuleBang: HelpersClass["defaultHelperModuleBang"];
  declare static allHelpersFromPath: (typeof Resolution)["allHelpersFromPath"];
  declare static helperModulesFromPaths: (typeof Resolution)["helperModulesFromPaths"];
  declare static helperAttr: OmitThisParameter<typeof helperAttr>;
  declare static helpers: () => ActionViewBase;
  declare static modulesForHelpers: OmitThisParameter<typeof modulesForHelpers>;
  declare static viewCacheDependency: OmitThisParameter<typeof viewCacheDependency>;
  declare static fragmentCacheKey: OmitThisParameter<typeof fragmentCacheKey>;
  /** @internal */
  declare _helperProxy?: ActionViewBase | null;

  constructor(...args: unknown[]) {
    super(...(args as []));
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

  static withoutModules(...modules: string[]): readonly string[] {
    const drop = new Set(modules);
    return MODULES.filter((m) => !drop.has(m));
  }

  /** @internal */
  _protectedIvars(): readonly string[] {
    return PROTECTED_IVARS;
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

  declare translate: OmitThisParameter<typeof translate>;
  declare t: OmitThisParameter<typeof t>;
  declare localize: OmitThisParameter<typeof localize>;
  declare l: OmitThisParameter<typeof l>;

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
  declare static protectFromForgery: OmitThisParameter<typeof protectFromForgery>;
  declare static skipForgeryProtection: OmitThisParameter<typeof skipForgeryProtection>;
  /** @internal */
  declare static protectionMethodClass: RequestForgeryProtectionHost["protectionMethodClass"];
  /** @internal */
  declare static storageStrategy: RequestForgeryProtectionHost["storageStrategy"];
  /** @internal */
  declare static isStorageStrategy: RequestForgeryProtectionHost["isStorageStrategy"];

  declare static allowBrowser: OmitThisParameter<(typeof AllowBrowserClassMethods)["allowBrowser"]>;

  declare static permissionsPolicy: OmitThisParameter<
    (typeof PermissionsPolicyClassMethods)["permissionsPolicy"]
  >;

  declare static contentSecurityPolicy: OmitThisParameter<typeof contentSecurityPolicy>;
  declare static contentSecurityPolicyReportOnly: OmitThisParameter<
    typeof contentSecurityPolicyReportOnly
  >;
  /** @internal */
  declare isContentSecurityPolicy: OmitThisParameter<typeof isContentSecurityPolicy>;
  /** @internal */
  declare contentSecurityPolicyNonce: OmitThisParameter<typeof contentSecurityPolicyNonce>;
  /** @internal */
  declare currentContentSecurityPolicy: OmitThisParameter<typeof currentContentSecurityPolicy>;

  declare static rateLimit: OmitThisParameter<(typeof RateLimitingClassMethods)["rateLimit"]>;

  declare static logAt: OmitThisParameter<typeof logAt>;
  declare static logProcessAction: typeof logProcessAction;
  declare static renderer: Renderer;
  declare static setupRendererBang: () => void;

  declare static _defaultFormBuilder: unknown;
  declare static defaultFormBuilder: OmitThisParameter<typeof defaultFormBuilder>;
  declare defaultFormBuilder: () => unknown;

  /** @internal */
  instrumentPayload(key: unknown): { controller: string | null; action: string; key: unknown } {
    return instrumentPayload.call(this, key);
  }

  /** @internal */
  instrumentName(): string {
    return instrumentName.call(this);
  }

  declare static _parameterEncodings: ParameterEncodingHost["_parameterEncodings"];
  /** @internal */
  declare static setupParamEncode: typeof ParameterEncoding.ClassMethods.setupParamEncode;
  /** @internal */
  declare static actionEncodingTemplate: typeof ParameterEncoding.ClassMethods.actionEncodingTemplate;
  declare static skipParameterEncoding: typeof ParameterEncoding.ClassMethods.skipParameterEncoding;
  declare static paramEncoding: typeof ParameterEncoding.ClassMethods.paramEncoding;

  declare static _wrapperOptions: ParamsWrapperOptions;
  declare _wrapperOptions: ParamsWrapperOptions;
  /** @internal */
  declare static _setWrapperOptions: OmitThisParameter<typeof _setWrapperOptions>;
  declare static wrapParameters: OmitThisParameter<typeof wrapParameters>;

  declare static httpBasicAuthenticateWith: OmitThisParameter<
    typeof HttpAuthentication.Basic.ControllerMethods.ClassMethods.httpBasicAuthenticateWith
  >;

  declare static rescueHandlers: unknown[][];
  declare static rescueFrom: OmitThisParameter<typeof Rescuable.ClassMethods.rescueFrom>;
  declare static rescueWithHandler: OmitThisParameter<
    typeof Rescuable.ClassMethods.rescueWithHandler
  >;
  declare static handlerForRescue: OmitThisParameter<
    typeof Rescuable.ClassMethods.handlerForRescue
  >;

  declare freshWhen: typeof freshWhen;
  declare isStale: typeof isStale;
  declare expiresIn: typeof expiresIn;
  declare expiresNow: typeof expiresNow;
  declare httpCacheForever: typeof httpCacheForever;
  declare noStore: typeof noStore;
  /** @internal */
  declare combineEtags: typeof combineEtags;
  declare head: OmitThisParameter<typeof head>;

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

  declare rescueWithHandler: Rescuable["rescueWithHandler"];
  declare handlerForRescue: Rescuable["handlerForRescue"];
}

include(Base, AbstractControllerRendering);
include(Base, Translation);
include(Base, AssetPaths);
include(Base, Helpers);
include(Base, UrlFor);
include(Base, Redirecting);
include(Base, Layouts);
extend(Base, ViewPathsClassMethods);
include(Base, Rendering);
include(Base, Renderers.All);
include(Base, ConditionalGet);
include(Base, EtagWithTemplateDigest);
include(Base, EtagWithFlash);
include(Base, Caching);
include(Base, ImplicitRender);
include(Base, StrongParametersModule);
extend(Base, ParameterEncoding.ClassMethods);
include(Base, Cookies);
include(Base, Flash);
include(Base, FormBuilder);
include(Base, RequestForgeryProtection);
include(Base, ContentSecurityPolicy);
include(Base, PermissionsPolicy);
include(Base, RateLimiting);
include(Base, AllowBrowser);
include(Base, Streaming);
include(Base, DataStreaming);
include(Base, HttpAuthentication.Basic.ControllerMethods);
include(Base, HttpAuthentication.Digest.ControllerMethods);
include(Base, HttpAuthentication.Token.ControllerMethods);
include(Base, DefaultHeaders);
include(Base, Logging);
include(Base, Rescue);
include(Base, Instrumentation);
include(Base, ParamsWrapper);
Base.setupRendererBang();

runLoadHooks("action_controller_base", Base);
runLoadHooks("action_controller", Base);

export { DoubleRenderError };
