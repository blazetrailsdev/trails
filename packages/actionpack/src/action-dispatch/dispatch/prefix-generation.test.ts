/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Ruby `include BlogEngine.routes.url_helpers` / `include RailsApplication.routes.mounted_helpers`;
   the class/interface merge is how `include()` surfaces those members on the type side. */
import { beforeEach, describe, it, expect } from "vitest";
import { ModelName, Naming } from "@blazetrails/activemodel";
import { assertRespondTo, extend, TopLevel } from "@blazetrails/activesupport";
import {
  File,
  include,
  initialize,
  initializeIncludedModules,
  Module,
} from "@blazetrails/ruby-compat";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { Engine } from "@blazetrails/trailties/engine";
import { Trailtie } from "@blazetrails/trailties/trailtie";
import { Base } from "../../action-controller/base.js";
import { controllerConstants } from "../http/request.js";
import type { MountableApp } from "../routing/mapper.js";
import { RouteSet } from "../routing/route-set.js";
import type { RoutesProxyInstance } from "../routing/routes-proxy.js";
import { UrlFor } from "../routing/url-for.js";
import { IntegrationTest } from "../testing/integration.js";
import { FIXTURE_LOAD_PATH } from "../../test-helpers/abstract-unit.js";

TopLevel.Trails = { Engine, Trailtie } as unknown as typeof TopLevel.Trails;

type Helper = (...args: unknown[]) => string;

class Post {
  declare static _modelName?: ModelName | null;
  declare readonly modelName: ModelName;

  toParam(): string {
    return "1";
  }

  static get modelName(): ModelName {
    const klass = "Post";

    return new ModelName(klass);
  }

  toModel(): this {
    return this;
  }

  isPersisted(): boolean {
    return true;
  }
}
extend(Post, Naming);

