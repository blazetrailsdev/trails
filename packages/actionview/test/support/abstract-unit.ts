import { ActionController, ActionDispatch, RouteSet, UrlFor } from "@blazetrails/actionpack";
import { TestCase } from "@blazetrails/actionpack/testing";
import { RoutingUrlFor } from "../../lib/routing-url-for.js";
import { I18n } from "@blazetrails/activesupport";
import { File, include, rbObjSingletonClass } from "@blazetrails/ruby-compat";

type DrawCallback = Parameters<RouteSet["draw"]>[0];

declare module "@blazetrails/actionpack/testing" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Ruby reopens `class ActionController::TestCase` (`actionview/test/abstract_unit.rb:116-127`) to add `self.with_routes`; a namespace merged onto the class is how an added static surfaces on the type side.
  namespace TestCase {
    let withRoutes: (block: DrawCallback) => void;
  }
}

declare module "@blazetrails/actionpack" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- see above.
  namespace ActionController {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- Ruby reopens `class ActionController::Base` (`actionview/test/abstract_unit.rb:107-114`) to add `self.test_routes`.
    namespace Base {
      let testRoutes: (block: DrawCallback) => RouteSet;
    }
  }
}

const __dir__ = decodeURIComponent(new URL(".", import.meta.url).pathname);

I18n.setEnforceAvailableLocales(false);

export const ORIGINAL_LOCALES = I18n.availableLocales().map(String).sort();

export const FIXTURE_LOAD_PATH = File.expandPath("../fixtures", __dir__);

include(RoutingUrlFor, UrlFor);

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

include(TestCase, ActionDispatch.TestProcess);

TestCase.withRoutes = function (this: typeof TestCase, block: DrawCallback): void {
  this.setup(function (this: InstanceType<typeof TestCase>) {
    this.routes = new RouteSet();
    this.routes.draw(block);

    if (this.controller) {
      include(rbObjSingletonClass(this.controller), this.routes.urlHelpers());
    }
  });
};
