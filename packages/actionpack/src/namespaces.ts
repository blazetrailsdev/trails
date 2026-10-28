import {
  Autoload,
  TopLevel,
  camelize,
  extend,
  onLoad,
  type Deprecation,
  type Extended,
} from "@blazetrails/activesupport";
import {
  NameError,
  RuntimeError,
  rbInspect,
  rbModConstGet,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { Base, DetailsKey, Template } from "@blazetrails/actionview";
import { Mime, MimeType } from "./action-dispatch/http/mime-type.js";
import type { Base as ControllerBase } from "./action-controller/base.js";
import type { Parameters } from "./action-controller/metal/strong-parameters.js";
import type { MimeNegotiation } from "./action-dispatch/http/mime-negotiation.js";
import type { Parameters as HttpParameters } from "./action-dispatch/http/parameters.js";
import type { TemplateAssertions } from "./action-controller/template-assertions.js";
import type { Testing } from "./action-controller/metal/testing.js";
import type { UrlFor } from "./action-dispatch/routing/url-for.js";
import type { TestCase, TestRequest } from "./action-controller/test-case.js";
import type { MissingController, Request } from "./action-dispatch/http/request.js";
import type { Assertions } from "./action-dispatch/testing/assertions.js";
import type { TestProcess } from "./action-dispatch/testing/test-process.js";
import type { TestResponse } from "./action-dispatch/testing/test-response.js";
import type {
  IntegrationTest,
  Session as IntegrationSession,
} from "./action-dispatch/testing/integration.js";
import type { TestRequest as DispatchTestRequest } from "./action-dispatch/testing/test-request.js";
import type { AssertionResponse } from "./action-dispatch/testing/assertion-response.js";
import type * as PolymorphicRoutes from "./action-dispatch/routing/polymorphic-routes.js";
import type { RoutesProxy } from "./action-dispatch/routing/routes-proxy.js";
import type { ActionableExceptions } from "./action-dispatch/middleware/actionable-exceptions.js";
import type { HtmlTableFormatter } from "./action-dispatch/routing/inspector.js";
import type {
  AbstractSecureStore,
  AbstractStore,
} from "./action-dispatch/middleware/session/abstract-store.js";
import type { CacheStore } from "./action-dispatch/middleware/session/cache-store.js";
import type { CookieStore } from "./action-dispatch/middleware/session/cookie-store.js";
import type { Caching } from "./action-controller/caching.js";
import type { ApiRendering } from "./action-controller/api/api-rendering.js";
import type { FormBuilder } from "./action-controller/form-builder.js";
import type { DataStreaming } from "./action-controller/metal/data-streaming.js";
import type { ImplicitRender } from "./action-controller/metal/implicit-render.js";
import type { EtagWithFlash } from "./action-controller/metal/etag-with-flash.js";
import type { ConditionalGet } from "./action-controller/metal/conditional-get.js";
import type { ContentSecurityPolicy } from "./action-controller/metal/content-security-policy.js";
import type { Flash } from "./action-controller/metal/flash.js";
import type { ParamsWrapper } from "./action-controller/metal/params-wrapper.js";
import type { UrlFor as ControllerUrlFor } from "./action-controller/metal/url-for.js";
import type { Helpers } from "./action-controller/metal/helpers.js";
import type { BasicImplicitRender } from "./action-controller/metal/basic-implicit-render.js";
import type { Logging } from "./action-controller/metal/logging.js";
import type { AllowBrowser } from "./action-controller/metal/allow-browser.js";
import type { ParameterEncoding } from "./action-controller/metal/parameter-encoding.js";
import type { Redirecting } from "./action-controller/metal/redirecting.js";
import type { EtagWithTemplateDigest } from "./action-controller/metal/etag-with-template-digest.js";
import type { Instrumentation } from "./action-controller/metal/instrumentation.js";
import type { StrongParameters } from "./action-controller/metal/strong-parameters.js";
import type { RateLimiting } from "./action-controller/metal/rate-limiting.js";
import type { PermissionsPolicy } from "./action-controller/metal/permissions-policy.js";
import type { Rescue } from "./action-controller/metal/rescue.js";
import type { RequestForgeryProtection } from "./action-controller/metal/request-forgery-protection.js";
import type { DefaultHeaders } from "./action-controller/metal/default-headers.js";
import type { HttpAuthentication } from "./action-controller/metal/http-authentication.js";
import type { Rendering } from "./action-controller/metal/rendering.js";
import type { Cookies } from "./action-controller/metal/cookies.js";
import type { Streaming } from "./action-controller/metal/streaming.js";
import type { MimeResponds } from "./action-controller/metal/mime-responds.js";
import type { Renderers } from "./action-controller/metal/renderers.js";
import type { MemCacheStore } from "./action-dispatch/middleware/session/mem-cache-store.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "action_controller/base": () => import("./action-controller/base.js"),
  "action_controller/metal/testing": () => import("./action-controller/metal/testing.js"),
  "action_controller/test_case": () => import("./action-controller/test-case.js"),
  "action_dispatch/http/request": () => import("./action-dispatch/http/request.js"),
  "action_dispatch/testing/assertions": () => import("./action-dispatch/testing/assertions.js"),
  "action_dispatch/testing/test_process": () => import("./action-dispatch/testing/test-process.js"),
  "action_dispatch/testing/integration": () => import("./action-dispatch/testing/integration.js"),
  "action_dispatch/testing/test_request": () => import("./action-dispatch/testing/test-request.js"),
  "action_dispatch/testing/assertion_response": () =>
    import("./action-dispatch/testing/assertion-response.js"),
  "action_dispatch/routing/polymorphic_routes": () =>
    import("./action-dispatch/routing/polymorphic-routes.js"),
  "action_dispatch/routing/routes_proxy": () => import("./action-dispatch/routing/routes-proxy.js"),
  "action_dispatch/middleware/session/abstract_store": () =>
    import("./action-dispatch/middleware/session/abstract-store.js"),
  "action_dispatch/middleware/session/cookie_store": () =>
    import("./action-dispatch/middleware/session/cookie-store.js"),
  "action_dispatch/middleware/session/mem_cache_store": () =>
    import("./action-dispatch/middleware/session/mem-cache-store.js"),
  "action_dispatch/middleware/session/cache_store": () =>
    import("./action-dispatch/middleware/session/cache-store.js"),
};

