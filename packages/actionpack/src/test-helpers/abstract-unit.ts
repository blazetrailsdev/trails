import {
  assert,
  assertEqual,
  assertNil,
  assertNotEqual,
  assertNotIncludes,
  include,
  transformKeys,
} from "@blazetrails/activesupport";
import {
  DelegateClass,
  Dir,
  type Generic,
  Hash,
  rbInspect,
  stringSplit,
  URI,
} from "@blazetrails/ruby-compat";
import {
  bodyFromString,
  bodyToString,
  Head,
  MethodOverride,
  type RackEnv,
  type RackResponse,
} from "@blazetrails/rack";
import { Base } from "../action-controller/base.js";
import { Metal } from "../action-controller/metal.js";
import { RoutingError } from "../action-controller/metal/exceptions.js";
import { deprecator } from "../action-dispatch/deprecator.js";
import { controllerConstants, Request } from "../action-dispatch/http/request.js";
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
import {
  RouteSet,
  type Config as RouteSetConfig,
  type UrlHelpersModule,
} from "../action-dispatch/routing/route-set.js";
import { IntegrationTest } from "../action-dispatch/testing/integration.js";

export const ActionPackTestSuiteUtils = {
  async requireHelpers(helpersDirs: string | string[]): Promise<void> {
    for (const helpersDir of ([] as string[]).concat(helpersDirs)) {
      for (const helperFile of Dir.glob(`${helpersDir}/**/*-helper.ts`)) {
        await import(helperFile);
      }
    }
  },
};

