import { describe, it, expect, afterEach, onTestFinished, vi } from "vitest";
import { ActionController, ActionView, type Journey } from "@blazetrails/actionpack";
import { Base } from "@blazetrails/activerecord";
import { capture } from "@blazetrails/activesupport";
import {
  env,
  getFs,
  getOsAsync,
  getPath,
  setEnv,
  rbFLoad,
  registerConstant,
  unregisterConstant,
} from "@blazetrails/ruby-compat";
import { Application } from "../application.js";
import { invoke } from "../command.js";
import { Trails, _resetTrailsEnv } from "../rails.js";
import { RouteInfo } from "./unused-routes.js";
import { lookupBang } from "../command/behavior.js";

await lookupBang();

const exit = vi.hoisted(() => vi.fn());
vi.mock("@blazetrails/ruby-compat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@blazetrails/ruby-compat")>()),
  exit,
}));

function route(requirements: Record<string, string>): Journey.Route {
  return { requirements } as unknown as Journey.Route;
}

describe("UnusedRoutesCommand", () => {
  const seated: [string, unknown][] = [];
  const seat = (name: string, klass: unknown): void => {
    registerConstant(name, klass);
    seated.push([name, klass]);
  };

  afterEach(() => {
    for (const [name, klass] of seated.splice(0)) unregisterConstant(name, klass);
  });

  it("RouteInfo is unused when the controller class is not registered", async () => {
    const info = new RouteInfo(route({ controller: "posts", action: "index" }));
    expect(await info.unused()).toBe(true);
  });

  it("RouteInfo is not unused when the controller defines the action", async () => {
    class PostsController extends ActionController.Metal {
      index(): void {}
    }
    seat("PostsController", PostsController);
    const info = new RouteInfo(route({ controller: "posts", action: "index" }));
    expect(await info.unused()).toBe(false);
  });

  it("RouteInfo resolves the action through the controller's action methods", async () => {
    class PostsController extends ActionController.Metal {
      showHTML(): void {}
      sekrit_data(): void {}
    }
    seat("PostsController", PostsController);
    for (const action of ["showHTML", "sekrit_data"]) {
      const info = new RouteInfo(route({ controller: "posts", action }));
      expect(await info.unused()).toBe(false);
    }
    const info = new RouteInfo(route({ controller: "posts", action: "show_html" }));
    expect(await info.unused()).toBe(true);
  });

  it("RouteInfo is unused when the action and its template are both missing", async () => {
    class PostsController extends ActionController.Metal {}
    seat("PostsController", PostsController);
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
    seat("PostsController", PostsController);
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
    seat("PostsController", PostsController);

    const covered = new RouteInfo(route({ controller: "posts", action: "recentPosts" }));
    const uncovered = new RouteInfo(route({ controller: "posts", action: "oldPosts" }));

    expect(await covered.unused()).toBe(false);
    expect(await uncovered.unused()).toBe(true);
  });

  it("RouteInfo finds a multi-word controller's template in its kebab-case view directory", async () => {
    class StoryPagesController extends ActionController.Metal {
      static viewPaths(): ActionView.PathSet {
        return new ActionView.PathSet([
          new ActionView.FileSystemResolver(
            new URL("./__fixtures__/views", import.meta.url).pathname,
          ),
        ]);
      }
    }
    seat("Admin::StoryPagesController", StoryPagesController);

    const covered = new RouteInfo(route({ controller: "admin/story_pages", action: "index" }));
    const uncovered = new RouteInfo(route({ controller: "admin/story_pages", action: "show" }));

    expect(await covered.unused()).toBe(false);
    expect(await uncovered.unused()).toBe(true);
  });

  it("RouteInfo does not count an inherited non-action method as the route's action", async () => {
    class PostsController extends ActionController.Metal {}
    seat("PostsController", PostsController);

    const info = new RouteInfo(route({ controller: "posts", action: "process" }));

    expect(await info.unused()).toBe(true);
  });

  it("RouteInfo resolves the framework rails/pwa controller by its Rails constant", async () => {
    await import("../pwa-controller.js");

    const info = new RouteInfo(route({ controller: "rails/pwa", action: "manifest" }));

    expect(await info.unused()).toBe(false);
  });

  it("lists a booted app's unused routes before anything has drawn them", async () => {
    const fs = getFs();
    const dir = await fs.mkdtemp!(`${(await getOsAsync()).tmpdir()}${getPath().sep}boot-app-`);
    const database = `${dir}/development.sqlite3`;
    await Base.establishConnection({ adapter: "sqlite3", database });
    await rbFLoad(new URL("../__fixtures__/boot-app/db/schema.ts", import.meta.url).pathname);
    await Base.removeConnection();
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

    const output = await capture(":stdout", () => invoke("routes", ["-u"]));
    expect(output).toMatch(/^Found 1 unused route:$/m);
    expect(output).toMatch(/legacy GET\s+\/legacy\(\.:format\)\s+legacy#index/);
    expect(exit).toHaveBeenCalledWith(1);
  }, 15_000);
});

describe("unusedRoutesCommand", () => {
  it("hands its flags to Thor unparsed", async () => {
    const { UnusedRoutesCommand } = await import("./unused-routes.js");
    const perform = vi.spyOn(UnusedRoutesCommand, "perform").mockResolvedValue();
    onTestFinished(() => perform.mockRestore());
    await invoke("unused-routes", ["--controller", "Posts", "-g", "x"]);
    expect(perform).toHaveBeenCalledWith("unused-routes", ["--controller", "Posts", "-g", "x"], {});
  });
});