export const ActionDispatch = {
  name: "ActionDispatch",
  loadPath,
  testApp: null,
} as AutoloadModule & {
  Request: typeof Request;
  ActionableExceptions: typeof ActionableExceptions;
  MissingController: typeof MissingController;
  Routing: typeof Routing;
  Assertions: typeof Assertions;
  IntegrationTest: typeof IntegrationTest;
  TestProcess: typeof TestProcess;
  TestRequest: typeof DispatchTestRequest;
  TestResponse: typeof TestResponse;
  AssertionResponse: typeof AssertionResponse;
  Integration: { name: string; Session: typeof IntegrationSession };
  Session: typeof Session;
  Http: typeof Http;
  testApp: unknown;
  deprecator: () => Deprecation;
};
extend(ActionDispatch, Autoload);
ActionDispatch.eagerAutoload(() => {
  ActionDispatch.autoloadUnder("http", () => {
    ActionDispatch.autoload("Request");
  });
});

ActionDispatch.autoloadUnder("testing", () => {
  ActionDispatch.autoload("Assertions");
  ActionDispatch.autoload("Integration");
  ActionDispatch.autoload("IntegrationTest", "action_dispatch/testing/integration");
  ActionDispatch.autoload("TestProcess");
  ActionDispatch.autoload("TestRequest");
  ActionDispatch.autoload("TestResponse");
  ActionDispatch.autoload("AssertionResponse");
});

export const Routing = { name: "ActionDispatch::Routing", loadPath } as AutoloadModule & {
  PolymorphicRoutes: typeof PolymorphicRoutes;
  RoutesProxy: typeof RoutesProxy;
  UrlFor: typeof UrlFor;
  HtmlTableFormatter: typeof HtmlTableFormatter;
};
extend(Routing, Autoload);
Routing.eagerAutoload(() => {
  Routing.autoload("RoutesProxy");
});
Routing.autoload("PolymorphicRoutes");
ActionDispatch.Routing = Routing;

export const Http = { name: "ActionDispatch::Http" } as {
  name: string;
  MimeNegotiation: typeof MimeNegotiation;
  Parameters: typeof HttpParameters;
};
ActionDispatch.Http = Http;

