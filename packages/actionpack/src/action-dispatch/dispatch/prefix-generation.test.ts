import { describe, it, expect, beforeEach } from "vitest";
import { RouteSet } from "../routing/route-set.js";

// dispatch/prefix_generation_test.rb

function makeEnv(
  pathInfo: string,
  scriptName: string,
  host = "www.example.com",
): Record<string, unknown> {
  return {
    REQUEST_METHOD: "GET",
    PATH_INFO: pathInfo,
    SCRIPT_NAME: scriptName,
    SERVER_NAME: host,
    SERVER_PORT: "80",
    "rack.url_scheme": "http",
  };
}

function buildEngineRoutes(): RouteSet {
  const routes = new RouteSet();
  routes.draw((r) => {
    r.get("/relative_path_root", { to: r.redirect("") });
    r.get("/relative_path_redirect", { to: r.redirect("foo") });
    r.get("/relative_option_root", { to: r.redirect({ path: "" }) });
    r.get("/relative_option_redirect", { to: r.redirect({ path: "foo" }) });
    r.get("/relative_custom_root", { to: r.redirect(() => "") });
    r.get("/relative_custom_redirect", { to: r.redirect(() => "foo") });
    r.get("/absolute_path_root", { to: r.redirect("/") });
    r.get("/absolute_path_redirect", { to: r.redirect("/foo") });
    r.get("/absolute_option_root", { to: r.redirect({ path: "/" }) });
    r.get("/absolute_option_redirect", { to: r.redirect({ path: "/foo" }) });
    r.get("/absolute_custom_root", { to: r.redirect(() => "/") });
    r.get("/absolute_custom_redirect", { to: r.redirect(() => "/foo") });
  });
  return routes;
}

