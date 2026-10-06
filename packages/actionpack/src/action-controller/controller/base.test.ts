import { beforeEach, describe, it, expect } from "vitest";
import {
  assert,
  assertEqual,
  assertIncludes,
  assertNotDeprecated,
  assertNotIncludes,
} from "@blazetrails/activesupport";
import { ModelName } from "@blazetrails/activemodel";
import { domClass, domId } from "@blazetrails/actionview";
import { include, publicInstanceMethods, rbModConstSet } from "@blazetrails/ruby-compat";
import { Base, MODULES } from "../base.js";
import { deprecator } from "../deprecator.js";
import { TestCase } from "../test-case.js";
import { deprecator as actionDispatchDeprecator } from "../../action-dispatch/deprecator.js";
import { controllerConstants } from "../../action-dispatch/http/request.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";
import { RouteSet } from "../../action-dispatch/routing/route-set.js";
import "../../test-helpers/abstract-unit.js";

function makeRequest(opts: Record<string, string> = {}): Request {
  return new Request({
    REQUEST_METHOD: opts.method ?? "GET",
    PATH_INFO: opts.path ?? "/",
    HTTP_HOST: opts.host ?? "localhost",
    ...opts,
  });
}

function makeResponse(): Response {
  return new Response();
}

class Comment {
  static readonly modelName = new ModelName(this);
  readonly modelName = Comment.modelName;
  id: number | null = null;
  toKey(): unknown[] | null {
    return this.id != null ? [this.id] : null;
  }
  save(): void {
    this.id = 1;
  }
}

class EmptyController extends Base {}

class SimpleController extends Base {
  // @ts-expect-error -- Ruby lets an action shadow an inherited method (base_test.rb:16-18)
  status(): void {
    this.head("ok");
  }

  hello(): void {
    this.responseBody = "hello";
  }
}

class ChildController extends SimpleController {}

class NonEmptyController extends Base {
  publicAction(): void {
    this.head("ok");
  }
}

class DefaultUrlOptionsController extends Base {
  declare fromViewUrl: () => string;
  declare descriptionsPath: (...args: unknown[]) => string;
  declare descriptionPath: (...args: unknown[]) => string;

  async fromView(): Promise<void> {
    await this.render({ inline: `<%= context.${this.params.get("route")} %>` });
  }
}
Object.defineProperty(DefaultUrlOptionsController.prototype, "defaultUrlOptions", {
  get() {
    return { host: "www.override.com", action: "new", locale: "en" };
  },
});

class OptionalDefaultUrlOptionsController extends Base {
  show(): void {
    this.head("ok");
  }
}
Object.defineProperty(OptionalDefaultUrlOptionsController.prototype, "defaultUrlOptions", {
  get() {
    return { format: "atom", id: "default-id" };
  },
});

class UrlOptionsController extends Base {
  declare fromViewUrl: () => string;

  async fromView(): Promise<void> {
    await this.render({ inline: `<%= context.${this.params.get("route")} %>` });
  }
}
const urlOptions = Base.prototype.urlOptions;
UrlOptionsController.prototype.urlOptions = function () {
  return { ...urlOptions.call(this), host: "www.override.com" };
};

class RecordIdentifierIncludedController extends Base {
  declare domId: typeof domId;
  declare domClass: typeof domClass;
}
include(RecordIdentifierIncludedController, { domId, domClass });

controllerConstants.set("url_options", UrlOptionsController);
controllerConstants.set("default_url_options", DefaultUrlOptionsController);

describe("ControllerClassTests", () => {
  it("controller path", () => {
    expect(EmptyController.controllerPath()).toBe("empty");
    expect(new EmptyController().controllerPath()).toBe("empty");

    class SuperAdminController extends Base {}
    expect(SuperAdminController.controllerPath()).toBe("super_admin");
  });

  it("controller name", () => {
    expect(EmptyController.controllerName()).toBe("empty");
    expect(new EmptyController().controllerName()).toBe("empty");

    class SuperAdminController extends Base {}
    expect(SuperAdminController.controllerName()).toBe("super_admin");
    expect(new SuperAdminController().controllerName()).toBe("super_admin");
  });

  it("no deprecation when action view record identifier is included", () => {
    const record = new Comment();
    record.save();

    let domId: string | null = null;
    assertNotDeprecated(deprecator(), () => {
      domId = new RecordIdentifierIncludedController().domId(record);
    });

    assertEqual("comment_1", domId);

    let domClass: string | null = null;
    assertNotDeprecated(deprecator(), () => {
      domClass = new RecordIdentifierIncludedController().domClass(record);
    });
    assertEqual("comment", domClass);
  });
});

