import { camelize } from "@blazetrails/activesupport";
import { isRegisteredConstant, rbModRemoveConst } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RouteSet } from "./route-set.js";
import { X_CASCADE } from "../constants.js";
import { Response } from "../http/response.js";
import { Request } from "../http/request.js";
import { Dispatcher, StaticDispatcher } from "./route-set.js";
import type { RouterRequest } from "../journey/router.js";
import {
  Base,
  registerController as registerControllerClass,
} from "../../action-controller/base.js";

function makeReq(path: string, method = "GET"): RouterRequest {
  const req = new Request({
    REQUEST_METHOD: method,
    PATH_INFO: path,
    SCRIPT_NAME: "",
  }) as unknown as RouterRequest;
  req.pathInfo = path;
  req.scriptName = "";
  return req;
}

function makeControllerClass(
  body: (action: string, req: RouterRequest) => [number, Record<string, string>, string[]],
): typeof Base {
  return class extends Base {
    static actionEncodingTemplate(): null {
      return null;
    }
    static makeResponseBang(request: Request): Response {
      const res = new Response();
      res.request = request;
      return res;
    }
    static async dispatch(
      action: string,
      req: Request,
    ): Promise<[number, Record<string, string>, string[]]> {
      return body(action, req as unknown as RouterRequest);
    }
  };
}

describe("RouteDispatcher", () => {
  const registered: string[] = [];

  function registerController(controller: string, controllerClass: typeof Base) {
    registerControllerClass(`${camelize(controller)}Controller`, controllerClass);
    registered.push(controller);
  }

  afterEach(() => {
    for (const controller of registered.splice(0))
      if (isRegisteredConstant(`${camelize(controller)}Controller`))
        rbModRemoveConst(Object, `${camelize(controller)}Controller`);
  });

  it("dispatches to a registered handler via RouteSet.serve", async () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts/:id", { to: "posts#show" });
    });

    const calls: Array<{ action: string; id: string }> = [];
    registerController(
      "posts",
      makeControllerClass((action, req) => {
        const params = req.pathParameters as Record<string, string>;
        calls.push({ action, id: params["id"] });
        return [200, { "content-type": "text/plain" }, ["ok"]];
      }),
    );

    const res = await routes.router.serve(makeReq("/posts/42"));
    expect(res[0]).toBe(200);
    expect(calls).toEqual([{ action: "show", id: "42" }]);
  });

  it("returns 404 X-Cascade when no controller handler is registered", async () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/:controller/:action");
    });

    const res = await routes.router.serve(makeReq("/posts/index"));
    expect(res[0]).toBe(404);
    expect(res[1]["x-cascade"]).toBe("pass");
  });

  it("raises ActionController::RoutingError when a pinned controller is missing", async () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts", { to: "posts#index" });
    });

    await expect(routes.router.serve(makeReq("/posts"))).rejects.toThrow(
      /uninitialized constant PostsController/,
    );
  });

  it("raises ActionController::RoutingError when defaults pin the controller", async () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/x/:action", { controller: "posts" });
    });

    await expect(routes.router.serve(makeReq("/x/index"))).rejects.toThrow(
      /uninitialized constant PostsController/,
    );
  });

  it("returns 404 X-Cascade when no route matches", async () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts", { to: "posts#index" });
    });
    registerController(
      "posts",
      makeControllerClass(() => [200, {}, []]),
    );

    const res = await routes.router.serve(makeReq("/nope"));
    expect(res[0]).toBe(404);
    expect(res[1]["x-cascade"]).toBe("pass");
  });

  it("X-Cascade: pass from a handler falls through to the next route", async () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/x", { to: "first#index" });
      this.get("/x", { to: "second#index" });
    });

    registerController(
      "first",
      makeControllerClass(() => [404, { "x-cascade": "pass" }, []]),
    );
    registerController(
      "second",
      makeControllerClass(() => [200, {}, ["second"]]),
    );

    const res = await routes.router.serve(makeReq("/x"));
    expect(res[0]).toBe(200);
  });

  it("Dispatcher reports dispatcher()=true (Endpoint contract)", () => {
    const d = new Dispatcher(false);
    expect(d.dispatcher()).toBe(true);
  });

  it("Dispatcher with raiseOnNameError=true throws for unregistered controllers", async () => {
    const d = new Dispatcher(true);
    const req = makeReq("/x");
    req.pathParameters = { controller: "missing", action: "show" };
    await expect(d.serve(req)).rejects.toThrow(/uninitialized constant MissingController/);
  });

  it("StaticDispatcher dispatches its bound handler regardless of params[:controller]", async () => {
    const calls: string[] = [];
    const d = new StaticDispatcher(
      makeControllerClass((action) => {
        calls.push(action);
        return [200, {}, []];
      }),
    );
    const req = makeReq("/x");
    req.pathParameters = { controller: "anything", action: "index" };
    expect((await d.serve(req))[0]).toBe(200);
    expect(calls).toEqual(["index"]);
  });

  it("unregister removes a handler so subsequent serves return 404 pass", async () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/:controller/:action");
    });
    registerController(
      "posts",
      makeControllerClass(() => [200, {}, []]),
    );
    rbModRemoveConst(Object, "PostsController");
    const res = await routes.router.serve(makeReq("/posts/index"));
    expect(res[0]).toBe(404);
  });
});

describe("Dispatcher over the controller constant table", () => {
  class PostsController extends Base {
    static actionEncodingTemplate(): null {
      return null;
    }
    static makeResponseBang(request: Request): Response {
      const res = new Response();
      res.request = request;
      return res;
    }
    static async dispatch(action: string): Promise<[number, Record<string, string>, string[]]> {
      return [200, { "content-type": "text/plain" }, [String(action)]];
    }
  }

  beforeEach(() => {
    registerControllerClass("PostsController", PostsController);
  });
  afterEach(() => {
    if (isRegisteredConstant("PostsController")) rbModRemoveConst(Object, "PostsController");
  });

  const reqFor = (params: Record<string, unknown>): RouterRequest => {
    const req = new Request({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts",
      "action_dispatch.request.path_parameters": params,
    }) as unknown as RouterRequest;
    return req;
  };

  it("defaults the action to index when path_parameters carries none", async () => {
    const res = await new Dispatcher(true).serve(reqFor({ controller: "posts" }));
    expect(res[0]).toBe(200);
    expect(res[2]).toEqual(["index"]);
  });

  it("raises on PASS_NOT_FOUND, which has no make_response!, when there is no controller", async () => {
    await expect(new Dispatcher(true).serve(reqFor({ action: "index" }))).rejects.toThrow(
      TypeError,
    );
  });

  it("raises the routing error when raise_on_name_error is true", async () => {
    await expect(
      new Dispatcher(true).serve(reqFor({ controller: "nope", action: "index" })),
    ).rejects.toThrow(/uninitialized constant NopeController/);
  });

  it("cascades with a 404 pass when raise_on_name_error is false", async () => {
    const res = await new Dispatcher(false).serve(reqFor({ controller: "nope", action: "index" }));
    expect(res[0]).toBe(404);
    expect(res[1][X_CASCADE]).toBe("pass");
  });
});
