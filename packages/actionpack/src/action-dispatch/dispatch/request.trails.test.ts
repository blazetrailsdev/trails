import { describe, it, expect } from "vitest";
import type { RackEnv } from "@blazetrails/rack";
import { Encoding, StringIO } from "@blazetrails/ruby-compat";
import { Base } from "../../action-controller/base.js";
import { ParamBuilder } from "../http/param-builder.js";
import { InvalidParameterError } from "@blazetrails/rack";
import { Request, PASS_NOT_FOUND, controllerConstants } from "../http/request.js";
import { X_CASCADE } from "../constants.js";
import type { DispatchableControllerClass } from "../routing/dispatcher.js";

describe("Request", () => {
  it("content_length measures the body when the request is chunked", () => {
    const req = new Request({
      HTTP_TRANSFER_ENCODING: "chunked",
      "rack.input": new StringIO("héllo"),
    });
    expect(req.contentLength).toBe(6);
  });

  it("GET memoizes the parsed query parameters under its env key", () => {
    const req = new Request({ QUERY_STRING: "foo=bar" });
    const first = req.queryParameters;
    expect(first).toEqual({ foo: "bar" });
    expect(req.env["action_dispatch.request.query_parameters"]).toBe(first);
    expect(req.queryParameters).toBe(first);
  });

  it("set_header writes through to the env the request was built from", () => {
    const env: RackEnv = { HTTP_HOST: "example.com" };
    const req = new Request(env);
    req.setHeader("action_dispatch.authorized_host", req.host);
    expect(env["action_dispatch.authorized_host"]).toBe("example.com");
  });

  it("ssl? is true for a wss request, the second arm of Rack::Request::Helpers#ssl?", () => {
    expect(new Request({ "rack.url_scheme": "wss" }).ssl).toBe(true);
    expect(new Request({ "rack.url_scheme": "https" }).ssl).toBe(true);
    expect(new Request({ "rack.url_scheme": "http" }).ssl).toBe(false);
  });

  it("scheme is https when HTTPS is on, the first arm of Rack::Request::Helpers#scheme", () => {
    expect(new Request({ HTTPS: "on", "rack.url_scheme": "http" }).scheme).toBe("https");
  });

  it("scheme is https when X-Forwarded-Ssl is on, the second arm of Rack::Request::Helpers#scheme", () => {
    expect(new Request({ HTTP_X_FORWARDED_SSL: "on", "rack.url_scheme": "http" }).scheme).toBe(
      "https",
    );
  });

  it("scheme reads forwarded_scheme before rack.url_scheme", () => {
    expect(new Request({ HTTP_X_FORWARDED_PROTO: "https", "rack.url_scheme": "http" }).scheme).toBe(
      "https",
    );
    expect(new Request({ "rack.url_scheme": "http" }).scheme).toBe("http");
    expect(new Request({ HTTPS: "on" }).ssl).toBe(true);
  });

  it("answers the Rack::Request::Helpers members it does not declare itself", () => {
    const req = new Request({
      HTTP_REFERER: "http://example.com/referred",
      HTTP_HOST: "example.com",
      REQUEST_METHOD: "OPTIONS",
      SCRIPT_NAME: "/app",
    });
    expect(req.referer).toBe("http://example.com/referred");
    expect(req.referrer).toBe("http://example.com/referred");
    expect(req.hostAuthority).toBe("example.com");
    expect(req.scriptName).toBe("/app");
    expect(req.isOptions()).toBe(true);
    expect(req.isTrace()).toBe(false);
  });

  it("its own request_method and form_data? outrank the included ones", () => {
    const req = new Request({ REQUEST_METHOD: "POST" });
    req.requestMethod = "PATCH";
    expect(req.requestMethod).toBe("PATCH");
    expect(req.getHeader("REQUEST_METHOD")).toBe("PATCH");
    expect(new Request({ REQUEST_METHOD: "POST" }).formData).toBe(false);
  });

  it("port falls back to standard_port, and reads the forwarded host's port", () => {
    const https = new Request({
      HTTP_HOST: "example.com",
      SERVER_PORT: "80",
      "rack.url_scheme": "https",
    });
    expect(https.port).toBe(443);

    const forwarded = new Request({
      HTTP_X_FORWARDED_HOST: "first.example.com:8080, last.example.com:9090",
      HTTP_HOST: "example.com:3000",
    });
    expect(forwarded.port).toBe(9090);

    const served = new Request({ SERVER_NAME: "example.com", SERVER_PORT: "3000" });
    expect(served.rawHostWithPort).toBe("example.com:3000");
    expect(served.port).toBe(3000);
  });

  describe("ParameterEncoding", () => {
    class ReposController extends Base {
      static {
        this.paramEncoding("show", "baz", Encoding.find("Shift_JIS")!);
        this.skipParameterEncoding("raw");
      }
    }
    class ChildReposController extends ReposController {}

    function get(action: string, queryString: string): Record<string, unknown> {
      controllerConstants.set("repos", ReposController as unknown as DispatchableControllerClass);
      try {
        const req = new Request({ QUERY_STRING: queryString });
        req.pathParameters = { controller: "repos", action };
        return req.GET();
      } finally {
        controllerConstants.delete("repos");
      }
    }

    it("GET decodes a param_encoding parameter in its designated encoding", () => {
      expect(get("show", "baz=%83n&qux=%E3%83%8F")).toEqual({ baz: "ハ", qux: "ハ" });
    });

    it("GET leaves every parameter of a skip_parameter_encoding action as bytes", () => {
      expect(get("raw", "bar=bar%E2baz")).toEqual({ bar: "bar\u00e2baz" });
      expect(() => get("index", "bar=bar%E2baz")).toThrow();
    });

    it("from_hash forces a template's encoding and rejects an invalid string", () => {
      const encodingTemplate = ReposController.actionEncodingTemplate("show");
      expect(ParamBuilder.fromHash({ baz: ["\udc83n"], qux: "ハ" }, { encodingTemplate })).toEqual({
        baz: ["ハ"],
        qux: "ハ",
      });
      expect(() => ParamBuilder.fromHash({ qux: "\udc83n" })).toThrow(InvalidParameterError);
      expect(() => ParamBuilder.fromHash({ baz: "\udc83" }, { encodingTemplate })).toThrow(
        InvalidParameterError,
      );
      const frozen = Object.freeze({ baz: Object.freeze(["\udc83n"]), qux: "ハ" }) as never;
      expect(ParamBuilder.fromHash(frozen, { encodingTemplate })).toEqual({
        baz: ["ハ"],
        qux: "ハ",
      });
    });

    it("action_encoding_template answers only a declared action, per class", () => {
      expect(ReposController.actionEncodingTemplate("index")).toBeNull();
      expect(ReposController.actionEncodingTemplate("show")!.get("qux")).toBeUndefined();
      expect(ReposController.actionEncodingTemplate("raw")!.get("any")).toBe(Encoding.ASCII_8BIT);
      expect(ChildReposController.actionEncodingTemplate("show")).toBeNull();
    });
  });
});

