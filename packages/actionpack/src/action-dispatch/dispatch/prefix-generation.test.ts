import { describe, it, expect } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { Engine } from "@blazetrails/trailties/engine";
import { Trailtie } from "@blazetrails/trailties/trailtie";
import type { MountableApp } from "../routing/mapper.js";
import { RouteSet } from "../routing/route-set.js";
import { FIXTURE_LOAD_PATH } from "../../test-helpers/abstract-unit.js";

TopLevel.Trails = { Engine, Trailtie } as unknown as typeof TopLevel.Trails;

function get(app: Engine, path: string): Promise<RackResponse> {
  const env: RackEnv = {
    REQUEST_METHOD: "GET",
    PATH_INFO: path,
    SCRIPT_NAME: "",
    SERVER_NAME: "www.example.com",
    SERVER_PORT: "80",
    "rack.url_scheme": "http",
  };
  return app.call(env);
}

describe("TestGenerationPrefix::WithMountedEngine", () => {
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

  const app = (): Engine => RailsApplication.instance();

  it.skip("[ENGINE] generating engine's URL use SCRIPT_NAME from request", () => {});

  it.skip("[ENGINE] generating application's URL never uses SCRIPT_NAME from request", () => {});

  it.skip("[ENGINE] generating engine's URL with polymorphic path", () => {});

  it.skip("[ENGINE] url_helpers from engine have higher priority than application's url_helpers", () => {});

  describe("[ENGINE] redirects use SCRIPT_NAME from request", () => {
    it("[ENGINE] relative path root uses SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/relative_path_root");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog");
    });

    it("[ENGINE] relative path redirect uses SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/relative_path_redirect");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog/foo");
    });

    it("[ENGINE] relative option root uses SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/relative_option_root");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog");
    });

    it("[ENGINE] relative option redirect uses SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/relative_option_redirect");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog/foo");
    });

    it("[ENGINE] relative custom root uses SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/relative_custom_root");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog");
    });

    it("[ENGINE] relative custom redirect uses SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/relative_custom_redirect");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog/foo");
    });

    it("[ENGINE] absolute path root doesn't use SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/absolute_path_root");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/");
    });

    it("[ENGINE] absolute path redirect doesn't use SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/absolute_path_redirect");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/foo");
    });

    it("[ENGINE] absolute option root doesn't use SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/absolute_option_root");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/");
    });

    it("[ENGINE] absolute option redirect doesn't use SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/absolute_option_redirect");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/foo");
    });

    it("[ENGINE] absolute custom root doesn't use SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/absolute_custom_root");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/");
    });

    it("[ENGINE] absolute custom redirect doesn't use SCRIPT_NAME from request", async () => {
      const res = await get(app(), "/awesome/blog/absolute_custom_redirect");
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/foo");
    });
  });

  it.skip("[APP] generating engine's route includes prefix", () => {});

  it.skip("[APP] generating engine's route includes default_url_options[:script_name]", () => {});

  it.skip("[APP] generating engine's URL with polymorphic path", () => {});

  it.skip("polymorphic_path_for_app", () => {});

  it.skip("[APP] generating engine's URL with url_for(@post)", () => {});

  it.skip("[APP] instance variable with same name as engine", () => {});

  it.skip("[OBJECT] proxy route should override respond_to?() as expected", () => {});

  it.skip("[OBJECT] generating engine's route includes prefix", () => {});

  it.skip("[OBJECT] generating engine's route includes dynamic prefix", () => {});

  it.skip("[OBJECT] generating engine's route includes default_url_options[:script_name]", () => {});

  it.skip("[OBJECT] generating application's route", () => {});

  it.skip("[OBJECT] generating application's route includes default_url_options[:script_name]", () => {});

  it.skip("[OBJECT] generating application's route includes default_url_options[:trailing_slash]", () => {});

  it.skip("[OBJECT] generating engine's route with url_for", () => {});

  it.skip("[OBJECT] generating engine's route with named route helpers", () => {});

  it.skip("[OBJECT] generating engine's route with polymorphic_url", () => {});
});

describe("TestGenerationPrefix::EngineMountedAtRoot", () => {
  class BlogEngine extends Engine {
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

    static override call(env: RackEnv): Promise<RackResponse> {
      env["action_dispatch.routes"] = this.routes();
      return this.routes().call(env);
    }

    static {
      Object.defineProperty(this, "name", {
        value: "TestGenerationPrefix::EngineMountedAtRoot::BlogEngine",
      });
      Engine.register(this, File.dirname(FIXTURE_LOAD_PATH));
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

  const app = (): Engine => RailsApplication.instance();

  it.skip("generating path inside engine", () => {});

  it("[ENGINE] relative path root uses SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/relative_path_root");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] relative path redirect uses SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/relative_path_redirect");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });

  it("[ENGINE] relative option root uses SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/relative_option_root");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] relative option redirect uses SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/relative_option_redirect");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });

  it("[ENGINE] relative custom root uses SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/relative_custom_root");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] relative custom redirect uses SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/relative_custom_redirect");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });

  it("[ENGINE] absolute path root doesn't use SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/absolute_path_root");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] absolute path redirect doesn't use SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/absolute_path_redirect");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });

  it("[ENGINE] absolute option root doesn't use SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/absolute_option_root");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] absolute option redirect doesn't use SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/absolute_option_redirect");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });

  it("[ENGINE] absolute custom root doesn't use SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/absolute_custom_root");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] absolute custom redirect doesn't use SCRIPT_NAME from request", async () => {
    const res = await get(app(), "/absolute_custom_redirect");
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });
});
