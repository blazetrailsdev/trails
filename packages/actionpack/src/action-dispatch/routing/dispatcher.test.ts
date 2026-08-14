import { describe, expect, it } from "vitest";
import { RouteSet } from "./route-set.js";
import { DispatcherRegistry, controllerDispatcher } from "./dispatcher.js";
import { bodyToString } from "@blazetrails/rack";
import { X_CASCADE } from "../constants.js";
import { Response } from "../http/response.js";
import type { Request } from "../http/request.js";
import { Dispatcher, StaticDispatcher } from "./route-set.js";
import type { RackishResponse, RouterRequest } from "../journey/router.js";

function makeReq(path: string, method = "GET"): RouterRequest {
  return {
    pathInfo: path,
    scriptName: "",
    requestMethod: method,
    pathParameters: {},
  };
}

describe("RouteDispatcher / DispatcherRegistry", () => {
  it("dispatches to a registered handler via RouteSet.serve", () => {
    const routes = new RouteSet();
    routes.draw((r) => r.get("/posts/:id", { to: "posts#show" }));

    const calls: Array<{ action: string; id: string }> = [];
    routes.registerController("posts", (action, req) => {
      const params = req.pathParameters as Record<string, string>;
      calls.push({ action, id: params["id"] });
      return [200, { "content-type": "text/plain" }, ["ok"]] as unknown as RackishResponse;
    });

    const res = routes.serve(makeReq("/posts/42"));
    expect(res[0]).toBe(200);
    expect(calls).toEqual([{ action: "show", id: "42" }]);
  });

  it("returns 404 X-Cascade when no controller handler is registered", () => {
    const routes = new RouteSet();
    routes.draw((r) => r.get("/posts", { to: "posts#index" }));

    const res = routes.serve(makeReq("/posts"));
    expect(res[0]).toBe(404);
    expect(res[1]["x-cascade"]).toBe("pass");
  });

  it("returns 404 X-Cascade when no route matches", () => {
    const routes = new RouteSet();
    routes.draw((r) => r.get("/posts", { to: "posts#index" }));
    routes.registerController("posts", () => [200, {}, []] as unknown as RackishResponse);

    const res = routes.serve(makeReq("/nope"));
    expect(res[0]).toBe(404);
    expect(res[1]["x-cascade"]).toBe("pass");
  });

  it("X-Cascade: pass from a handler falls through to the next route", () => {
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

    const res = routes.serve(makeReq("/x"));
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
    const req: RouterRequest = {
      pathInfo: "/x",
      scriptName: "",
      requestMethod: "GET",
      pathParameters: { controller: "missing", action: "show" },
    };
    expect(() => d.serve(req)).toThrow(/uninitialized constant missing/);
  });

  it("StaticDispatcher dispatches its bound handler regardless of params[:controller]", () => {
    const calls: string[] = [];
    const d = new StaticDispatcher((action) => {
      calls.push(action);
      return [200, {}, []] as unknown as RackishResponse;
    });
    const req: RouterRequest = {
      pathInfo: "/x",
      scriptName: "",
      requestMethod: "GET",
      pathParameters: { controller: "anything", action: "index" },
    };
    expect(d.serve(req)[0]).toBe(200);
    expect(calls).toEqual(["index"]);
  });

  it("unregister removes a handler so subsequent serves return 404 pass", () => {
    const routes = new RouteSet();
    routes.draw((r) => r.get("/p", { to: "posts#index" }));
    routes.registerController("posts", () => [200, {}, []] as unknown as RackishResponse);
    routes.dispatcherRegistry.unregister("posts");
    const res = routes.serve(makeReq("/p"));
    expect(res[0]).toBe(404);
  });
});

describe("controllerDispatcher", () => {
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

  const controllers = new Map([["posts", PostsController as never]]);
  const envFor = (params: Record<string, unknown>) => ({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/posts",
    "action_dispatch.request.path_parameters": params,
  });

  it("defaults the action to index when path_parameters carries none", async () => {
    const dispatcher = controllerDispatcher(controllers, true);
    const [status, , body] = await dispatcher("posts", "", {}, envFor({ controller: "posts" }));
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("index");
  });

  it("raises on PASS_NOT_FOUND, which has no make_response!, when there is no controller", async () => {
    const dispatcher = controllerDispatcher(controllers, true);
    await expect(dispatcher("", "index", {}, envFor({ action: "index" }))).rejects.toThrow(
      TypeError,
    );
  });

  it("raises the routing error when raise_on_name_error is true", async () => {
    const dispatcher = controllerDispatcher(controllers, true);
    await expect(
      dispatcher("nope", "index", {}, envFor({ controller: "nope", action: "index" })),
    ).rejects.toThrow(/uninitialized constant NopeController/);
  });

  it("cascades with a 404 pass when raise_on_name_error is false", async () => {
    const dispatcher = controllerDispatcher(controllers, false);
    const [status, headers] = await dispatcher(
      "nope",
      "index",
      {},
      envFor({ controller: "nope", action: "index" }),
    );
    expect(status).toBe(404);
    expect(headers[X_CASCADE]).toBe("pass");
  });
});