describe("RequestParamsParsing", () => {
  it("content length", () => {
    const req = new Request({ CONTENT_LENGTH: "42" });
    expect(req.contentLength).toBe(42);
  });

  it("content length when missing", () => {
    const req = new Request({});
    expect(req.contentLength).toBe(0);
  });
});

describe("RequestParameters", () => {
  it("path parameters", () => {
    const req = new Request({
      "action_dispatch.request.path_parameters": { controller: "posts", action: "show", id: "1" },
    });
    expect(req.pathParameters).toEqual({ controller: "posts", action: "show", id: "1" });
  });

  it("path parameters default empty", () => {
    const req = new Request({});
    expect(req.pathParameters).toEqual({});
  });

  it("merges request, query, and path parameters with Rails precedence", () => {
    const req = new Request({
      QUERY_STRING: "k=query",
      "action_dispatch.request.request_parameters": { k: "body", b: "body-only" },
      "action_dispatch.request.path_parameters": { k: "path", p: "path-only" },
    });
    expect(req.params).toEqual({ k: "path", b: "body-only", p: "path-only" });
  });

  it("pathParameters= invalidates the merged params cache and feeds future params reads", () => {
    const req = new Request({ QUERY_STRING: "view=print" });
    expect(req.params).toEqual({ view: "print" });
    req.pathParameters = { controller: "items", action: "show", id: "1" };
    expect(req.params).toEqual({
      view: "print",
      controller: "items",
      action: "show",
      id: "1",
    });
    req.pathParameters = { view: "edit" };
    expect(req.params).toEqual({ view: "edit" });
  });
});