describe("ControllerInstanceTests", () => {
  it("performed?", async () => {
    class EmptyController extends Base {
      async index() {
        await this.render({ plain: "done" });
      }
    }
    const c = new EmptyController();
    expect(c.performed).toBe(false);
    await c.dispatch("index", makeRequest(), makeResponse());
    expect(c.performed).toBe(true);
  });

  it("empty controller action methods", () => {
    const baseMethods = new Set(Base.actionMethods());
    const emptyMethods = new Set(EmptyController.actionMethods());
    const customMethods = [...emptyMethods].filter((m) => !baseMethods.has(m));
    expect(customMethods).toEqual([]);
  });

  it("inspect", () => {
    const c = new EmptyController();
    expect(c.inspect()).toMatch(/^#<EmptyController:0x[0-9a-f]+>$/);
  });

  it("action methods with inherited shadowed internal method", () => {
    assertIncludes(publicInstanceMethods(Base), "status");
    assertEqual(["hello", "status"], SimpleController.actionMethods().sort());
    assertEqual(["hello", "status"], ChildController.actionMethods().sort());
  });

  it("temporary anonymous controllers", () => {
    const name = "ExamplesController";
    const klass = (() => class extends Base {})();
    rbModConstSet(Object, name, klass);

    try {
      const controller = new klass();
      assertEqual("examples", controller.controllerPath());
    } finally {
      delete (Object as unknown as Record<string, unknown>)[name];
    }
  });

  it("response has default headers", async () => {
    const originalDefaultHeaders = Response.defaultHeaders;

    try {
      Response.defaultHeaders = {
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "0",
      };

      const responseHeaders = (
        await (SimpleController as unknown as typeof Base).action("hello")({
          REQUEST_METHOD: "GET",
          "rack.input": () => {},
        })
      )[1];

      assert("x-frame-options" in responseHeaders);
      assert("x-content-type-options" in responseHeaders);
      assert("x-xss-protection" in responseHeaders);
    } finally {
      Response.defaultHeaders = originalDefaultHeaders;
    }
  });
});

describe("PerformActionTest", () => {
  it("process should be precise", async () => {
    const c = new EmptyController();
    await expect(c.dispatch("non_existent", makeRequest(), makeResponse())).rejects.toThrow(
      /could not be found for EmptyController/,
    );
  });

  it("action missing should work", async () => {
    class ActionMissingController extends Base {
      async actionMissing(action: string) {
        await this.render({ plain: `Response for ${action}` });
      }
    }
    const c = new ActionMissingController();
    await c.dispatch("arbitrary_action", makeRequest(), makeResponse());
    expect(c.responseBody).toBe("Response for arbitrary_action");
  });

  // BLOCKED: port-did-you-mean-correctable-onto-name-error
  it.skip("exceptions have suggestions for fix", () => {});
});

describe("UrlOptionsTest", () => {
  let tc: TestCase;
  const controller = () => tc.controller as UrlOptionsController;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new UrlOptionsController();
    await tc.beforeSetup();
    tc.request.host = "www.example.com";
  });

  it("url for query params included", () => {
    const rs = new RouteSet();
    rs.draw(function () {
      this.get("home", { to: "pages#home" });
    });

    const options = {
      action: "home",
      controller: "pages",
      onlyPath: true,
      params: { token: "secret" },
    };

    assertEqual("/home?token=secret", rs.urlFor(options));
  });

  it("url options override", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.get("from_view", { to: "url_options#from_view", as: "from_view" });

        actionDispatchDeprecator().silence(() => {
          this.get(":controller/:action");
        });
      });

      await tc.get("from_view", { params: { route: "fromViewUrl()" } });

      assertEqual("http://www.override.com/from_view", tc.response.body);
      assertEqual("http://www.override.com/from_view", controller().fromViewUrl());
      assertEqual(
        "http://www.override.com/default_url_options/index",
        controller().urlFor({ controller: "default_url_options" }),
      );
    });
  });

  it("url helpers does not become actions", () => {
    tc.withRouting((set: RouteSet) => {
      set.draw(function () {
        this.get("account/overview");
      });

      assertNotIncludes(
        (tc.controller.constructor as typeof Base).actionMethods(),
        "accountOverviewPath",
      );
    });
  });
});

