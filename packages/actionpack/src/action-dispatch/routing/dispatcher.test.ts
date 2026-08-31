import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RouteSet } from "./route-set.js";
import { DispatcherRegistry } from "./dispatcher.js";
import { X_CASCADE } from "../constants.js";
import { Response } from "../http/response.js";
import { controllerConstants, Request } from "../http/request.js";
import { Dispatcher, StaticDispatcher } from "./route-set.js";
import type { RackishResponse, RouterRequest } from "../journey/router.js";

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

describe("RouteDispatcher / DispatcherRegistry", () => {
  it("dispatches to a registered handler via RouteSet.serve", async () => {
    const routes = new RouteSet();
    routes.draw((r) => r.get("/posts/:id", { to: "posts#show" }));

    const calls: Array<{ action: string; id: string }> = [];
    routes.registerController("posts", (action, req) => {
      const params = req.pathParameters as Record<string, string>;
      calls.push({ action, id: params["id"] });
      return [200, { "content-type": "text/plain" }, ["ok"]] as unknown as RackishResponse;
    });

    const res = await routes.serve(makeReq("/posts/42"));
    expect(res[0]).toBe(200);
    expect(calls).toEqual([{ action: "show", id: "42" }]);
  });

  it("returns 404 X-Cascade when no controller handler is registered", async () => {
    const routes = new RouteSet();
    routes.draw((r) => r.get("/posts", { to: "posts#index" }));

    const res = await routes.serve(makeReq("/posts"));
    expect(res[0]).toBe(404);
    expect(res[1]["x-cascade"]).toBe("pass");
  });

  it("returns 404 X-Cascade when no route matches", async () => {
    const routes = new RouteSet();
    routes.draw((r) => r.get("/posts", { to: "posts#index" }));
    routes.registerController("posts", () => [200, {}, []] as unknown as RackishResponse);

    const res = await routes.serve(makeReq("/nope"));
    expect(res[0]).toBe(404);
    expect(res[1]["x-cascade"]).toBe("pass");
  });

  it("X-Cascade: pass from a handler falls through to the next route", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/x", { to: "first#index" });
      r.get("/x", { to: "second#index" });
    });

    routes.registerController(
      "first",
      () => [404, { "x-cascade": "pass" }, []] as unknown as RackishResponse,
    );
    routes.registerController("second", () => [200, {}, ["second"]] as unknown as RackishResponse);

    const res = await routes.serve(makeReq("/x"));
    expect(res[0]).toBe(200);
  });

  it("clear() empties the dispatcher registry", () => {
    const routes = new RouteSet();
    routes.registerController("posts", () => [200, {}, []] as unknown as RackishResponse);
    expect(routes.dispatcherRegistry.has("posts")).toBe(true);
    routes.clear();
    expect(routes.dispatcherRegistry.has("posts")).toBe(false);
  });

  it("Dispatcher reports dispatcher()=true (Endpoint contract)", () => {
    const reg = new DispatcherRegistry();
    const d = new Dispatcher(false, reg);
    expect(d.dispatcher()).toBe(true);
  });

  it("Dispatcher with raiseOnNameError=true throws for unregistered controllers", () => {
    const reg = new DispatcherRegistry();
    const d = new Dispatcher(true, reg);
    const req = makeReq("/x");
    req.pathParameters = { controller: "missing", action: "show" };
    expect(() => d.serve(req)).toThrow(/uninitialized constant MissingController/);
  });

  it("StaticDispatcher dispatches its bound handler regardless of params[:controller]", async () => {
    const calls: string[] = [];
    const d = new StaticDispatcher((action) => {
      calls.push(action);
      return [200, {}, []] as unknown as RackishResponse;
    });
    const req = makeReq("/x");
    req.pathParameters = { controller: "anything", action: "index" };
    expect((await d.serve(req))[0]).toBe(200);
    expect(calls).toEqual(["index"]);
  });

  it("unregister removes a handler so subsequent serves return 404 pass", async () => {
    const routes = new RouteSet();
    routes.draw((r) => r.get("/p", { to: "posts#index" }));
    routes.registerController("posts", () => [200, {}, []] as unknown as RackishResponse);
    routes.dispatcherRegistry.unregister("posts");
    const res = await routes.serve(makeReq("/p"));
    expect(res[0]).toBe(404);
  });
});

describe("Dispatcher over the controller constant table", () => {
  class PostsController {
    static makeResponseBang(request: Request): Response {
      const res = new Response();
      res.request = request;
      return res;
    }
    dispatched: string | null = null;
    async dispatch(action: string): Promise<void> {
      this.dispatched = action;
    }
    toRackResponse(): [number, Record<string, string>, string[]] {
      return [200, { "content-type": "text/plain" }, [String(this.dispatched)]];
    }
  }

  beforeEach(() => {
    controllerConstants.set("posts", PostsController as never);
  });
  afterEach(() => {
    controllerConstants.delete("posts");
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

  it("raises on PASS_NOT_FOUND, which has no make_response!, when there is no controller", () => {
    expect(() => new Dispatcher(true).serve(reqFor({ action: "index" }))).toThrow(TypeError);
  });

  it("raises the routing error when raise_on_name_error is true", () => {
    expect(() =>
      new Dispatcher(true).serve(reqFor({ controller: "nope", action: "index" })),
    ).toThrow(/uninitialized constant NopeController/);
  });

  it("cascades with a 404 pass when raise_on_name_error is false", async () => {
    const res = await new Dispatcher(false).serve(reqFor({ controller: "nope", action: "index" }));
    expect(res[0]).toBe(404);
    expect(res[1][X_CASCADE]).toBe("pass");
  });
});