describe("WithMountedEngine", () => {
  class BlogEngine extends Engine {
    declare static routes: () => RouteSet;

    static {
      Object.defineProperty(this, "name", {
        value: "TestGenerationPrefix::WithMountedEngine::BlogEngine",
      });
      Engine.register(this, File.dirname(FIXTURE_LOAD_PATH));
      this.routes().draw(function () {
        this.get("/posts/:id", { to: "inside_engine_generating#show", as: "post" });
        this.get("/posts", { to: "inside_engine_generating#index", as: "posts" });
        this.get("/url_to_application", { to: "inside_engine_generating#url_to_application" });
        this.get("/polymorphic_path_for_engine", {
          to: "inside_engine_generating#polymorphic_path_for_engine",
        });
        this.get("/conflicting_url", { to: "inside_engine_generating#conflicting" });
        this.get("/foo", {
          to: "never#invoked",
          as: "named_helper_that_should_be_invoked_only_in_respond_to_test",
        });

        this.get("/relative_path_root", { to: this.redirect("") });
        this.get("/relative_path_redirect", { to: this.redirect("foo") });
        this.get("/relative_option_root", { to: this.redirect({ path: "" }) });
        this.get("/relative_option_redirect", { to: this.redirect({ path: "foo" }) });
        this.get("/relative_custom_root", { to: this.redirect(() => "") });
        this.get("/relative_custom_redirect", { to: this.redirect(() => "foo") });

        this.get("/absolute_path_root", { to: this.redirect("/") });
        this.get("/absolute_path_redirect", { to: this.redirect("/foo") });
        this.get("/absolute_option_root", { to: this.redirect({ path: "/" }) });
        this.get("/absolute_option_redirect", { to: this.redirect({ path: "/foo" }) });
        this.get("/absolute_custom_root", { to: this.redirect(() => "/") });
        this.get("/absolute_custom_redirect", { to: this.redirect(() => "/foo") });
      });
    }
  }

  class RailsApplication extends Engine {
    declare static routes: () => RouteSet;

    static {
      Object.defineProperty(this, "name", {
        value: "TestGenerationPrefix::WithMountedEngine::RailsApplication",
      });
      Engine.register(this, File.dirname(FIXTURE_LOAD_PATH));
      this.routes().draw(function () {
        this.scope("/:omg", { omg: "awesome" }, () => {
          this.mount(BlogEngine as unknown as MountableApp, {
            at: "/blog",
            as: "blog_engine",
          });
        });
        this.get("/posts/:id", { to: "outside_engine_generating#post", as: "post" });
        this.get("/generate", { to: "outside_engine_generating#index" });
        this.get("/polymorphic_path_for_app", {
          to: "outside_engine_generating#polymorphic_path_for_app",
        });
        this.get("/polymorphic_path_for_engine", {
          to: "outside_engine_generating#polymorphic_path_for_engine",
        });
        this.get("/polymorphic_with_url_for", {
          to: "outside_engine_generating#polymorphic_with_url_for",
        });
        this.get("/conflicting_url", { to: "outside_engine_generating#conflicting" });
        this.get("/ivar_usage", { to: "outside_engine_generating#ivar_usage" });
        this.root({ to: "outside_engine_generating#index" });
      });
    }
  }

  RailsApplication.routes().defineMountedHelper("main_app");

  class InsideEngineGeneratingController extends Base {
    async index(): Promise<void> {
      await this.render({ plain: this.postsPath() });
    }

    async show(): Promise<void> {
      await this.render({ plain: this.postPath({ id: this.params.get("id") }) });
    }

    async url_to_application(): Promise<void> {
      const path = this.mainApp.urlFor({
        controller: "outside_engine_generating",
        action: "index",
        onlyPath: true,
      });
      await this.render({ plain: path });
    }

    async polymorphic_path_for_engine(): Promise<void> {
      await this.render({ plain: this.polymorphicPath(new Post()) });
    }

    async conflicting(): Promise<void> {
      await this.render({ plain: "engine" });
    }
  }
  interface InsideEngineGeneratingController {
    postsPath: Helper;
    postPath: Helper;
    polymorphicPath: Helper;
    mainApp: RoutesProxyInstance;
  }
  include(InsideEngineGeneratingController, BlogEngine.routes().urlHelpers());
  include(InsideEngineGeneratingController, RailsApplication.routes().mountedHelpers());
  controllerConstants.set("inside_engine_generating", InsideEngineGeneratingController);

  class OutsideEngineGeneratingController extends Base {
    async index(): Promise<void> {
      await this.render({ plain: this.blogEngine.postPath({ id: 1 }) });
    }

    async polymorphic_path_for_engine(): Promise<void> {
      await this.render({ plain: this.blogEngine.polymorphicPath(new Post()) });
    }

    async polymorphic_path_for_app(): Promise<void> {
      await this.render({ plain: this.polymorphicPath(new Post()) });
    }

    async polymorphic_with_url_for(): Promise<void> {
      await this.render({ plain: this.blogEngine.urlFor(new Post()) });
    }

    async conflicting(): Promise<void> {
      await this.render({ plain: "application" });
    }

    async ivar_usage(): Promise<void> {
      (this as { blogEngine: unknown }).blogEngine = "Not the engine route helper";
      await this.render({ plain: this.blogEngine.postPath({ id: 1 }) });
    }
  }
  interface OutsideEngineGeneratingController {
    polymorphicPath: Helper;
    blogEngine: RoutesProxyInstance;
  }
  include(OutsideEngineGeneratingController, BlogEngine.routes().mountedHelpers());
  include(OutsideEngineGeneratingController, RailsApplication.routes().urlHelpers());
  controllerConstants.set("outside_engine_generating", OutsideEngineGeneratingController);

  const KwObject = new Module((mod) => {
    (mod as unknown as Record<symbol, unknown>)[initialize] = function (_options: {
      kw: unknown;
    }) {};
  });

  class EngineObject {
    constructor(...args: unknown[]) {
      initializeIncludedModules(this, ...args);
    }
  }
  interface EngineObject {
    postPath: Helper;
    postsPath: Helper;
    postsUrl: Helper;
    urlFor: Helper;
    polymorphicPath: Helper;
    polymorphicUrl: Helper;
  }
  include(EngineObject, KwObject);
  include(EngineObject, UrlFor);
  include(EngineObject, BlogEngine.routes().urlHelpers());

  class AppObject {
    constructor(...args: unknown[]) {
      initializeIncludedModules(this, ...args);
    }
  }
  interface AppObject {
    rootPath: Helper;
  }
  include(AppObject, KwObject);
  include(AppObject, UrlFor);
  include(AppObject, RailsApplication.routes().urlHelpers());

  class WithMountedEngine extends IntegrationTest {
    override get app(): unknown {
      return RailsApplication.instance();
    }

    engineObject!: EngineObject;
    appObject!: AppObject;

    static {
      this.prototype.setup = function (this: WithMountedEngine): void {
        RailsApplication.routes().defaultUrlOptions = {};
        this.engineObject = new EngineObject({ kw: 1 });
        this.appObject = new AppObject({ kw: 2 });
      };
    }
  }
  interface WithMountedEngine {
    blogEngine: RoutesProxyInstance;
  }
  include(WithMountedEngine, BlogEngine.routes().mountedHelpers());

  let t: WithMountedEngine;
  beforeEach(() => {
    t = new WithMountedEngine();
    t.beforeSetup();
    t.setup();
  });

  const verifyRedirect = (url: string, status: number = 301): void => {
    expect(t.response.status).toBe(status);
    expect(t.response.headers.get("Location")).toBe(url);
    expect(t.response.body).toBe("");
  };

  it("[ENGINE] generating engine's URL use SCRIPT_NAME from request", async () => {
    await t.get("/pure-awesomeness/blog/posts/1");
    expect(t.response.body).toBe("/pure-awesomeness/blog/posts/1");
  });

  it("[ENGINE] generating application's URL never uses SCRIPT_NAME from request", async () => {
    await t.get("/pure-awesomeness/blog/url_to_application");
    expect(t.response.body).toBe("/generate");
  });

  it("[ENGINE] generating engine's URL with polymorphic path", async () => {
    await t.get("/pure-awesomeness/blog/polymorphic_path_for_engine");
    expect(t.response.body).toBe("/pure-awesomeness/blog/posts/1");
  });

  it("[ENGINE] url_helpers from engine have higher priority than application's url_helpers", async () => {
    await t.get("/awesome/blog/conflicting_url");
    expect(t.response.body).toBe("engine");
  });

  it("[ENGINE] relative path root uses SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/relative_path_root");
    verifyRedirect("http://www.example.com/awesome/blog");
  });

  it("[ENGINE] relative path redirect uses SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/relative_path_redirect");
    verifyRedirect("http://www.example.com/awesome/blog/foo");
  });

  it("[ENGINE] relative option root uses SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/relative_option_root");
    verifyRedirect("http://www.example.com/awesome/blog");
  });

  it("[ENGINE] relative option redirect uses SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/relative_option_redirect");
    verifyRedirect("http://www.example.com/awesome/blog/foo");
  });

  it("[ENGINE] relative custom root uses SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/relative_custom_root");
    verifyRedirect("http://www.example.com/awesome/blog");
  });

  it("[ENGINE] relative custom redirect uses SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/relative_custom_redirect");
    verifyRedirect("http://www.example.com/awesome/blog/foo");
  });

  it("[ENGINE] absolute path root doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/absolute_path_root");
    verifyRedirect("http://www.example.com/");
  });

  it("[ENGINE] absolute path redirect doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/absolute_path_redirect");
    verifyRedirect("http://www.example.com/foo");
  });

  it("[ENGINE] absolute option root doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/absolute_option_root");
    verifyRedirect("http://www.example.com/");
  });

  it("[ENGINE] absolute option redirect doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/absolute_option_redirect");
    verifyRedirect("http://www.example.com/foo");
  });

  it("[ENGINE] absolute custom root doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/absolute_custom_root");
    verifyRedirect("http://www.example.com/");
  });

  it("[ENGINE] absolute custom redirect doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/awesome/blog/absolute_custom_redirect");
    verifyRedirect("http://www.example.com/foo");
  });
  it("[APP] generating engine's route includes prefix", async () => {
    await t.get("/generate");
    expect(t.response.body).toBe("/awesome/blog/posts/1");
  });

  it("[APP] generating engine's route includes default_url_options[:script_name]", async () => {
    RailsApplication.routes().defaultUrlOptions = { scriptName: "/something" };
    await t.get("/generate");
    expect(t.response.body).toBe("/something/awesome/blog/posts/1");
  });

  it("[APP] generating engine's URL with polymorphic path", async () => {
    await t.get("/polymorphic_path_for_engine");
    expect(t.response.body).toBe("/awesome/blog/posts/1");
  });

  it("polymorphic_path_for_app", async () => {
    await t.get("/polymorphic_path_for_app");
    expect(t.response.body).toBe("/posts/1");
  });

  it("[APP] generating engine's URL with url_for(@post)", async () => {
    await t.get("/polymorphic_with_url_for");
    expect(t.response.body).toBe("http://www.example.com/awesome/blog/posts/1");
  });

  it.skip("[APP] instance variable with same name as engine", () => {
    // PERMANENT-SKIP: asserts that Ruby's `@blog_engine` ivar and its `blog_engine` method are separate names; a JS object has one namespace for fields and methods, so the controller's `blogEngine` field IS the mounted helper and assigning it raises TypeError.
  });

  it("[OBJECT] proxy route should override respond_to?() as expected", () => {
    assertRespondTo(t.blogEngine, "namedHelperThatShouldBeInvokedOnlyInRespondToTestPath");
  });

  it("[OBJECT] generating engine's route includes prefix", () => {
    expect(t.engineObject.postPath({ id: 1 })).toBe("/awesome/blog/posts/1");
  });

  it("[OBJECT] generating engine's route includes dynamic prefix", () => {
    expect(t.engineObject.postPath({ id: 3, omg: "pure-awesomeness" })).toBe(
      "/pure-awesomeness/blog/posts/3",
    );
  });

  it("[OBJECT] generating engine's route includes default_url_options[:script_name]", () => {
    RailsApplication.routes().defaultUrlOptions = { scriptName: "/something" };
    expect(t.engineObject.postPath({ id: 3, omg: "pure-awesomeness" })).toBe(
      "/something/pure-awesomeness/blog/posts/3",
    );
  });

  it("[OBJECT] generating application's route", () => {
    expect(t.appObject.rootPath()).toBe("/");
  });

  it("[OBJECT] generating application's route includes default_url_options[:script_name]", () => {
    RailsApplication.routes().defaultUrlOptions = { scriptName: "/something" };
    expect(t.appObject.rootPath()).toBe("/something/");
  });

  it("[OBJECT] generating application's route includes default_url_options[:trailing_slash]", () => {
    RailsApplication.routes().defaultUrlOptions["trailingSlash"] = true;
    expect(t.engineObject.postsPath()).toBe("/awesome/blog/posts");
  });

  it("[OBJECT] generating engine's route with url_for", () => {
    const path = t.engineObject.urlFor({
      controller: "inside_engine_generating",
      action: "show",
      onlyPath: true,
      omg: "omg",
      id: 1,
    });
    expect(path).toBe("/omg/blog/posts/1");
  });

  it("[OBJECT] generating engine's route with named route helpers", () => {
    let path = t.engineObject.postsPath();
    expect(path).toBe("/awesome/blog/posts");

    path = t.engineObject.postsUrl({ host: "example.com" });
    expect(path).toBe("http://example.com/awesome/blog/posts");
  });

  it("[OBJECT] generating engine's route with polymorphic_url", () => {
    let path = t.engineObject.polymorphicPath(new Post());
    expect(path).toBe("/awesome/blog/posts/1");

    path = t.engineObject.polymorphicUrl(new Post(), { host: "www.example.com" });
    expect(path).toBe("http://www.example.com/awesome/blog/posts/1");
  });
});

