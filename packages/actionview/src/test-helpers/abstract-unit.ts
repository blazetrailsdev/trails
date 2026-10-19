import { ActionController, ActionDispatch, RouteSet, UrlFor } from "@blazetrails/actionpack";
import { RoutingUrlFor } from "../routing-url-for.js";
import { File, include, rbObjSingletonClass } from "@blazetrails/ruby-compat";

type DrawCallback = Parameters<RouteSet["draw"]>[0];

declare module "@blazetrails/actionpack" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Ruby reopens `class ActionController::TestCase` (`actionview/test/abstract_unit.rb:116-127`) to add `self.with_routes`; a namespace merged onto the class is how an added static surfaces on the type side.
  namespace ActionController {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- see above.
    namespace TestCase {
      let withRoutes: (block: DrawCallback) => void;
    }
    // eslint-disable-next-line @typescript-eslint/no-namespace -- Ruby reopens `class ActionController::Base` (`actionview/test/abstract_unit.rb:107-114`) to add `self.test_routes`.
    namespace Base {
      let testRoutes: (block: DrawCallback) => RouteSet;
    }
  }
}

const __dir__ = decodeURIComponent(new URL(".", import.meta.url).pathname);

export const FIXTURE_LOAD_PATH = File.expandPath("fixtures", __dir__);

RoutingUrlFor.include(UrlFor);

ActionController.Base.viewPaths(FIXTURE_LOAD_PATH);

ActionController.Base.testRoutes = function (
  this: typeof ActionController.Base,
  block: DrawCallback,
): RouteSet {
  const routes = new RouteSet();
  routes.draw(block);
  include(this, routes.urlHelpers());
  return routes;
};

include(ActionController.TestCase, ActionDispatch.TestProcess);

ActionController.TestCase.withRoutes = function (
  this: typeof ActionController.TestCase,
  block: DrawCallback,
): void {
  this.setup(function (this: InstanceType<typeof ActionController.TestCase>) {
    this.routes = new RouteSet();
    this.routes.draw(block);

    if (this.controller) {
      include(rbObjSingletonClass(this.controller), this.routes.urlHelpers());
    }
  });
};