describe("TestGenerationPrefix::WithMountedEngine", () => {
  // [ENGINE] routing tests — require ActionController::Base + Rails::Engine dispatch
  it.skip("[ENGINE] generating engine's URL use SCRIPT_NAME from request", () => {
    // requires Rails::Engine integration test dispatch infrastructure
  });

  it.skip("[ENGINE] generating application's URL never uses SCRIPT_NAME from request", () => {
    // requires Rails::Engine integration test dispatch infrastructure
  });

  it.skip("[ENGINE] generating engine's URL with polymorphic path", () => {
    // requires Rails::Engine integration test dispatch infrastructure
  });

  it.skip("[ENGINE] url_helpers from engine have higher priority than application's url_helpers", () => {
    // requires Rails::Engine integration test dispatch infrastructure
  });

  describe("[ENGINE] redirects use SCRIPT_NAME from request", () => {
    let routes: RouteSet;

    beforeEach(() => {
      routes = buildEngineRoutes();
    });

    it("[ENGINE] relative path root uses SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/relative_path_root", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog");
    });

    it("[ENGINE] relative path redirect uses SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/relative_path_redirect", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog/foo");
    });

    it("[ENGINE] relative option root uses SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/relative_option_root", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog");
    });

    it("[ENGINE] relative option redirect uses SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/relative_option_redirect", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog/foo");
    });

    it("[ENGINE] relative custom root uses SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/relative_custom_root", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog");
    });

    it("[ENGINE] relative custom redirect uses SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/relative_custom_redirect", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/awesome/blog/foo");
    });

    it("[ENGINE] absolute path root doesn't use SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/absolute_path_root", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/");
    });

    it("[ENGINE] absolute path redirect doesn't use SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/absolute_path_redirect", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/foo");
    });

    it("[ENGINE] absolute option root doesn't use SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/absolute_option_root", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/");
    });

    it("[ENGINE] absolute option redirect doesn't use SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/absolute_option_redirect", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/foo");
    });

    it("[ENGINE] absolute custom root doesn't use SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/absolute_custom_root", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/");
    });

    it("[ENGINE] absolute custom redirect doesn't use SCRIPT_NAME from request", async () => {
      const res = await routes.call(makeEnv("/absolute_custom_redirect", "/awesome/blog"));
      expect(res[0]).toBe(301);
      expect(res[1]["location"]).toBe("http://www.example.com/foo");
    });
  });

  // [APP] tests — require ActionController::Base + Rails::Engine dispatch
  it.skip("[APP] generating engine's route includes prefix", () => {
    // requires Rails::Engine controller dispatch and mounted helper prefix resolution
  });

  it.skip("[APP] generating engine's route includes default_url_options[:script_name]", () => {
    // requires Rails::Engine controller dispatch and mounted helper prefix resolution
  });

  it.skip("[APP] generating engine's URL with polymorphic path", () => {
    // requires Rails::Engine controller dispatch and mounted helper prefix resolution
  });

  it.skip("polymorphic_path_for_app", () => {
    // requires Rails::Engine controller dispatch
  });

  it.skip("[APP] generating engine's URL with url_for(@post)", () => {
    // requires Rails::Engine controller dispatch and mounted helper prefix resolution
  });

  it.skip("[APP] instance variable with same name as engine", () => {
    // requires Rails::Engine controller dispatch and mounted helper prefix resolution
  });

  // [OBJECT] tests — require url_helpers prefix bridge between engine and app routes
  it.skip("[OBJECT] proxy route should override respond_to?() as expected", () => {
    // requires MountedHelpers with engine script_namer wired from app routes
  });

  it.skip("[OBJECT] generating engine's route includes prefix", () => {
    // requires url_helpers to carry the engine mount prefix from the app route set
  });

  it.skip("[OBJECT] generating engine's route includes dynamic prefix", () => {
    // requires url_helpers to carry the engine mount prefix from the app route set
  });

  it.skip("[OBJECT] generating engine's route includes default_url_options[:script_name]", () => {
    // requires url_helpers to carry the engine mount prefix from the app route set
  });

  it.skip("[OBJECT] generating application's route", () => {
    // requires app url_helpers with root_path helper wired
  });

  it.skip("[OBJECT] generating application's route includes default_url_options[:script_name]", () => {
    // requires app url_helpers with default_url_options script_name propagation
  });

  it.skip("[OBJECT] generating application's route includes default_url_options[:trailing_slash]", () => {
    // requires engine url_helpers with trailing_slash default_url_option propagation
  });

  it.skip("[OBJECT] generating engine's route with url_for", () => {
    // requires url_for on engine object with prefix resolution from mounted app
  });

  it.skip("[OBJECT] generating engine's route with named route helpers", () => {
    // requires url_helpers with mount prefix bridge
  });

  it.skip("[OBJECT] generating engine's route with polymorphic_url", () => {
    // requires polymorphic_url with engine mount prefix resolution
  });
});

describe("TestGenerationPrefix::EngineMountedAtRoot", () => {
  let routes: RouteSet;

  beforeEach(() => {
    routes = buildEngineRoutes();
  });

  it.skip("generating path inside engine", () => {
    // requires Rails::Engine controller dispatch (PostsController#show renders post_path)
  });

  it("[ENGINE] relative path root uses SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/relative_path_root", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] relative path redirect uses SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/relative_path_redirect", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });

  it("[ENGINE] relative option root uses SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/relative_option_root", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] relative option redirect uses SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/relative_option_redirect", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });

  it("[ENGINE] relative custom root uses SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/relative_custom_root", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] relative custom redirect uses SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/relative_custom_redirect", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });

  it("[ENGINE] absolute path root doesn't use SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/absolute_path_root", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] absolute path redirect doesn't use SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/absolute_path_redirect", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });

  it("[ENGINE] absolute option root doesn't use SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/absolute_option_root", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] absolute option redirect doesn't use SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/absolute_option_redirect", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });

  it("[ENGINE] absolute custom root doesn't use SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/absolute_custom_root", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/");
  });

  it("[ENGINE] absolute custom redirect doesn't use SCRIPT_NAME from request", async () => {
    const res = await routes.call(makeEnv("/absolute_custom_redirect", ""));
    expect(res[0]).toBe(301);
    expect(res[1]["location"]).toBe("http://www.example.com/foo");
  });
});
