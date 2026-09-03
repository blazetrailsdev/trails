import { describe, it, expect, beforeEach } from "vitest";

import { bodyFromString, bodyToString } from "@blazetrails/rack";
import { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { RoutingError, UrlGenerationError } from "../metal/exceptions.js";

function urlFor(rs: RouteSet, options: Record<string, unknown>): string {
  const opts = { ...options };
  return rs.generateExtras(opts)[0];
}

async function rackGet(rs: RouteSet, urlStr: string): Promise<string> {
  const url = new URL(urlStr);
  const env = {
    REQUEST_METHOD: "GET",
    PATH_INFO: url.pathname,
    HTTP_HOST: url.host,
    "rack.url_scheme": "http",
    "action_dispatch.request.path_parameters": {} as Record<string, unknown>,
  };
  const [status, , body] = await rs.call(env as any);
  if (status === 404) return "Not Found";
  return bodyToString(body);
}

describe("UriReservedCharactersRoutingTest", () => {
  let rs: RouteSet;
  let segment: string;
  let escaped: string;

  beforeEach(() => {
    rs = new RouteSet();
    rs.draw((r) => {
      r.get(":controller/:action/:variable/*additional", {});
    });

    const safe = [":", "@", "&", "=", "+", "$", ",", ";"];
    const unsafe = ["^", "?", "#", "[", "]"];
    const hex = unsafe.map(
      (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
    );

    segment = safe.join("") + unsafe.join("");
    escaped = safe.join("") + hex.join("");
  });

  it.skip("route generation escapes unsafe path characters", () => {
    expect(
      urlFor(rs, {
        controller: "content",
        action: `act${segment}ion`,
        variable: `var${segment}iable`,
        additional: [`add${segment}itional-1`, `add${segment}itional-2`],
      }),
    ).toBe(
      `/content/act${escaped}ion/var${escaped}iable/add${escaped}itional-1/add${escaped}itional-2`,
    );
  });

  it("route recognition unescapes path components", () => {
    const options = {
      controller: "content",
      action: `act${segment}ion`,
      variable: `var${segment}iable`,
      additional: `add${segment}itional-1/add${segment}itional-2`,
    };
    expect(
      rs.recognizePath(
        `/content/act${escaped}ion/var${escaped}iable/add${escaped}itional-1/add${escaped}itional-2`,
      ),
    ).toMatchObject(options);
  });

  it.skip("route generation allows passing non string values to generated helper", () => {
    expect(
      urlFor(rs, {
        controller: "content",
        action: "action",
        variable: "variable",
        additional: [1, 2],
      }),
    ).toBe("/content/action/variable/1/2");
  });
});

describe("LegacyRouteSetTests", () => {
  let rs: RouteSet;

  beforeEach(() => {
    rs = new RouteSet();
  });

  it("symbols with dashes", async () => {
    rs.draw((r) => {
      r.get("/:artist/:song-omg", {
        app: async (env: any) => {
          const params = env["action_dispatch.request.path_parameters"] as Record<string, string>;
          return [200, {}, bodyFromString(JSON.stringify(params))];
        },
      });
    });

    const hash = JSON.parse(await rackGet(rs, "http://example.org/journey/faithfully-omg"));
    expect(hash).toEqual({ artist: "journey", song: "faithfully" });
  });

  it("id with dash", async () => {
    rs.draw((r) => {
      r.get("/journey/:id", {
        app: async (env: any) => {
          const params = env["action_dispatch.request.path_parameters"] as Record<string, string>;
          return [200, {}, bodyFromString(JSON.stringify(params))];
        },
      });
    });

    const hash = JSON.parse(await rackGet(rs, "http://example.org/journey/faithfully-omg"));
    expect(hash).toEqual({ id: "faithfully-omg" });
  });

  it("dash with custom regexp", async () => {
    rs.draw((r) => {
      r.get("/:artist/:song-omg", {
        constraints: { song: /\d+/ },
        app: async (env: any) => {
          const params = env["action_dispatch.request.path_parameters"] as Record<string, string>;
          return [200, {}, bodyFromString(JSON.stringify(params))];
        },
      });
    });

    const hash = JSON.parse(await rackGet(rs, "http://example.org/journey/123-omg"));
    expect(hash).toEqual({ artist: "journey", song: "123" });
    expect(await rackGet(rs, "http://example.org/journey/faithfully-omg")).toBe("Not Found");
  });

  it("pre dash", async () => {
    rs.draw((r) => {
      r.get("/:artist/omg-:song", {
        app: async (env: any) => {
          const params = env["action_dispatch.request.path_parameters"] as Record<string, string>;
          return [200, {}, bodyFromString(JSON.stringify(params))];
        },
      });
    });

    const hash = JSON.parse(await rackGet(rs, "http://example.org/journey/omg-faithfully"));
    expect(hash).toEqual({ artist: "journey", song: "faithfully" });
  });

  it("pre dash with custom regexp", async () => {
    rs.draw((r) => {
      r.get("/:artist/omg-:song", {
        constraints: { song: /\d+/ },
        app: async (env: any) => {
          const params = env["action_dispatch.request.path_parameters"] as Record<string, string>;
          return [200, {}, bodyFromString(JSON.stringify(params))];
        },
      });
    });

    const hash = JSON.parse(await rackGet(rs, "http://example.org/journey/omg-123"));
    expect(hash).toEqual({ artist: "journey", song: "123" });
    expect(await rackGet(rs, "http://example.org/journey/omg-faithfully")).toBe("Not Found");
  });

  it("star paths are greedy", async () => {
    rs.draw((r) => {
      r.get("/*path", {
        format: false,
        app: async (env: any) => {
          const params = env["action_dispatch.request.path_parameters"] as Record<string, string>;
          return [200, {}, bodyFromString(params["path"])];
        },
      });
    });

    const url = new URL("http://example.org/foo/bar.html");
    expect(await rackGet(rs, url.toString())).toBe(url.pathname.replace(/^\//, ""));
  });

  it.skip("star paths are greedy but not too much", async () => {
    rs.draw((r) => {
      r.get("/*path", {
        app: async (env: any) => {
          const params = env["action_dispatch.request.path_parameters"];
          return [200, {}, bodyFromString(JSON.stringify(params))];
        },
      });
    });

    const expected = { path: "foo/bar", format: "html" };
    const result = JSON.parse(await rackGet(rs, "http://example.org/foo/bar.html"));
    expect(result).toEqual(expected);
  });

  it("optional star paths are greedy", async () => {
    rs.draw((r) => {
      r.get("/(*filters)", {
        format: false,
        app: async (env: any) => {
          const params = env["action_dispatch.request.path_parameters"] as Record<string, string>;
          return [200, {}, bodyFromString(params["filters"])];
        },
      });
    });

    const url = new URL("http://example.org/ne_27.065938,-80.6092/sw_25.489856,-82.542794");
    expect(await rackGet(rs, url.toString())).toBe(url.pathname.replace(/^\//, ""));
  });

  it.skip("optional star paths are greedy but not too much", async () => {
    rs.draw((r) => {
      r.get("/(*filters)", {
        app: async (env: any) => {
          const params = env["action_dispatch.request.path_parameters"];
          return [200, {}, bodyFromString(JSON.stringify(params))];
        },
      });
    });

    const expected = {
      filters: "ne_27.065938,-80.6092/sw_25.489856,-82",
      format: "542794",
    };
    const result = JSON.parse(
      await rackGet(rs, "http://example.org/ne_27.065938,-80.6092/sw_25.489856,-82.542794"),
    );
    expect(result).toEqual(expected);
  });

  it("regexp precedence", async () => {
    rs.draw((r) => {
      r.get("/whois/:domain", {
        constraints: { domain: /\w+\.[\w.]+/ },
        app: async (_env: any) => [200, {}, bodyFromString("regexp")],
      });
      r.get("/whois/:id", {
        app: async (_env: any) => [200, {}, bodyFromString("id")],
      });
    });

    expect(await rackGet(rs, "http://example.org/whois/example.org")).toBe("regexp");
    expect(await rackGet(rs, "http://example.org/whois/123")).toBe("id");
  });

  it.skip("format symbol constraints", async () => {
    rs.draw((r) => {
      r.get("/api", {
        constraints: { format: "json" },
        app: async (_env: any) => [200, {}, bodyFromString("json")],
      });
      r.get("/api", {
        constraints: { format: "xml" },
        app: async (_env: any) => [200, {}, bodyFromString("xml")],
      });
    });

    expect(await rackGet(rs, "http://www.example.org/api.json")).toBe("json");
    expect(await rackGet(rs, "http://clients.example.org/api.xml")).toBe("xml");
  });

  it("empty string match", async () => {
    rs.draw((r) => {
      r.get("/:username", {
        constraints: { username: /[^/]+/ },
        app: async (_env: any) => [200, {}, bodyFromString("foo")],
      });
    });

    expect(await rackGet(rs, "http://example.org/")).toBe("Not Found");
    expect(await rackGet(rs, "http://example.org/hello")).toBe("foo");
  });

  it.skip("non greedy glob regexp", async () => {
    let capturedParams: Record<string, unknown> = {};
    rs.draw((r) => {
      r.get("/posts/:id(/*filters)", {
        constraints: { filters: /.+?/ },
        app: async (env: any) => {
          capturedParams = env["action_dispatch.request.path_parameters"];
          return [200, {}, bodyFromString("foo")];
        },
      });
    });

    expect(await rackGet(rs, "http://example.org/posts/1/foo.js")).toBe("foo");
    expect(capturedParams).toMatchObject({ id: "1", filters: "foo", format: "js" });
  });

  it("specific controller action failure", () => {
    rs.draw((r) => {
      r.mount(async (_env: any) => [200, {}, bodyFromString("")], { at: "/foo" });
    });

    expect(() => urlFor(rs, { controller: "omg", action: "lol" })).toThrow(UrlGenerationError);
  });

  it("route with colon first", () => {
    rs.draw((r) => {
      r.get("/:controller/:action/:id", { defaults: { action: "index" } } as any);
      r.get(":url", { to: "content#translate" });
    });

    expect(rs.recognizePath("/example")).toMatchObject({
      controller: "content",
      action: "translate",
      url: "example",
    });
  });

  it.skip("route with regexp for action", () => {
    rs.draw((r) => {
      r.get("/:controller/:action", { action: /auth[-|_].+/ } as any);
    });

    expect(rs.recognizePath("/content/auth_google")).toMatchObject({
      action: "auth_google",
      controller: "content",
    });
    expect(rs.recognizePath("/content/auth-twitter")).toMatchObject({
      action: "auth-twitter",
      controller: "content",
    });

    expect(urlFor(rs, { controller: "content", action: "auth_google" })).toBe(
      "/content/auth_google",
    );
    expect(urlFor(rs, { controller: "content", action: "auth-twitter" })).toBe(
      "/content/auth-twitter",
    );
  });

  it.skip("route with regexp and captures for controller", () => {
    rs.draw((r) => {
      r.get("/:controller(/:action(/:id))", { controller: /admin\/(accounts|users)/ } as any);
    });

    expect(rs.recognizePath("/admin/accounts")).toMatchObject({
      controller: "admin/accounts",
      action: "index",
    });
    expect(rs.recognizePath("/admin/users")).toMatchObject({
      controller: "admin/users",
      action: "index",
    });
    expect(() => rs.recognizePath("/admin/products")).toThrow(RoutingError);
  });

  it.skip("route with regexp and dot", () => {
    rs.draw((r) => {
      r.get(":controller/:action/:file", {
        controller: /admin|user/,
        action: /upload|download/,
        defaults: { file: undefined },
        constraints: { file: /[^/]+(\.[^/]+)?/ },
      } as any);
    });

    expect(urlFor(rs, { controller: "user", action: "download", file: "file" })).toBe(
      "/user/download/file",
    );
    expect(rs.recognizePath("/user/download/file")).toMatchObject({
      controller: "user",
      action: "download",
      file: "file",
    });

    expect(urlFor(rs, { controller: "user", action: "download", file: "file.jpg" })).toBe(
      "/user/download/file.jpg",
    );
    expect(rs.recognizePath("/user/download/file.jpg")).toMatchObject({
      controller: "user",
      action: "download",
      file: "file.jpg",
    });
  });

  it("paths escaped", () => {
    rs.draw((r) => {
      r.get("file/*path", { to: "content#show_file", as: "path" });
      r.get(":controller/:action/:id", {});
    });

    const results = rs.recognizePath("/file/hello+world/how+are+you%3F");
    expect(results).toBeTruthy();
    expect(results["path"]).toBe("hello+world/how+are+you?");

    const results2 = rs.recognizePath("/file/hello%20world/how%20are%20you%3F");
    expect(results2).toBeTruthy();
    expect(results2["path"]).toBe("hello world/how are you?");
  });

  it.skip("non controllers cannot be matched", () => {
    rs.draw((r) => {
      r.get(":controller/:action/:id", {});
    });

    expect(() => rs.recognizePath("/not_a/show/10")).toThrow(RoutingError);
  });

  it.skip("should list options diff when routing constraints dont match", () => {
    rs.draw((r) => {
      r.get("post/:id", { to: "post#show", constraints: { id: /\d+/ }, as: "post" });
    });

    expect(() =>
      urlFor(rs, { controller: "post", action: "show", bad_param: "foo", use_route: "post" }),
    ).toThrow(UrlGenerationError);
  });

  it.skip("dynamic path allowed", () => {
    rs.draw((r) => {
      r.get("*path", { to: "content#show_file" });
    });

    expect(urlFor(rs, { controller: "content", action: "show_file", path: ["pages", "boo"] })).toBe(
      "/pages/boo",
    );
  });

  it("escapes newline character for dynamic path", () => {
    rs.draw((r) => {
      r.get("/dynamic/:dynamic_segment", { to: "subpath_books#show", as: "dynamic" });
      r.get(":controller/:action/:id", {});
    });

    const results = rs.recognizePath("/dynamic/a%0Anewline");
    expect(results).toBeTruthy();
    expect(results["dynamic_segment"]).toBe("a\nnewline");
  });

  it("escapes newline character for wildcard path", () => {
    rs.draw((r) => {
      r.get("/wildcard/*wildcard_segment", { to: "subpath_books#show", as: "wildcard" });
      r.get(":controller/:action/:id", {});
    });

    const results = rs.recognizePath("/wildcard/a%0Anewline");
    expect(results).toBeTruthy();
    expect(results["wildcard_segment"]).toBe("a\nnewline");
  });

  it.skip("route with integer default", () => {
    rs.draw((r) => {
      r.get("page(/:id)", { to: "content#show_page", id: 1 } as any);
    });

    expect(urlFor(rs, { controller: "content", action: "show_page" })).toBe("/page");
    expect(urlFor(rs, { controller: "content", action: "show_page", id: 1 })).toBe("/page");
    expect(urlFor(rs, { controller: "content", action: "show_page", id: "1" })).toBe("/page");
    expect(urlFor(rs, { controller: "content", action: "show_page", id: 10 })).toBe("/page/10");

    expect(rs.recognizePath("/page")).toMatchObject({
      controller: "content",
      action: "show_page",
      id: 1,
    });
    expect(rs.recognizePath("/page/1")).toMatchObject({
      controller: "content",
      action: "show_page",
      id: "1",
    });
    expect(rs.recognizePath("/page/10")).toMatchObject({
      controller: "content",
      action: "show_page",
      id: "10",
    });
  });

  it.skip("requirement should prevent optional id", () => {
    rs.draw((r) => {
      r.get("post/:id", { to: "post#show", constraints: { id: /\d+/ }, as: "post" });
    });

    expect(urlFor(rs, { controller: "post", action: "show", id: 10 })).toBe("/post/10");

    expect(() => urlFor(rs, { controller: "post", action: "show" })).toThrow(UrlGenerationError);
  });

  it.skip("basic named route", () => {});

  it.skip("named route with option", () => {});

  it.skip("named route with default", () => {});

  it.skip("named route with path prefix", () => {});

  it.skip("named route with blank path prefix", () => {});

  it.skip("named route with nested controller", () => {});

  it.skip("optimised named route with host", () => {});

  it.skip("named route without hash", () => {});

  it.skip("named route root", () => {});

  it.skip("named route root without hash", () => {});

  it.skip("named route root with hash", () => {});

  it.skip("root without path raises argument error", () => {});

  it.skip("named route root with trailing slash", () => {});

  it.skip("named route with regexps", () => {});

  it.skip("class and lambda constraints", () => {});

  it.skip("lambda constraints", () => {});

  it.skip("scoped lambda", () => {});

  it.skip("scoped lambda with get lambda", () => {});

  it.skip("default setup", () => {});

  it.skip("route uri pattern", () => {});

  it.skip("changing controller", () => {});

  it.skip("dynamic recall paths allowed", () => {});

  it.skip("backwards", () => {});

  it.skip("route with text default", () => {});

  it.skip("action expiry", () => {});

  it.skip("id encoding", () => {});

  it.skip("set to nil forgets", () => {});
});