describe("DefaultUrlOptionsTest", () => {
  let tc: TestCase;
  const controller = () => tc.controller as DefaultUrlOptionsController;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new DefaultUrlOptionsController();
    await tc.beforeSetup();
    tc.request.host = "www.example.com";
  });

  it("default url options override", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.get("from_view", { to: "default_url_options#from_view", as: "from_view" });

        actionDispatchDeprecator().silence(() => {
          this.get(":controller/:action");
        });
      });

      await tc.get("from_view", { params: { route: "fromViewUrl()" } });

      assertEqual("http://www.override.com/from_view?locale=en", tc.response.body);
      assertEqual("http://www.override.com/from_view?locale=en", controller().fromViewUrl());
      assertEqual(
        "http://www.override.com/default_url_options/new?locale=en",
        controller().urlFor({ controller: "default_url_options" }),
      );
    });
  });

  it("default url options are used in non positional parameters", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.scope("/:locale", () => {
          this.resources("descriptions");
        });

        actionDispatchDeprecator().silence(() => {
          this.get(":controller/:action");
        });
      });

      await tc.get("from_view", { params: { route: "descriptionPath(1)" } });

      assertEqual("/en/descriptions/1", tc.response.body);
      assertEqual("/en/descriptions", controller().descriptionsPath());
      assertEqual("/pl/descriptions", controller().descriptionsPath("pl"));
      assertEqual("/pl/descriptions", controller().descriptionsPath({ locale: "pl" }));
      assertEqual("/pl/descriptions.xml", controller().descriptionsPath("pl", "xml"));
      assertEqual("/en/descriptions.xml", controller().descriptionsPath({ format: "xml" }));
      assertEqual("/en/descriptions/1", controller().descriptionPath(1));
      assertEqual("/pl/descriptions/1", controller().descriptionPath("pl", 1));
      assertEqual("/pl/descriptions/1", controller().descriptionPath(1, { locale: "pl" }));
      assertEqual("/pl/descriptions/1.xml", controller().descriptionPath("pl", 1, "xml"));
      assertEqual("/en/descriptions/1.xml", controller().descriptionPath(1, { format: "xml" }));
    });
  });
});

describe("OptionalDefaultUrlOptionsControllerTest", () => {
  it("default url options override missing positional arguments", async ({ task }) => {
    const tc = new TestCase(task.name) as TestCase & { thingPath: (id?: string) => string };
    tc.controller = new OptionalDefaultUrlOptionsController();
    await tc.beforeSetup();

    tc.withRouting((set: RouteSet) => {
      set.draw(function () {
        this.get("/things/:id(.:format)", { to: "things#show", as: "thing" });
      });
      assertEqual("/things/1.atom", tc.thingPath("1"));
      assertEqual("/things/default-id.atom", tc.thingPath());
    });
  });
});

describe("EmptyUrlOptionsTest", () => {
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new NonEmptyController();
    await tc.beforeSetup();
    tc.request.host = "www.example.com";
  });

  it("ensure url for works as expected when called with no options if default url options is not set", async () => {
    await tc.get("public_action");
    assertEqual(
      "http://www.example.com/non_empty/public_action",
      (tc.controller as NonEmptyController).urlFor(),
    );
  });

  it("named routes with path without doing a request first", () => {
    tc.controller = new EmptyController();
    (tc.controller as EmptyController).request = tc.request;

    tc.withRouting((set: RouteSet) => {
      set.draw(function () {
        this.resources("things");
      });

      assertEqual(
        "/things",
        (tc.controller as EmptyController & { thingsPath(): string }).thingsPath(),
      );
    });
  });
});

describe("BaseTest", () => {
  it("included modules are tracked", () => {
    expect(MODULES).toEqual([
      "AbstractController::Rendering",
      "AbstractController::Translation",
      "AbstractController::AssetPaths",
      "Helpers",
      "UrlFor",
      "Redirecting",
      "ActionView::Layouts",
      "Rendering",
      "Renderers::All",
      "ConditionalGet",
      "EtagWithTemplateDigest",
      "EtagWithFlash",
      "Caching",
      "MimeResponds",
      "ImplicitRender",
      "StrongParameters",
      "ParameterEncoding",
      "Cookies",
      "Flash",
      "FormBuilder",
      "RequestForgeryProtection",
      "ContentSecurityPolicy",
      "PermissionsPolicy",
      "RateLimiting",
      "AllowBrowser",
      "Streaming",
      "DataStreaming",
      "HttpAuthentication::Basic::ControllerMethods",
      "HttpAuthentication::Digest::ControllerMethods",
      "HttpAuthentication::Token::ControllerMethods",
      "DefaultHeaders",
      "Logging",
      "AbstractController::Callbacks",
      "Rescue",
      "Instrumentation",
      "ParamsWrapper",
    ]);
  });
});
