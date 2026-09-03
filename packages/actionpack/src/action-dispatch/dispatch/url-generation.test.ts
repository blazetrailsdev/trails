import { describe, it, expect, beforeEach } from "vitest";
import { RouteSet } from "../routing/route-set.js";
import { URL as DispatchURL, type UrlOptions } from "../http/url.js";

describe("TestUrlGeneration::WithMountPoint", () => {
  let routes: RouteSet;

  beforeEach(() => {
    routes = new RouteSet();
    routes.draw((r) => {
      r.get("/foo", { to: "my_route_generating#index", as: "foo" });
      r.get("(/optional/:optional_id)/baz", {
        to: "my_route_generating#index",
        as: "baz",
      });
      r.get("/add_trailing_slash", {
        to: "my_route_generating#addTrailingSlash",
        as: "add_trailing_slash",
      });
      r.get("/trailing_slash_default", {
        to: "my_route_generating#trailingSlashDefault",
        as: "trailing_slash_default",
      });
      r.resources("bars");
    });
    routes.setDefaultUrlOptions({ host: "www.example.com" });
  });

  function fooPath(options: Record<string, unknown> = {}): string {
    return DispatchURL.pathFor({
      path: routes.pathFor("foo"),
      scriptName: options.scriptName as string | undefined,
    });
  }

  function fooUrl(options: Record<string, unknown> = {}): string {
    const path = routes.pathFor("foo");
    const urlOpts: Record<string, unknown> = {
      host: (options.host as string) ?? "www.example.com",
      path,
    };
    if ("protocol" in options) urlOpts.protocol = options.protocol;
    if ("port" in options) urlOpts.port = options.port;
    if ("subdomain" in options) urlOpts.subdomain = options.subdomain;
    return DispatchURL.fullUrlFor(urlOpts as UrlOptions);
  }

  function bazUrl(
    paramsOrPositional?: Record<string, unknown> | string | number | boolean,
  ): string {
    let params: Record<string, string | number> = {};
    if (
      typeof paramsOrPositional === "string" ||
      typeof paramsOrPositional === "number" ||
      typeof paramsOrPositional === "boolean"
    ) {
      if (paramsOrPositional !== "") {
        params = { optional_id: String(paramsOrPositional) };
      }
    } else if (paramsOrPositional) {
      if (paramsOrPositional.optional_id !== undefined && paramsOrPositional.optional_id !== "") {
        params = { optional_id: String(paramsOrPositional.optional_id) };
      }
    }
    const path = routes.pathFor("baz", params);
    return DispatchURL.fullUrlFor({ host: "www.example.com", path });
  }

  it("generating URLS normally", () => {
    expect(fooPath()).toBe("/foo");
  });

  it("accepting a :script_name option", () => {
    expect(fooPath({ scriptName: "/bar" })).toBe("/bar/foo");
  });

  it.skip("the request's SCRIPT_NAME takes precedence over the route", () => {});

  it.skip("the request's SCRIPT_NAME wraps the mounted app's", () => {});

  it("handling http protocol with https set", () => {
    expect(fooUrl({ protocol: "http" })).toBe("http://www.example.com/foo");
  });

  it("respects secure_protocol configuration when protocol not present", () => {
    const old = DispatchURL.secureProtocol;
    try {
      DispatchURL.secureProtocol = true;
      expect(fooUrl({ protocol: null })).toBe("https://www.example.com/foo");
    } finally {
      DispatchURL.secureProtocol = old;
    }
  });

  it("extracting protocol from host when protocol not present", () => {
    expect(fooUrl({ host: "httpz://www.example.com", protocol: null })).toBe(
      "httpz://www.example.com/foo",
    );
  });

  it("formatting host when protocol is present", () => {
    expect(fooUrl({ host: "httpz://www.example.com", protocol: "http://" })).toBe(
      "http://www.example.com/foo",
    );
  });

  it("default ports are removed from the host", () => {
    expect(fooUrl({ host: "www.example.com:80", protocol: "http://" })).toBe(
      "http://www.example.com/foo",
    );
    expect(fooUrl({ host: "www.example.com:443", protocol: "https://" })).toBe(
      "https://www.example.com/foo",
    );
  });

  it("port is extracted from the host", () => {
    expect(fooUrl({ host: "www.example.com:8080", protocol: "http://" })).toBe(
      "http://www.example.com:8080/foo",
    );
    expect(fooUrl({ host: "www.example.com:8080", protocol: "//" })).toBe(
      "//www.example.com:8080/foo",
    );
    expect(fooUrl({ host: "www.example.com:80", protocol: "//" })).toBe("//www.example.com:80/foo");
  });

  it("port option is used", () => {
    expect(fooUrl({ host: "www.example.com", protocol: "http://", port: 8080 })).toBe(
      "http://www.example.com:8080/foo",
    );
    expect(fooUrl({ host: "www.example.com", protocol: "//", port: 8080 })).toBe(
      "//www.example.com:8080/foo",
    );
    expect(fooUrl({ host: "www.example.com", protocol: "//", port: 80 })).toBe(
      "//www.example.com:80/foo",
    );
  });

  it("port option overrides the host", () => {
    expect(fooUrl({ host: "www.example.com:8443", protocol: "http://", port: 8080 })).toBe(
      "http://www.example.com:8080/foo",
    );
    expect(fooUrl({ host: "www.example.com:8443", protocol: "//", port: 8080 })).toBe(
      "//www.example.com:8080/foo",
    );
    expect(fooUrl({ host: "www.example.com:443", protocol: "//", port: 80 })).toBe(
      "//www.example.com:80/foo",
    );
  });

  it("port option disables the host when set to nil", () => {
    expect(fooUrl({ host: "www.example.com:8443", protocol: "http://", port: null })).toBe(
      "http://www.example.com/foo",
    );
    expect(fooUrl({ host: "www.example.com:8443", protocol: "//", port: null })).toBe(
      "//www.example.com/foo",
    );
  });

  it.skip("port option disables the host when set to false", () => {});

  it("keep subdomain when key is true", () => {
    expect(fooUrl({ subdomain: true })).toBe("http://www.example.com/foo");
  });

  it("keep subdomain when key is missing", () => {
    expect(fooUrl()).toBe("http://www.example.com/foo");
  });

  it.skip("omit subdomain when key is nil", () => {});

  it.skip("omit subdomain when key is false", () => {});

  it.skip("omit subdomain when key is blank", () => {});

  it("keep optional path parameter when given", () => {
    expect(bazUrl({ optional_id: 123 })).toBe("http://www.example.com/optional/123/baz");
  });

  it("keep optional path parameter when true", () => {
    expect(bazUrl({ optional_id: true })).toBe("http://www.example.com/optional/true/baz");
  });

  it("omit optional path parameter when false", () => {
    expect(bazUrl({ optional_id: false })).toBe("http://www.example.com/optional/false/baz");
  });

  it("omit optional path parameter when blank", () => {
    expect(bazUrl({ optional_id: "" })).toBe("http://www.example.com/baz");
  });

  it("keep positional path parameter when true", () => {
    expect(bazUrl(true)).toBe("http://www.example.com/optional/true/baz");
  });

  it("omit positional path parameter when false", () => {
    expect(bazUrl(false)).toBe("http://www.example.com/optional/false/baz");
  });

  it("omit positional path parameter when blank", () => {
    expect(bazUrl("")).toBe("http://www.example.com/baz");
  });

  it.skip("generating the current URL with a trailing slashes", () => {});

  it.skip("generating the current URL with a trailing slashes and query string", () => {});

  it.skip("generating the current URL with a trailing slashes and format indicator", () => {});

  it.skip("generating the path with `trailing_slashes: true` default options", () => {});

  it.skip("generating the path with `trailing_slashes: true` default options and format", () => {});

  it.skip("generating URLs with trailing slashes", () => {});

  it.skip("generating URLs with trailing slashes and dot including param", () => {});

  it.skip("generating URLs with trailing slashes and query string", () => {});

  it.skip("generating URLs with trailing slashes and format", () => {});

  it.skip("generating URLS with querystring and trailing slashes", () => {});

  it.skip("generating URLS with empty querystring", () => {});
});
