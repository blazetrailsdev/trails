import { ActionController, ActionDispatch, RouteSet, UrlFor } from "@blazetrails/actionpack";
import { TestCase } from "@blazetrails/actionpack/testing";
import { RoutingUrlFor } from "../../lib/routing-url-for.js";
import { I18n } from "@blazetrails/activesupport";
import { File, include, rbObjSingletonClass } from "@blazetrails/ruby-compat";

type DrawCallback = Parameters<RouteSet["draw"]>[0];

declare module "@blazetrails/actionpack/testing" {
  namespace TestCase {
    let withRoutes: (block: DrawCallback) => void;
  }
}

declare module "@blazetrails/actionpack" {
  namespace ActionController {
    namespace Base {
      let testRoutes: (block: DrawCallback) => RouteSet;
    }
  }
}

const __dir__ = decodeURIComponent(new URL(".", import.meta.url).pathname);

I18n.setEnforceAvailableLocales(false);

export const ORIGINAL_LOCALES = I18n.availableLocales().map(String).sort();

export const FIXTURE_LOAD_PATH = File.expandPath("../fixtures", __dir__);

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
