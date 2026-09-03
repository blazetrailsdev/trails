import { describe, it, expect, beforeEach } from "vitest";
import { RouteSet } from "../routing/route-set.js";

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
  it.skip("[ENGINE] generating engine's URL use SCRIPT_NAME from request", () => {});

  it.skip("[ENGINE] generating application's URL never uses SCRIPT_NAME from request", () => {});

  it.skip("[ENGINE] generating engine's URL with polymorphic path", () => {});

  it.skip("[ENGINE] url_helpers from engine have higher priority than application's url_helpers", () => {});

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
  let routes: RouteSet;

  beforeEach(() => {
    routes = buildEngineRoutes();
  });

  it.skip("generating path inside engine", () => {});

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
