import { Autoload, TopLevel, extend, onLoad, type Extended } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Base, DetailsKey, Template } from "@blazetrails/actionview";
import { Mime, MimeType } from "./action-dispatch/http/mime-type.js";
import type { Parameters } from "./action-controller/metal/strong-parameters.js";
import type { TemplateAssertions } from "./action-controller/template-assertions.js";
import type { Testing } from "./action-controller/metal/testing.js";
import type { TestCase, TestRequest } from "./action-controller/test-case.js";
import type { Request } from "./action-dispatch/http/request.js";
import type { Assertions } from "./action-dispatch/testing/assertions.js";
import type { TestProcess } from "./action-dispatch/testing/test-process.js";
import type * as PolymorphicRoutes from "./action-dispatch/routing/polymorphic-routes.js";
import type { RoutesProxy } from "./action-dispatch/routing/routes-proxy.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "action_controller/metal/testing": () => import("./action-controller/metal/testing.js"),
  "action_controller/test_case": () => import("./action-controller/test-case.js"),
  "action_dispatch/http/request": () => import("./action-dispatch/http/request.js"),
  "action_dispatch/testing/assertions": () => import("./action-dispatch/testing/assertions.js"),
  "action_dispatch/testing/test_process": () => import("./action-dispatch/testing/test-process.js"),
  "action_dispatch/routing/polymorphic_routes": () =>
    import("./action-dispatch/routing/polymorphic-routes.js"),
  "action_dispatch/routing/routes_proxy": () => import("./action-dispatch/routing/routes-proxy.js"),
};

export const ActionDispatch = {
  name: "ActionDispatch",
  loadPath,
  testApp: null,
} as AutoloadModule & {
  Request: typeof Request;
  Routing: typeof Routing;
  Assertions: typeof Assertions;
  TestProcess: typeof TestProcess;
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

export const ActionController = { name: "ActionController", loadPath } as AutoloadModule & {
  Parameters: typeof Parameters;
  TestCase: typeof TestCase;
  TestRequest: typeof TestRequest;
  TemplateAssertions: typeof TemplateAssertions;
  Testing: typeof Testing;
};
extend(ActionController, Autoload);
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
