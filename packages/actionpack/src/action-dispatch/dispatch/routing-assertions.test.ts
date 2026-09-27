import { beforeAll, describe, it, expect } from "vitest";
import { RouteSet } from "../routing/route-set.js";
import { controllerConstants } from "../http/request.js";
import type { DispatchableControllerClass } from "../routing/dispatcher.js";
import { assertRecognizes, assertRouting } from "../testing/assertions/routing.js";

class StubController {}

beforeAll(() => {
  controllerConstants.set("posts", StubController as unknown as DispatchableControllerClass);
});

describe("ActionDispatch::Routing::Assertions", () => {
  it("assert generates", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor({ id: 1 }, "post")).toBe("/posts/1");
  });

  it("assert recognizes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    assertRecognizes.call({ routes }, { controller: "posts", action: "show", id: "1" }, "/posts/1");
  });

  it("assert routing", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    assertRouting.call({ routes }, "/posts/1", { controller: "posts", action: "show", id: "1" });
  });

  it("with routing", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/temp", { to: "temp#index", as: "temp" });
    });
    expect(routes.pathFor({}, "temp")).toBe("/temp");
    routes.clearBang();
    expect(() => routes.pathFor({}, "temp")).toThrow();
  });
});
