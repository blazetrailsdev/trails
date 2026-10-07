import { afterAll, beforeAll, beforeEach, describe, it, expect } from "vitest";
import { Module, assertEqual } from "@blazetrails/activesupport";
import { registerConstant, unregisterConstant } from "@blazetrails/ruby-compat";
import {
  CONTENT_TYPE,
  Lint,
  bodyFromString,
  type RackApp,
  type RackEnv,
  type RackResponse,
} from "@blazetrails/rack";
import { Base } from "../../action-controller/base.js";
import { FEATURE_POLICY } from "../constants.js";
import { controllerConstants } from "../http/request.js";
import type { MiddlewareFactory } from "../middleware/stack.js";
import { Middleware, PermissionsPolicy } from "../http/permissions-policy.js";
import { RouteSet } from "../routing/route-set.js";
import { IntegrationTest } from "../testing/integration.js";
import "../../test-helpers/abstract-unit.js";

describe("PermissionsPolicyTest", () => {
  it("mappings", () => {
    const policy = new PermissionsPolicy();
    policy.midi(":self");
    expect(policy.build()).toBe("midi 'self'");

    policy.midi(":none");
    expect(policy.build()).toBe("midi 'none'");
  });

  it("multiple sources for a single directive", () => {
    const policy = new PermissionsPolicy();
    policy.geolocation(":self", "https://example.com");
    expect(policy.build()).toBe("geolocation 'self' https://example.com");
  });

  it("single directive for multiple directives", () => {
    const policy = new PermissionsPolicy();
    policy.geolocation(":self");
    policy.usb(":none");
    expect(policy.build()).toBe("geolocation 'self'; usb 'none'");
  });

  it("multiple directives for multiple directives", () => {
    const policy = new PermissionsPolicy();
    policy.geolocation(":self", "https://example.com");
    policy.usb(":none", "https://example.com");
    expect(policy.build()).toBe(
      "geolocation 'self' https://example.com; usb 'none' https://example.com",
    );
  });

  it("invalid directive source", () => {
    const policy = new PermissionsPolicy();
    expect(() => policy.geolocation([":non_existent"] as unknown as string)).toThrow(
      "Invalid HTTP permissions policy source: [:non_existent]",
    );
  });
});

describe("PermissionsPolicyMiddlewareTest", () => {
  const POLICY = new PermissionsPolicy((p) => {
    p.gyroscope(":self");
  });

  class PolicyConfigMiddleware {
    constructor(private app: RackApp) {}

    call(env: RackEnv): Promise<RackResponse> {
      env["action_dispatch.permissions_policy"] = POLICY;
      env["action_dispatch.show_exceptions"] = ":none";

      return this.app(env);
    }
  }

  function buildApp(app: RackApp): PolicyConfigMiddleware {
    const inner = new Lint(app);
    const middleware = new Middleware((env) => inner.call(env));
    const outer = new Lint((env) => middleware.call(env));
    return new PolicyConfigMiddleware((env) => outer.call(env));
  }

  let t: IntegrationTest;
  beforeEach(({ task }) => {
    t = new IntegrationTest(task.name);
  });

  it("html requests will set a policy", async () => {
    t.app = buildApp(async () => [200, { [CONTENT_TYPE]: "text/html" }, bodyFromString("")]);

    await t.get("/index");

    assertEqual("gyroscope 'self'", t.response.headers.get(FEATURE_POLICY));
  });

  it("non-html requests will set a policy", async () => {
    t.app = buildApp(async () => [200, { [CONTENT_TYPE]: "application/json" }, bodyFromString("")]);

    await t.get("/index");

    assertEqual("gyroscope 'self'", t.response.headers.get(FEATURE_POLICY));
  });

  it("existing policies will not be overwritten", async () => {
    t.app = buildApp(async () => [
      200,
      { [FEATURE_POLICY]: "gyroscope 'none'" },
      bodyFromString(""),
    ]);

    await t.get("/index");

    assertEqual("gyroscope 'none'", t.response.headers.get(FEATURE_POLICY));
  });
});

