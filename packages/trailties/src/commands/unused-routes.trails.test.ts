import { describe, it, expect, afterEach } from "vitest";
import { ActionView, controllerConstants, type Route } from "@blazetrails/actionpack";
import { RouteInfo } from "./unused-routes.js";

function route(requirements: Record<string, string>): Route {
  return { requirements } as unknown as Route;
}

describe("UnusedRoutesCommand", () => {
  afterEach(() => {
    controllerConstants.clear();
  });

  it("RouteInfo is unused when the controller class is not registered", async () => {
    const info = new RouteInfo(route({ controller: "posts", action: "index" }));
    expect(await info.unused()).toBe(true);
  });

  it("RouteInfo is not unused when the controller defines the action", async () => {
    class PostsController {
      index(): void {}
    }
    controllerConstants.set("posts", PostsController as never);
    const info = new RouteInfo(route({ controller: "posts", action: "index" }));
    expect(await info.unused()).toBe(false);
  });

  it("RouteInfo is unused when the action and its template are both missing", async () => {
    class PostsController {}
    controllerConstants.set("posts", PostsController as never);
    const info = new RouteInfo(route({ controller: "posts", action: "index" }));
    expect(await info.unused()).toBe(true);
  });

  it("RouteInfo is not unused when a template covers the missing action", async () => {
    class PostsController {
      static viewPaths(): ActionView.PathSet {
        return new ActionView.PathSet([
          new ActionView.FileSystemResolver(
            new URL("./__fixtures__/views", import.meta.url).pathname,
          ),
        ]);
      }
    }
    controllerConstants.set("posts", PostsController as never);
    const info = new RouteInfo(route({ controller: "posts", action: "index" }));
    expect(await info.unused()).toBe(false);
  });
});