describe("RequestHeaderEnvAccess", () => {
  it("hasHeader/setHeader/deleteHeader/fetchHeader operate on env for non-HTTP keys", () => {
    const req = new Request({});
    expect(req.hasHeader("action_dispatch.parameter_filter")).toBe(false);
    req.setHeader("action_dispatch.parameter_filter", ["password"]);
    expect(req.hasHeader("action_dispatch.parameter_filter")).toBe(true);
    expect(req.env["action_dispatch.parameter_filter"]).toEqual(["password"]);
    expect(req.fetchHeader("action_dispatch.parameter_filter")).toEqual(["password"]);
    req.deleteHeader("action_dispatch.parameter_filter");
    expect(req.hasHeader("action_dispatch.parameter_filter")).toBe(false);
  });

  it("fetchHeader invokes fallback on miss", () => {
    const req = new Request({});
    expect(req.fetchHeader("missing", () => "fallback")).toBe("fallback");
  });

  it("getHeader maps HTTP-style names to HTTP_* env keys", () => {
    const req = new Request({ HTTP_IF_NONE_MATCH: '"abc"' });
    expect(req.getHeader("If-None-Match")).toBe('"abc"');
  });

  it("getHeader maps CGI-variable names without HTTP_ prefix", () => {
    const req = new Request({ CONTENT_TYPE: "text/html" });
    expect(req.getHeader("Content-Type")).toBe("text/html");
  });
});

describe("RequestFilterParameters", () => {
  it("filteredParameters replaces sensitive params with [FILTERED]", () => {
    const req = new Request({
      "action_dispatch.request.parameters": { password: "hunter2", name: "alice" },
      "action_dispatch.parameter_filter": ["password"],
    });
    expect(req.filteredParameters()).toEqual({ password: "[FILTERED]", name: "alice" });
  });

  it("filteredPath replaces sensitive query params", () => {
    const req = new Request({
      PATH_INFO: "/users",
      QUERY_STRING: "password=hunter2&name=alice",
      "action_dispatch.parameter_filter": ["password"],
    });
    expect(req.filteredPath()).toBe("/users?password=[FILTERED]&name=alice");
  });

  it("filteredEnv strips RAW_POST_DATA by default", () => {
    const req = new Request({ RAW_POST_DATA: "secret" });
    expect(req.filteredEnv()["RAW_POST_DATA"]).toBe("[FILTERED]");
  });

  it("parameterFilter returns NULL_PARAM_FILTER when no header is configured", () => {
    const req = new Request({});
    expect(req.parameterFilter().filter({ password: "x" })).toEqual({ password: "x" });
  });
});

