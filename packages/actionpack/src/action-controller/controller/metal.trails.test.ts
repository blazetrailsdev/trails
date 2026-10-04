import { describe, it, expect } from "vitest";
import { Metal } from "../metal.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";
import { Parameters } from "../metal/strong-parameters.js";
import { htmlSafe } from "@blazetrails/activesupport";

function makeRequest(): Request {
  return new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/", HTTP_HOST: "localhost" });
}

function makeResponse(): Response {
  return new Response();
}

describe("Metal#params", () => {
  it("params memoizes request.parameters on first read", () => {
    const c = new (class extends Metal {})();
    const req = makeRequest();
    (req as any).parameters = { id: "1" };
    c.setRequestBang(req);
    const first = c.params;
    (req as any).parameters = { id: "2" };
    expect(c.params).toBe(first);
    expect(first).toEqual({ id: "1" });
  });

  it("params assigned before dispatch survive it", async () => {
    class TestController extends Metal {
      receivedParams: any;
      async index() {
        this.receivedParams = this.params;
      }
    }
    const req = makeRequest();
    (req as any).parameters = { id: "42" };
    const c = new TestController();
    const assigned = new Parameters({ id: "7" });
    c.params = assigned;
    await c.dispatch("index", req, makeResponse());
    expect(c.receivedParams).toBe(assigned);
  });
});

describe("Metal#response_body=", () => {
  it("takes the String arm for an html-safe SafeBuffer, as Ruby's is_a?(String) does", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.responseBody = htmlSafe("<p>hi</p>");
    expect(c.response.body).toBe("<p>hi</p>");
    expect(c.response.getHeader("content-length")).toBe("9");
  });
});

describe("Metal.middlewareStack", () => {
  it("a subclass reads a copy of its superclass's stack, and writes stay local", () => {
    const middleware = (app: unknown) => app;
    class ParentController extends Metal {}
    ParentController.use(middleware as never);
    class ChildController extends ParentController {}
    ChildController.use(middleware as never);

    expect(Metal.middlewareStack.isAny()).toBe(false);
    expect(ParentController.middleware().middlewares.length).toBe(1);
    expect(ChildController.middleware().middlewares.length).toBe(2);
    expect(ChildController.middleware()).toBe(ChildController.middlewareStack);
    expect(new ChildController().middlewareStack).toBe(ChildController.middlewareStack);
    expect(ChildController.isMiddlewareStack).toBe(true);
  });
});

describe("Metal#response_code / #to_a", () => {
  it("response_code is an alias of status", () => {
    const c = new (class extends Metal {})();
    c.setResponseBang(makeResponse());
    c.status = 404;
    expect(c.responseCode).toBe(404);
  });

  it("to_a is the response's Rack triple", async () => {
    class TestController extends Metal {
      index(): void {
        this.responseBody = "hi";
      }
    }
    const c = new TestController();
    const triple = await c.dispatch("index", makeRequest(), makeResponse());
    expect(triple[0]).toBe(200);
    expect(c.toA()[0]).toBe(200);
  });
});

describe("AbstractController::Base instance readers", () => {
  class PostsController extends Metal {
    index(): void {}
    private secret(name: string): string {
      return `secret ${name}`;
    }
  }

  it("controller_path and action_methods delegate to the class", () => {
    const c = new PostsController();
    expect(c.controllerPath()).toBe(PostsController.controllerPath());
    expect(c.actionMethods()).toEqual(PostsController.actionMethods());
  });

  it("inspect carries the object id", () => {
    expect(new PostsController().inspect()).toMatch(/^#<PostsController:0x[0-9a-f]{14}>$/);
  });

  it("send_action sends the method with its arguments", () => {
    expect(new PostsController().sendAction("secret", "x")).toBe("secret x");
  });
});

describe("Parameters.alwaysPermittedParameters", () => {
  it("is shared between the class and its instances", () => {
    const original = Parameters.alwaysPermittedParameters;
    try {
      Parameters.alwaysPermittedParameters = ["controller", "action", "format"];
      expect(new Parameters({}).alwaysPermittedParameters).toEqual([
        "controller",
        "action",
        "format",
      ]);
    } finally {
      Parameters.alwaysPermittedParameters = original;
    }
  });
});
