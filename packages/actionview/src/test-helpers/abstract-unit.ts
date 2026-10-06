import { ActionController, RouteSet } from "@blazetrails/actionpack";
import { include, rbObjSingletonClass } from "@blazetrails/ruby-compat";

type DrawCallback = Parameters<RouteSet["draw"]>[0];

declare module "@blazetrails/actionpack" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Ruby reopens `class ActionController::TestCase` (`actionview/test/abstract_unit.rb:116-127`) to add `self.with_routes`; a namespace merged onto the class is how an added static surfaces on the type side.
  namespace ActionController {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- see above.
    namespace TestCase {
      let withRoutes: (block: DrawCallback) => void;
    }
  }
}

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