export const Session = { name: "ActionDispatch::Session", loadPath } as AutoloadModule & {
  AbstractStore: typeof AbstractStore;
  AbstractSecureStore: typeof AbstractSecureStore;
  CookieStore: typeof CookieStore;
  MemCacheStore: typeof MemCacheStore;
  CacheStore: typeof CacheStore;
  resolveStore(sessionStore: string): unknown;
};
extend(Session, Autoload);
Session.autoload("AbstractStore", "action_dispatch/middleware/session/abstract_store");
Session.autoload("AbstractSecureStore", "action_dispatch/middleware/session/abstract_store");
Session.autoload("CookieStore", "action_dispatch/middleware/session/cookie_store");
Session.autoload("MemCacheStore", "action_dispatch/middleware/session/mem_cache_store");
Session.autoload("CacheStore", "action_dispatch/middleware/session/cache_store");

Session.resolveStore = function (sessionStore: string): unknown {
  const isSymbol = sessionStore.startsWith(":");
  const camelized = camelize(isSymbol ? sessionStore.slice(1) : sessionStore);
  const inspected = isSymbol ? sessionStore : rbInspect(sessionStore);
  try {
    return rbModConstGet(this, camelized);
  } catch (e) {
    if (!(e instanceof NameError)) throw e;
    throw new RuntimeError(
      `Unable to resolve session store ${inspected}.\n` +
        `\n` +
        `${inspected} resolves to ActionDispatch::Session::${camelized},\n` +
        `but that class is undefined.\n` +
        `\n` +
        `Is ${inspected} spelled correctly, and are any necessary gems installed?\n`,
    );
  }
};
ActionDispatch.Session = Session;

export const AbstractController = { name: "AbstractController" };
registerConstant("AbstractController", AbstractController);

export const ActionController = { name: "ActionController", loadPath } as AutoloadModule & {
  Base: typeof ControllerBase;
  Parameters: typeof Parameters;
  TestCase: typeof TestCase;
  TestRequest: typeof TestRequest;
  TemplateAssertions: typeof TemplateAssertions;
  Testing: typeof Testing;
  Caching: typeof Caching;
  ApiRendering: typeof ApiRendering;
  FormBuilder: typeof FormBuilder;
  DataStreaming: typeof DataStreaming;
  ImplicitRender: typeof ImplicitRender;
  EtagWithFlash: typeof EtagWithFlash;
  ConditionalGet: typeof ConditionalGet;
  ContentSecurityPolicy: typeof ContentSecurityPolicy;
  Flash: typeof Flash;
  ParamsWrapper: typeof ParamsWrapper;
  UrlFor: typeof ControllerUrlFor;
  Helpers: typeof Helpers;
  BasicImplicitRender: typeof BasicImplicitRender;
  Logging: typeof Logging;
  AllowBrowser: typeof AllowBrowser;
  ParameterEncoding: typeof ParameterEncoding;
  Redirecting: typeof Redirecting;
  EtagWithTemplateDigest: typeof EtagWithTemplateDigest;
  Instrumentation: typeof Instrumentation;
  StrongParameters: typeof StrongParameters;
  RateLimiting: typeof RateLimiting;
  PermissionsPolicy: typeof PermissionsPolicy;
  Rescue: typeof Rescue;
  RequestForgeryProtection: typeof RequestForgeryProtection;
  DefaultHeaders: typeof DefaultHeaders;
  HttpAuthentication: typeof HttpAuthentication;
  Rendering: typeof Rendering;
  Cookies: typeof Cookies;
  Streaming: typeof Streaming;
  MimeResponds: typeof MimeResponds;
  Renderers: typeof Renderers;
};
extend(ActionController, Autoload);
ActionController.autoload("Base");
ActionController.autoloadUnder("metal", () => {
  ActionController.autoload("Testing");
});
ActionController.autoloadAt("action_controller/test_case", () => {
  ActionController.autoload("TestCase");
  ActionController.autoload("TestRequest");
  ActionController.autoload("TemplateAssertions");
});

TopLevel.ActionDispatch = ActionDispatch;
TopLevel.ActionController = ActionController;
registerConstant("ActionController", ActionController);

onLoad("action_view", () => {
  Base.defaultFormats ??= MimeType.SET.symbols;
  Template.mimeTypesImplementation = Mime;
  DetailsKey.clear();
});