describe("EngineMountedAtRoot", () => {
  class BlogEngine {
    static _routes?: RouteSet;

    static routes(): RouteSet {
      return (this._routes ??= (() => {
        const routes = new RouteSet();
        routes.draw(function () {
          this.get("/posts/:id", { to: "posts#show", as: "post" });

          this.get("/relative_path_root", { to: this.redirect("") });
          this.get("/relative_path_redirect", { to: this.redirect("foo") });
          this.get("/relative_option_root", { to: this.redirect({ path: "" }) });
          this.get("/relative_option_redirect", { to: this.redirect({ path: "foo" }) });
          this.get("/relative_custom_root", { to: this.redirect(() => "") });
          this.get("/relative_custom_redirect", { to: this.redirect(() => "foo") });

          this.get("/absolute_path_root", { to: this.redirect("/") });
          this.get("/absolute_path_redirect", { to: this.redirect("/foo") });
          this.get("/absolute_option_root", { to: this.redirect({ path: "/" }) });
          this.get("/absolute_option_redirect", { to: this.redirect({ path: "/foo" }) });
          this.get("/absolute_custom_root", { to: this.redirect(() => "/") });
          this.get("/absolute_custom_redirect", { to: this.redirect(() => "/foo") });
        });

        return routes;
      })());
    }

    static call(env: RackEnv): Promise<RackResponse> {
      env["action_dispatch.routes"] = this.routes();
      return this.routes().call(env);
    }

    static {
      Object.defineProperty(this, "name", {
        value: "TestGenerationPrefix::EngineMountedAtRoot::BlogEngine",
      });
    }
  }

  class RailsApplication extends Engine {
    declare static routes: () => RouteSet;

    static {
      Object.defineProperty(this, "name", {
        value: "TestGenerationPrefix::EngineMountedAtRoot::RailsApplication",
      });
      Engine.register(this, File.dirname(FIXTURE_LOAD_PATH));
      this.routes().draw(function () {
        this.mount(BlogEngine as unknown as MountableApp, { at: "/" });
      });
    }
  }

  class PostsController extends Base {
    async show(): Promise<void> {
      await this.render({ plain: this.postPath({ id: this.params.get("id") }) });
    }
  }
  interface PostsController {
    postPath: Helper;
  }
  include(PostsController, BlogEngine.routes().urlHelpers());
  include(PostsController, RailsApplication.routes().mountedHelpers());
  controllerConstants.set("posts", PostsController);

  class EngineMountedAtRoot extends IntegrationTest {
    override get app(): unknown {
      return RailsApplication.instance();
    }
  }

  let t: EngineMountedAtRoot;
  beforeEach(() => {
    t = new EngineMountedAtRoot();
  });

  const verifyRedirect = (url: string, status: number = 301): void => {
    expect(t.response.status).toBe(status);
    expect(t.response.headers.get("Location")).toBe(url);
    expect(t.response.body).toBe("");
  };

  it("generating path inside engine", async () => {
    await t.get("/posts/1");
    expect(t.response.body).toBe("/posts/1");
  });

  it("[ENGINE] relative path root uses SCRIPT_NAME from request", async () => {
    await t.get("/relative_path_root");
    verifyRedirect("http://www.example.com/");
  });

  it("[ENGINE] relative path redirect uses SCRIPT_NAME from request", async () => {
    await t.get("/relative_path_redirect");
    verifyRedirect("http://www.example.com/foo");
  });

  it("[ENGINE] relative option root uses SCRIPT_NAME from request", async () => {
    await t.get("/relative_option_root");
    verifyRedirect("http://www.example.com/");
  });

  it("[ENGINE] relative option redirect uses SCRIPT_NAME from request", async () => {
    await t.get("/relative_option_redirect");
    verifyRedirect("http://www.example.com/foo");
  });

  it("[ENGINE] relative custom root uses SCRIPT_NAME from request", async () => {
    await t.get("/relative_custom_root");
    verifyRedirect("http://www.example.com/");
  });

  it("[ENGINE] relative custom redirect uses SCRIPT_NAME from request", async () => {
    await t.get("/relative_custom_redirect");
    verifyRedirect("http://www.example.com/foo");
  });

  it("[ENGINE] absolute path root doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/absolute_path_root");
    verifyRedirect("http://www.example.com/");
  });

  it("[ENGINE] absolute path redirect doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/absolute_path_redirect");
    verifyRedirect("http://www.example.com/foo");
  });

  it("[ENGINE] absolute option root doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/absolute_option_root");
    verifyRedirect("http://www.example.com/");
  });

  it("[ENGINE] absolute option redirect doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/absolute_option_redirect");
    verifyRedirect("http://www.example.com/foo");
  });

  it("[ENGINE] absolute custom root doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/absolute_custom_root");
    verifyRedirect("http://www.example.com/");
  });

  it("[ENGINE] absolute custom redirect doesn't use SCRIPT_NAME from request", async () => {
    await t.get("/absolute_custom_redirect");
    verifyRedirect("http://www.example.com/foo");
  });
});
