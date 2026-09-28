import { Dir } from "@blazetrails/ruby-compat";
import {
  bodyFromString,
  Head,
  MethodOverride,
  type RackEnv,
  type RackResponse,
} from "@blazetrails/rack";
import { Metal } from "../action-controller/metal.js";
import { deprecator } from "../action-dispatch/deprecator.js";
import { Request } from "../action-dispatch/http/request.js";
import type { Response } from "../action-dispatch/http/response.js";
import { ActionableExceptions } from "../action-dispatch/middleware/actionable-exceptions.js";
import { Callbacks } from "../action-dispatch/middleware/callbacks.js";
import { Cookies } from "../action-dispatch/middleware/cookies.js";
import { DebugExceptions } from "../action-dispatch/middleware/debug-exceptions.js";
import { Flash } from "../action-dispatch/middleware/flash.js";
import { PublicExceptions } from "../action-dispatch/middleware/public-exceptions.js";
import { ShowExceptions } from "../action-dispatch/middleware/show-exceptions.js";
import {
  MiddlewareStack,
  type MiddlewareFactory,
  type RackApp,
} from "../action-dispatch/middleware/stack.js";
import { RouteSet, type Config as RouteSetConfig } from "../action-dispatch/routing/route-set.js";
import { IntegrationTest } from "../action-dispatch/testing/integration.js";

export const ActionPackTestSuiteUtils = {
  async requireHelpers(helpersDirs: string | string[]): Promise<void> {
    for (const helpersDir of ([] as string[]).concat(helpersDirs)) {
      for (const helperFile of Dir.glob(`${helpersDir}/**/*_helper.ts`)) {
        await import(helperFile);
      }
    }
  },
};

await ActionPackTestSuiteUtils.requireHelpers(
  new URL("./fixtures/helpers", import.meta.url).pathname,
);
await ActionPackTestSuiteUtils.requireHelpers(
  new URL("./fixtures/alternate_helpers", import.meta.url).pathname,
);

export const FIXTURE_LOAD_PATH = new URL("./fixtures", import.meta.url).pathname;

class Config {
  middleware: MiddlewareStack;

  constructor(middleware: MiddlewareStack) {
    this.middleware = middleware;
  }
}

export class RoutedRackApp {
  static Config = Config;

  readonly routes: RouteSet;
  private _stack: MiddlewareStack;
  private _app: RackApp;

  constructor(routes: RouteSet, blk?: (stack: MiddlewareStack) => void) {
    this.routes = routes;
    this._stack = new MiddlewareStack(blk);
    this._app = this._stack.build(this.routes);
  }

  call(env: RackEnv): Promise<RackResponse> {
    return this._app(env);
  }

  config(): Config {
    return new RoutedRackApp.Config(this._stack);
  }
}

function buildApp(
  routes?: RouteSet | null,
  block?: (middleware: MiddlewareStack) => void,
): RoutedRackApp {
  return new RoutedRackApp(routes ?? new RouteSet(), (middleware) => {
    middleware.use(
      ShowExceptions as MiddlewareFactory,
      new PublicExceptions(`${FIXTURE_LOAD_PATH}/public`),
    );
    middleware.use(DebugExceptions as MiddlewareFactory);
    middleware.use(ActionableExceptions as MiddlewareFactory);
    middleware.use(Callbacks as MiddlewareFactory);
    middleware.use(Cookies as MiddlewareFactory);
    middleware.use(Flash as unknown as MiddlewareFactory);
    middleware.use(MethodOverride as unknown as MiddlewareFactory);
    middleware.use(Head as unknown as MiddlewareFactory);
    if (block) block(middleware);
  });
}

IntegrationTest.buildApp = buildApp;

IntegrationTest.app = IntegrationTest.buildApp();

(IntegrationTest.app as RoutedRackApp).routes.draw((r) => {
  deprecator().silence(() => {
    r.get(":controller(/:action)");
  });
});

class NullController extends Metal {
  static override async dispatch(
    action: string,
    req: Request,
    res: Response,
  ): Promise<RackResponse> {
    return [
      200,
      { "Content-Type": "text/html" },
      bodyFromString(`${req.params["controller"]}#${action}`),
    ];
  }
}

class NullControllerRequest extends Request {
  override controllerClass(): typeof NullController {
    return NullController;
  }
}

export class DeadEndRoutes extends RouteSet {
  static NullController = NullController;
  static NullControllerRequest = NullControllerRequest;

  override makeRequest(env: RackEnv): NullControllerRequest {
    return new NullControllerRequest(env);
  }
}

function stubControllers<T>(
  config: RouteSetConfig | ((routes: DeadEndRoutes) => T),
  block?: (routes: DeadEndRoutes) => T,
): T {
  if (typeof config === "function") return config(new DeadEndRoutes());
  return block!(new DeadEndRoutes(config));
}

IntegrationTest.stubControllers = stubControllers;

type BuildApp = typeof buildApp;
type StubControllers = typeof stubControllers;

declare module "../action-dispatch/testing/integration.js" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Ruby reopens `class ActionDispatch::IntegrationTest` (`abstract_unit.rb:118`) to add `self.build_app` and `self.stub_controllers`; a namespace merged onto the class is how an added static surfaces on the type side.
  namespace IntegrationTest {
    let buildApp: BuildApp;
    let stubControllers: StubControllers;
  }
}

(DebugExceptions.prototype as { stderrLogger(): null }).stderrLogger = function () {
  return null;
};
