import { describe, it, expect, afterEach, onTestFinished, vi } from "vitest";
import {
  ActionController,
  ActionView,
  controllerConstants,
  type Journey,
} from "@blazetrails/actionpack";
import { Base } from "@blazetrails/activerecord";
import { BetterSQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/better-sqlite3-adapter.js";
import { env, getFs, getOsAsync, getPath, setEnv } from "@blazetrails/ruby-compat";
import defineSchema from "../__fixtures__/boot-app/db/schema.js";
import { Application } from "../application.js";
import { createProgram } from "../cli.js";
import { Trails, _resetTrailsEnv } from "../rails.js";
import { RouteInfo } from "./unused-routes.js";

const exit = vi.hoisted(() => vi.fn());
vi.mock("@blazetrails/ruby-compat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@blazetrails/ruby-compat")>()),
  exit,
}));

function route(requirements: Record<string, string>): Journey.Route {
  return { requirements } as unknown as Journey.Route;
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
    class PostsController extends ActionController.Metal {
      index(): void {}
    }
    controllerConstants.set("posts", PostsController as never);
    const info = new RouteInfo(route({ controller: "posts", action: "index" }));
    expect(await info.unused()).toBe(false);
  });

  it("RouteInfo resolves the action through the controller's action methods", async () => {
    class PostsController extends ActionController.Metal {
      showHTML(): void {}
      sekrit_data(): void {}
    }
    controllerConstants.set("posts", PostsController as never);
    for (const action of ["showHTML", "sekrit_data"]) {
      const info = new RouteInfo(route({ controller: "posts", action }));
      expect(await info.unused()).toBe(false);
    }
    const info = new RouteInfo(route({ controller: "posts", action: "show_html" }));
    expect(await info.unused()).toBe(true);
  });

  it("RouteInfo is unused when the action and its template are both missing", async () => {
    class PostsController extends ActionController.Metal {}
    controllerConstants.set("posts", PostsController as never);
    const info = new RouteInfo(route({ controller: "posts", action: "index" }));
    expect(await info.unused()).toBe(true);
  });

  it("RouteInfo is not unused when a template covers the missing action", async () => {
    class PostsController extends ActionController.Metal {
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

  it("RouteInfo finds a camelCase action's template under its kebab-case file name", async () => {
    class PostsController extends ActionController.Metal {
      static viewPaths(): ActionView.PathSet {
        return new ActionView.PathSet([
          new ActionView.FileSystemResolver(
            new URL("./__fixtures__/views", import.meta.url).pathname,
          ),
        ]);
      }
    }
    controllerConstants.set("posts", PostsController as never);

    const covered = new RouteInfo(route({ controller: "posts", action: "recentPosts" }));
    const uncovered = new RouteInfo(route({ controller: "posts", action: "oldPosts" }));

    expect(await covered.unused()).toBe(false);
    expect(await uncovered.unused()).toBe(true);
  });

  it("RouteInfo does not count an inherited non-action method as the route's action", async () => {
    class PostsController extends ActionController.Metal {}
    controllerConstants.set("posts", PostsController as never);

    const info = new RouteInfo(route({ controller: "posts", action: "process" }));

    expect(await info.unused()).toBe(true);
  });

  it("lists a booted app's unused routes before anything has drawn them", async () => {
    const fs = getFs();
    const dir = await fs.mkdtemp!(`${(await getOsAsync()).tmpdir()}${getPath().sep}boot-app-`);
    const database = `${dir}/development.sqlite3`;
    const adapter = new BetterSQLite3Adapter({ database });
    await defineSchema(adapter);
    await adapter.disconnectBang();
    const savedEnv = env.TRAILS_ENV;
    const savedUrl = env.DATABASE_URL;
    setEnv("TRAILS_ENV", "development");
    setEnv("DATABASE_URL", `sqlite3:${database}`);
    _resetTrailsEnv();
    onTestFinished(async () => {
      vi.restoreAllMocks();
      await Base.connectionHandler.clearAllConnectionsBang("all");
      setEnv("TRAILS_ENV", savedEnv);
      setEnv("DATABASE_URL", savedUrl);
      _resetTrailsEnv();
      Trails.application = null;
      Application.appClass = null;
    });
    await import("../__fixtures__/boot-app/config/application.js");
    Trails.application!.config.setRoot(
      new URL("../__fixtures__/boot-app", import.meta.url).pathname,
    );
    await Trails.initialize();

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await createProgram().parseAsync(["routes", "-u"], { from: "user" });
    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toMatch(/^Found 1 unused route:$/m);
    expect(output).toMatch(/rails_health_check GET\s+\/up\(\.:format\)\s+rails\/health#show/);
    expect(exit).toHaveBeenCalledWith(1);
  }, 15_000);
});