describe("PermissionsPolicyIntegrationTest", () => {
  class PolicyController extends Base {
    static {
      this.permissionsPolicy({ only: "index" }, (f) => {
        f.gyroscope(":none");
      });

      this.permissionsPolicy({ only: "sample_controller" }, (f) => {
        f.gyroscope(null);
        f.usb(":self");
      });

      this.permissionsPolicy({ only: "multiple_directives" }, (f) => {
        f.gyroscope(null);
        f.usb(":self");
        f.autoplay("https://example.com");
        f.payment("https://secure.example.com");
      });
    }

    index(): void {
      this.head("ok");
    }

    sampleController(): void {
      this.head("ok");
    }

    multipleDirectives(): void {
      this.head("ok");
    }
  }
  controllerConstants.set("permissions_policy_integration_test/policy", PolicyController);

  const ROUTES = new RouteSet();
  ROUTES.draw(function () {
    this.scope({ module: "permissions_policy_integration_test" }, () => {
      this.get("/", { to: "policy#index" });
      this.get("/sample_controller", { to: "policy#sample_controller" });
      this.get("/multiple_directives", { to: "policy#multiple_directives" });
    });
  });

  const POLICY = new PermissionsPolicy((p) => {
    p.gyroscope(":self");
  });

  class PolicyConfigMiddleware {
    constructor(private app: RackApp) {}

    call(env: RackEnv): Promise<RackResponse> {
      env["action_dispatch.permissions_policy"] = POLICY;
      env["action_dispatch.show_exceptions"] = ":none";

      return this.app(env);
    }
  }

  const APP = IntegrationTest.buildApp(ROUTES, (middleware) => {
    middleware.use(PolicyConfigMiddleware as MiddlewareFactory);
    middleware.use(Lint as MiddlewareFactory);
    middleware.use(Middleware as MiddlewareFactory);
    middleware.use(Lint as MiddlewareFactory);
  });

  let t: IntegrationTest;
  beforeEach(({ task }) => {
    t = new IntegrationTest(task.name);
    t.app = APP;
  });

  function assertPolicy(expected: string): void {
    t.assertResponse("success");
    assertEqual(expected, t.response.headers.get("Feature-Policy"));
  }

  it("generates permissions policy header", async () => {
    await t.get("/");
    assertPolicy("gyroscope 'none'");
  });

  it("generates per controller permissions policy header", async () => {
    await t.get("/sample_controller");
    assertPolicy("usb 'self'");
  });

  it("generates multiple directives permissions policy header", async () => {
    await t.get("/multiple_directives");
    assertPolicy("usb 'self'; autoplay https://example.com; payment https://secure.example.com");
  });
});

describe("PermissionsPolicyWithHelpersIntegrationTest", () => {
  const ApplicationHelper = new Module().include({
    isPigsCanFly(): boolean {
      return false;
    },
  });

  class ApplicationController extends Base {
    isSkyIsBlue(): boolean {
      return true;
    }
  }
  Object.defineProperty(ApplicationController, "name", {
    value: "PermissionsPolicyWithHelpersIntegrationTest::ApplicationController",
  });

  class PolicyController extends ApplicationController {
    static {
      this.permissionsPolicy({}, function (this: PolicyController, f) {
        const helpers = this.helpers() as unknown as Helpers;
        if (!helpers.isPigsCanFly()) f.gyroscope(":none");
        if (helpers.isSkyIsBlue()) f.usb(":self");
      });
    }

    index(): void {
      this.head("ok");
    }
  }
  type Helpers = { isPigsCanFly(): boolean; isSkyIsBlue(): boolean };

  const ROUTES = new RouteSet();
  ROUTES.draw(function () {
    this.scope({ module: "permissions_policy_with_helpers_integration_test" }, () => {
      this.get("/", { to: "policy#index" });
    });
  });

  const POLICY = new PermissionsPolicy((p) => {
    p.gyroscope(":self");
  });

  class PolicyConfigMiddleware {
    constructor(private app: RackApp) {}

    call(env: RackEnv): Promise<RackResponse> {
      env["action_dispatch.permissions_policy"] = POLICY;
      env["action_dispatch.show_exceptions"] = ":none";

      return this.app(env);
    }
  }

  const APP = IntegrationTest.buildApp(ROUTES, (middleware) => {
    middleware.use(PolicyConfigMiddleware as MiddlewareFactory);
    middleware.use(Lint as MiddlewareFactory);
    middleware.use(Middleware as MiddlewareFactory);
    middleware.use(Lint as MiddlewareFactory);
  });

  const helperName = "PermissionsPolicyWithHelpersIntegrationTest::ApplicationHelper";
  beforeAll(() => {
    registerConstant(helperName, ApplicationHelper);
    ApplicationController.helperMethod("isSkyIsBlue");
    controllerConstants.set(
      "permissions_policy_with_helpers_integration_test/policy",
      PolicyController,
    );
  });
  afterAll(() => unregisterConstant(helperName, ApplicationHelper));

  let t: IntegrationTest;
  beforeEach(({ task }) => {
    t = new IntegrationTest(task.name);
    t.app = APP;
  });

  function assertPolicy(expected: string): void {
    t.assertResponse("success");
    assertEqual(expected, t.response.headers.get(FEATURE_POLICY));
  }

  it("generates permissions policy header", async () => {
    await t.get("/");
    assertPolicy("gyroscope 'none'; usb 'self'");
  });
});

describe("PermissionsPolicy constructor block", () => {
  it("accepts a block", () => {
    const policy = new PermissionsPolicy((p) => {
      p.gyroscope(":self");
    });
    expect(policy.build()).toBe("gyroscope 'self'");
  });
});