await ActionPackTestSuiteUtils.requireHelpers(
  new URL("./fixtures/helpers", import.meta.url).pathname,
);
await ActionPackTestSuiteUtils.requireHelpers(
  new URL("./fixtures/alternate-helpers", import.meta.url).pathname,
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

type RoutingVerbsHost = {
  routes: { call(env: RackEnv): Promise<RackResponse> };
  controller: { request: Request } | null;
  sendRequest(
    uriOrHost: Generic | string,
    method: string,
    path: string | null,
  ): Promise<RackResponse>;
};

export const RoutingVerbs = {
  sendRequest(
    this: RoutingVerbsHost,
    uriOrHost: Generic | string,
    method: string,
    path: string | null,
  ): Promise<RackResponse> {
    let host: string | null = null;
    if (path == null) host = (uriOrHost as Generic).host;
    path ??= (uriOrHost as Generic).path!;

    const params = { PATH_INFO: path, REQUEST_METHOD: method, HTTP_HOST: host };

    return this.routes.call(params);
  },

  async requestPathParams(
    this: RoutingVerbsHost,
    path: string,
    options: { method?: string } = {},
  ): Promise<Record<string, unknown>> {
    const method = options.method ?? "GET";
    const resp = await this.sendRequest(
      URI.parse("http://localhost" + path),
      method.toString().toUpperCase(),
      null,
    );
    const status = resp[0];
    if (status === 404) {
      throw new RoutingError(`No route matches ${rbInspect(path)}`);
    }
    return this.controller!.request.pathParameters;
  },

  async get(
    this: RoutingVerbsHost,
    uriOrHost: Generic | string,
    path: string | null = null,
  ): Promise<string> {
    return bodyToString((await this.sendRequest(uriOrHost, "GET", path))[2]);
  },

  async post(
    this: RoutingVerbsHost,
    uriOrHost: Generic | string,
    path: string | null = null,
  ): Promise<string> {
    return bodyToString((await this.sendRequest(uriOrHost, "POST", path))[2]);
  },

  async put(
    this: RoutingVerbsHost,
    uriOrHost: Generic | string,
    path: string | null = null,
  ): Promise<string> {
    return bodyToString((await this.sendRequest(uriOrHost, "PUT", path))[2]);
  },

  async delete(
    this: RoutingVerbsHost,
    uriOrHost: Generic | string,
    path: string | null = null,
  ): Promise<string> {
    return bodyToString((await this.sendRequest(uriOrHost, "DELETE", path))[2]);
  },

  async patch(
    this: RoutingVerbsHost,
    uriOrHost: Generic | string,
    path: string | null = null,
  ): Promise<string> {
    return bodyToString((await this.sendRequest(uriOrHost, "PATCH", path))[2]);
  },
};

class TestSetRequest extends DelegateClass(Request) {
  private _helpers: UrlHelpersModule;
  private _block: (controller: Base) => void;
  private _strict: boolean;

  constructor(
    target: Request,
    helpers: UrlHelpersModule,
    block: (controller: Base) => void,
    strict: boolean,
  ) {
    super(target);
    this._helpers = helpers;
    this._block = block;
    this._strict = strict;
  }

  override controllerClass(): typeof Base {
    const helpers = this._helpers;
    const block = this._block;
    const klass = class extends (this._strict ? (super.controllerClass() as typeof Base) : Base) {
      override async process(name: string): Promise<void> {
        block(this);
      }

      override toRackResponse(): RackResponse {
        return [200, {}, []] as unknown as RackResponse;
      }
    };
    include(klass, helpers);
    return klass;
  }
}

class TestSet extends RouteSet {
  static Request = TestSetRequest;

  readonly strict: boolean;
  private _block: (controller: Base) => void;

  constructor(block: (controller: Base) => void, strict = false) {
    super();
    this._block = block;
    this.strict = strict;
  }

  /** @internal */
  override makeRequest(env: RackEnv): TestSetRequest {
    return new TestSet.Request(super.makeRequest(env), this.urlHelpers(), this._block, this.strict);
  }
}

type RoutingTestHelpersHost = { controller: Base | null };

export const RoutingTestHelpers = {
  urlFor(set: RouteSet, options: Record<string, unknown>): string {
    const routeName = options["useRoute"] as string | null | undefined;
    delete options["useRoute"];
    return set.urlFor({ ...options, onlyPath: true }, routeName ?? null);
  },

  makeSet(this: RoutingTestHelpersHost, strict = true): TestSet {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- `tc = self` (`abstract_unit.rb:312`).
    const tc = this;
    return new TestSet((c) => {
      tc.controller = c;
    }, strict);
  },
};

export class ResourcesController extends Base {
  index(): void {
    this.head("ok");
  }
  declare show: ResourcesController["index"];
  static {
    this.prototype.show = this.prototype.index;
  }
}

export class CommentsController extends ResourcesController {}
export class AccountsController extends ResourcesController {}
export class ImagesController extends ResourcesController {}

controllerConstants.set("resources", ResourcesController);
controllerConstants.set("comments", CommentsController);
controllerConstants.set("accounts", AccountsController);
controllerConstants.set("images", ImagesController);

type SetCookieAttributes = Record<string, string | true>;

type CookieAssertionsHost = {
  response: { headers: Map<string, string | string[]> };
  parseSetCookieAttributes(
    fields: string | string[],
    attributes?: SetCookieAttributes,
  ): SetCookieAttributes;
  parseSetCookiesHeaders(
    setCookies: string | string[] | null | undefined,
  ): Hash<string, SetCookieAttributes>;
};

export const CookieAssertions = {
  parseSetCookieAttributes(
    fields: string | string[],
    attributes: SetCookieAttributes = {},
  ): SetCookieAttributes {
    if (typeof fields === "string") {
      fields = stringSplit(fields, ";").map((field) => field.trim());
    }

    for (const field of fields) {
      let [key, value] = stringSplit(field, "=", 2);

      key = key.toLowerCase();

      if (value != null) {
        value = value.toLowerCase();
        attributes[key] = value;
      } else {
        attributes[key] = true;
      }
    }

    return attributes;
  },

  parseSetCookiesHeaders(
    this: Pick<CookieAssertionsHost, "parseSetCookieAttributes">,
    setCookies: string | string[] | null | undefined,
  ): Hash<string, SetCookieAttributes> {
    if (typeof setCookies === "string") {
      setCookies = stringSplit(setCookies, "\n");
    }

    const cookies = new Hash<string, SetCookieAttributes>();

    setCookies?.forEach((cookieString) => {
      const attributes: SetCookieAttributes = {};

      const fields = stringSplit(cookieString, ";").map((field) => field.trim());

      const [name, value] = stringSplit(fields.shift()!, "=", 2);

      attributes["value"] = value;

      cookies.set(name, this.parseSetCookieAttributes(fields, attributes));
    });

    return cookies;
  },

  assertSetCookieAttributes(
    this: CookieAssertionsHost,
    name: string,
    attributes: string | SetCookieAttributes,
    header: string | string[] | undefined = this.response.headers.get("Set-Cookie"),
  ): void {
    const cookies = this.parseSetCookiesHeaders(header);
    if (typeof attributes === "string") attributes = this.parseSetCookieAttributes(attributes);

    assert(
      cookies.has(name),
      `No cookie found with the name '${name}', found cookies: ${[...cookies.keys()].join(", ")}`,
    );
    const cookie = cookies.get(name)!;

    for (const [key, value] of Object.entries(attributes)) {
      assert(Object.hasOwn(cookie, key), `No attribute '${key}' found for cookie '${name}'`);
      assertEqual(value, cookie[key]);
    }
  },

  assertNotSetCookieAttributes(
    this: CookieAssertionsHost,
    name: string,
    attributes: string | SetCookieAttributes,
    header: string | string[] | undefined = this.response.headers.get("Set-Cookie"),
  ): void {
    const cookies = this.parseSetCookiesHeaders(header);
    if (typeof attributes === "string") attributes = this.parseSetCookieAttributes(attributes);

    assert(cookies.has(name), `No cookie found with the name '${name}'`);
    const cookie = cookies.get(name)!;

    for (const [key, value] of Object.entries(attributes)) {
      if (value === true) {
        assertNil(cookie[key]);
      } else {
        assertNotEqual(value, cookie[key]);
      }
    }
  },

  assertSetCookieHeader(
    this: CookieAssertionsHost,
    expected: string | string[] | Hash<string, SetCookieAttributes>,
    header:
      | string
      | string[]
      | undefined
      | Hash<string, SetCookieAttributes> = this.response.headers.get("Set-Cookie"),
  ): void {
    if (typeof header === "string") {
      header = stringSplit(header, "\n").sort();
    }

    if (typeof expected === "string") {
      expected = stringSplit(expected, "\n").sort();
    }

    header = this.parseSetCookiesHeaders(header as string[] | undefined);
    expected = this.parseSetCookiesHeaders(expected as string[]);

    for (const [key, value] of expected) {
      assertEqual(value, header.get(key));
    }
  },

  assertNotSetCookieHeader(
    this: CookieAssertionsHost,
    expected: string | string[],
    header:
      | string
      | string[]
      | undefined
      | Hash<string, SetCookieAttributes> = this.response.headers.get("Set-Cookie"),
  ): void {
    if (typeof header === "string") {
      header = stringSplit(header, "\n").sort();
    }

    if (typeof expected === "string") {
      expected = stringSplit(expected, "\n").sort();
    }

    header = this.parseSetCookiesHeaders(header as string[] | undefined);

    for (const name of expected) {
      assertNotIncludes(header, name);
    }
  },
};

type HeadersAssertionsHost = {
  response: { headers: Map<string, unknown> };
  normalizeHeaders(headers: Map<string, unknown>): Map<string, unknown>;
  normalizedJoinHeader(header: unknown): unknown;
};

export const HeadersAssertions = {
  normalizeHeaders(headers: Map<string, unknown>): Map<string, unknown> {
    return transformKeys(headers, (key) => key.toLowerCase());
  },

  assertHeaders(
    this: HeadersAssertionsHost,
    expected: Record<string, unknown>,
    actual: Map<string, unknown> = this.response.headers,
  ): void {
    actual = this.normalizeHeaders(actual);
    for (const [key, value] of Object.entries(expected)) {
      assertEqual(value, actual.get(key));
    }
  },

  assertHeader(
    this: HeadersAssertionsHost,
    key: string,
    value: unknown,
    actual: Map<string, unknown> = this.response.headers,
  ): void {
    actual = this.normalizeHeaders(actual);
    assertEqual(value, actual.get(key));
  },

  assertNotHeader(
    this: HeadersAssertionsHost,
    key: string,
    actual: Map<string, unknown> = this.response.headers,
  ): void {
    actual = this.normalizeHeaders(actual);
    assertNotIncludes(actual, key);
  },

  normalizedJoinHeader(header: unknown): unknown {
    return Array.isArray(header) ? header.join(",") : header;
  },

  assertHeaderValue(
    this: Pick<HeadersAssertionsHost, "normalizedJoinHeader">,
    expected: unknown,
    header: unknown,
  ): void {
    header = this.normalizedJoinHeader(header);
    assertEqual(header, expected);
  },
};
