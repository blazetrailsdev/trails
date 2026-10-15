import {
  Autoload,
  TopLevel,
  camelize,
  extend,
  onLoad,
  type Extended,
} from "@blazetrails/activesupport";
import { NameError, RuntimeError, rbModConstGet, registerConstant } from "@blazetrails/ruby-compat";
import { Base, DetailsKey, Template } from "@blazetrails/actionview";
import { Mime, MimeType } from "./action-dispatch/http/mime-type.js";
import type { Base as ControllerBase } from "./action-controller/base.js";
import type { Parameters } from "./action-controller/metal/strong-parameters.js";
import type { TemplateAssertions } from "./action-controller/template-assertions.js";
import type { Testing } from "./action-controller/metal/testing.js";
import type { TestCase, TestRequest } from "./action-controller/test-case.js";
import type { MissingController, Request } from "./action-dispatch/http/request.js";
import type { Assertions } from "./action-dispatch/testing/assertions.js";
import type { TestProcess } from "./action-dispatch/testing/test-process.js";
import type * as PolymorphicRoutes from "./action-dispatch/routing/polymorphic-routes.js";
import type { RoutesProxy } from "./action-dispatch/routing/routes-proxy.js";
import type {
  AbstractSecureStore,
  AbstractStore,
} from "./action-dispatch/middleware/session/abstract-store.js";
import type { CacheStore } from "./action-dispatch/middleware/session/cache-store.js";
import type { CookieStore } from "./action-dispatch/middleware/session/cookie-store.js";
import type { MemCacheStore } from "./action-dispatch/middleware/session/mem-cache-store.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "action_controller/base": () => import("./action-controller/base.js"),
  "action_controller/metal/testing": () => import("./action-controller/metal/testing.js"),
  "action_controller/test_case": () => import("./action-controller/test-case.js"),
  "action_dispatch/http/request": () => import("./action-dispatch/http/request.js"),
  "action_dispatch/testing/assertions": () => import("./action-dispatch/testing/assertions.js"),
  "action_dispatch/testing/test_process": () => import("./action-dispatch/testing/test-process.js"),
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
  MissingController: typeof MissingController;
  Routing: typeof Routing;
  Assertions: typeof Assertions;
  TestProcess: typeof TestProcess;
  Session: typeof Session;
  testApp: unknown;
};
extend(ActionDispatch, Autoload);
ActionDispatch.eagerAutoload(() => {
  ActionDispatch.autoloadUnder("http", () => {
    ActionDispatch.autoload("Request");
  });
});

ActionDispatch.autoloadUnder("testing", () => {
  ActionDispatch.autoload("Assertions");
  ActionDispatch.autoload("TestProcess");
});

export const Routing = { name: "ActionDispatch::Routing", loadPath } as AutoloadModule & {
  PolymorphicRoutes: typeof PolymorphicRoutes;
  RoutesProxy: typeof RoutesProxy;
};
extend(Routing, Autoload);
Routing.eagerAutoload(() => {
  Routing.autoload("RoutesProxy");
});
Routing.autoload("PolymorphicRoutes");
ActionDispatch.Routing = Routing;

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
  const name = sessionStore.startsWith(":") ? sessionStore.slice(1) : sessionStore;
  try {
    return rbModConstGet(this, camelize(name));
  } catch (e) {
    if (!(e instanceof NameError)) throw e;
    throw new RuntimeError(
      `Unable to resolve session store ${sessionStore}.\n` +
        `\n` +
        `${sessionStore} resolves to ActionDispatch::Session::${camelize(name)},\n` +
        `but that class is undefined.\n` +
        `\n` +
        `Is ${sessionStore} spelled correctly, and are any necessary gems installed?\n`,
    );
  }
};
ActionDispatch.Session = Session;

export const ActionController = { name: "ActionController", loadPath } as AutoloadModule & {
  Base: typeof ControllerBase;
  Parameters: typeof Parameters;
  TestCase: typeof TestCase;
  TestRequest: typeof TestRequest;
  TemplateAssertions: typeof TemplateAssertions;
  Testing: typeof Testing;
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