describe("RequestContentSecurityPolicy", () => {
  it("reads and writes the policy under the env header", () => {
    const req = new Request({});
    expect(req.contentSecurityPolicy).toBeUndefined();
    const policy = { build: () => "default-src 'self'" };

    req.contentSecurityPolicy = policy as any;
    expect(req.env["action_dispatch.content_security_policy"]).toBe(policy);
    expect(req.contentSecurityPolicy).toBe(policy);
  });

  it("reportOnly toggles the report-only env flag", () => {
    const req = new Request({});
    expect(req.contentSecurityPolicyReportOnly).toBeUndefined();
    req.contentSecurityPolicyReportOnly = true;
    expect(req.contentSecurityPolicyReportOnly).toBe(true);
  });

  it("nonce is undefined without a generator and memoizes on read", () => {
    const req = new Request({});
    expect(req.contentSecurityPolicyNonce).toBeUndefined();
    let calls = 0;
    req.contentSecurityPolicyNonceGenerator = () => `nonce-${++calls}`;
    expect(req.contentSecurityPolicyNonce).toBe("nonce-1");
    expect(req.contentSecurityPolicyNonce).toBe("nonce-1");
  });

  it("nonce directives default to undefined and round-trip arrays", () => {
    const req = new Request({});
    expect(req.contentSecurityPolicyNonceDirectives).toBeUndefined();
    req.contentSecurityPolicyNonceDirectives = ["script-src"];
    expect(req.contentSecurityPolicyNonceDirectives).toEqual(["script-src"]);
  });

  it("null assignments persist as null on the env (matches Rails setter)", () => {
    const req = new Request({});
    req.contentSecurityPolicyNonceGenerator = null;
    expect(req.env["action_dispatch.content_security_policy_nonce_generator"]).toBeNull();
    expect(req.contentSecurityPolicyNonceGenerator).toBeNull();
  });
});

describe("RequestControllerClass", () => {
  it("controllerClassFor returns PASS_NOT_FOUND when name is absent", () => {
    const req = new Request({});
    expect(req.controllerClassFor(null)).toBe(PASS_NOT_FOUND);
    expect(req.controllerClassFor(undefined)).toBe(PASS_NOT_FOUND);
  });

  it("controllerClassFor throws when a controller name is supplied", () => {
    const req = new Request({});
    expect(() => req.controllerClassFor("posts")).toThrow(/uninitialized constant PostsController/);
  });

  it("controllerClassFor resolves the registered controller constant", () => {
    class PostsController {}
    controllerConstants.set("posts", PostsController as unknown as DispatchableControllerClass);
    try {
      expect(new Request({}).controllerClassFor("posts")).toBe(PostsController);
    } finally {
      controllerConstants.delete("posts");
    }
  });

  it("controllerClass defaults action to 'index' and returns PASS_NOT_FOUND without a controller", () => {
    const req = new Request({});
    expect(req.controllerClass()).toBe(PASS_NOT_FOUND);
    expect(req.pathParameters["action"]).toBe("index");
  });

  it("PASS_NOT_FOUND.call returns 404 with x-cascade pass", async () => {
    const [status, headers, body] = PASS_NOT_FOUND.call({});
    expect(status).toBe(404);
    expect(headers[X_CASCADE]).toBe("pass");
    const chunks: unknown[] = [];
    for await (const c of body) chunks.push(c);
    expect(chunks).toEqual([]);
  });

  it("PASS_NOT_FOUND.action returns the sentinel itself", () => {
    expect(PASS_NOT_FOUND.action("show")).toBe(PASS_NOT_FOUND);
    expect(PASS_NOT_FOUND.actionEncodingTemplate("show")).toBe(false);
  });
});

describe("RequestParametersList", () => {
  it("returns rack.request.form_pairs verbatim when present", () => {
    const pairs: Array<[string, unknown]> = [["a", "1"]];
    const req = new Request({ "rack.request.form_pairs": pairs });
    expect(req.requestParametersList()).toBe(pairs);
  });

  it("parses rack.request.form_vars via QueryParser.eachPair", () => {
    const req = new Request({ "rack.request.form_vars": "a=1&b=2" });
    expect(req.requestParametersList()).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("returns [] when no body has been parsed", () => {
    const req = new Request({});
    expect(req.requestParametersList()).toEqual([]);
  });
});

describe("RequestPermissionsPolicy", () => {
  it("round-trips through the env header", () => {
    const req = new Request({});
    expect(req.permissionsPolicy).toBeUndefined();
    const policy = { build: () => "geolocation=()" };

    req.permissionsPolicy = policy as any;
    expect(req.env["action_dispatch.permissions_policy"]).toBe(policy);
    expect(req.permissionsPolicy).toBe(policy);
  });
});

describe("RequestMimeType", () => {
  it("has_content_type?", () => {
    expect(new Request({ CONTENT_TYPE: "text/html" }).hasContentType()).toBe(true);
    expect(new Request({}).hasContentType()).toBe(false);
  });
});
