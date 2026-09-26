import { Autoload, TopLevel, extend, onLoad, type Extended } from "@blazetrails/activesupport";
import { Base, DetailsKey, Template } from "@blazetrails/actionview";
import { Mime, MimeType } from "./action-dispatch/http/mime-type.js";
import type { Parameters } from "./action-controller/metal/strong-parameters.js";
import type { Request } from "./action-dispatch/http/request.js";
import type * as PolymorphicRoutes from "./action-dispatch/routing/polymorphic-routes.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "action_dispatch/http/request": () => import("./action-dispatch/http/request.js"),
  "action_dispatch/routing/polymorphic_routes": () =>
    import("./action-dispatch/routing/polymorphic-routes.js"),
};

export const ActionDispatch = {
  name: "ActionDispatch",
  loadPath,
  testApp: null,
} as AutoloadModule & {
  Request: typeof Request;
  Routing: typeof Routing;
  testApp: unknown;
};
extend(ActionDispatch, Autoload);
ActionDispatch.eagerAutoload(() => {
  ActionDispatch.autoloadUnder("http", () => {
    ActionDispatch.autoload("Request");
  });
});

export const Routing = { name: "ActionDispatch::Routing", loadPath } as AutoloadModule & {
  PolymorphicRoutes: typeof PolymorphicRoutes;
};
extend(Routing, Autoload);
Routing.autoload("PolymorphicRoutes");
ActionDispatch.Routing = Routing;

export const ActionController = { name: "ActionController", loadPath } as AutoloadModule & {
  Parameters: typeof Parameters;
};
extend(ActionController, Autoload);

TopLevel.ActionDispatch = ActionDispatch;
TopLevel.ActionController = ActionController;

onLoad("action_view", () => {
  Base.defaultFormats ??= MimeType.SET.symbols;
  Template.mimeTypesImplementation = Mime;
  DetailsKey.clear();
});
