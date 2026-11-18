import { Builder, Lint, type RackApp, type RackEnv, type RackResponse } from "@blazetrails/rack";
import type { MockResponse } from "@blazetrails/rack";
import { Session } from "@blazetrails/rack-test";
import { block, Logger, rbProcCall, StringIO, TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Cors } from "../../lib/index.js";
import type { Result } from "../../lib/cors/result.js";
import insecureRu from "./insecure.js";
import nonHttpRu from "./non-http.js";
import testRu from "./test.js";

function assertCorsSuccess(response: MockResponse): void {
  expect(
    response.headers["access-control-allow-origin"],
    "Expected a successful CORS response",
  ).not.toBeUndefined();
}

function assertNotCorsSuccess(response: MockResponse): void {
  expect(
    response.headers["access-control-allow-origin"],
    "Expected a failed CORS response",
  ).toBeUndefined();
}

type Holder = { corsResult: Result | null };

class CaptureResult {
  private app: RackApp;
  private resultHolder: Holder;

  constructor(app: RackApp, options: { holder?: Holder } = {}) {
    this.app = app;
    this.resultHolder = options.holder!;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const response = (await rbProcCall(this.app, env)) as RackResponse;
    this.resultHolder.corsResult = env[Cors.RACK_CORS] as Result;
    return response;
  }
}

class FakeProxy {
  private app: RackApp;

  constructor(app: RackApp, _options = {}) {
    this.app = app;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const [status, headers, body] = (await rbProcCall(this.app, env)) as RackResponse;
    (headers as Record<string, unknown>)["vary"] = ["Origin", "User-Agent"];
    return [status, headers, body];
  }
}

const mockApp = (): RackApp =>
  ({ call: vi.fn().mockReturnValue([200, {}, [""]]) }) as unknown as RackApp;
const mockLogger = () => ({ debug: vi.fn() });

describe("Rack::Cors", () => {
  const test: Holder = { corsResult: null };
  let app: Builder;
  let session: Session | null;

  const corsResult = (): Result => test.corsResult!;
  const currentSession = (): Session => (session ??= new Session(app));
  const lastResponse = (): MockResponse => currentSession().lastResponse();
  const header = (name: string, value: unknown): void => currentSession().header(name, value);
  const get = (uri: string) => currentSession().get(uri);
  const options = (uri: string) => currentSession().options(uri);

  function loadApp(name: string, options: { proxy?: boolean } = {}): Builder {
    const ru = { test: testRu, insecure: insecureRu, non_http: nonHttpRu }[name]!;
    return new Builder(null, {}, (b: Builder) => {
      b.use(CaptureResult, { holder: test });
      ru(b);
      if (options.proxy) b.use(FakeProxy);
      b.map("/", (m: Builder) => {
        m.run((_env: RackEnv) => [200, { "content-type": "text/html" }, ["success"]]);
      });
    });
  }

  async function corsRequest(...args: unknown[]): Promise<MockResponse> {
    const path = typeof args[0] === "string" ? args[0] : "/";

    const opts: { method: "get" | "options"; origin: string } = {
      method: "get",
      origin: "http://localhost:3000",
    };
    const last = args.at(-1);
    if (last != null && typeof last === "object") Object.assign(opts, last);

    header("origin", opts.origin);
    return currentSession()[opts.method](path, {});
  }

  async function successfulCorsRequest(...args: unknown[]): Promise<void> {
    await corsRequest(...args);
    assertCorsSuccess(lastResponse());
  }

  async function preflightRequest(
    origin: string,
    path: string,
    opts: { method?: string | null; headers?: string; methods?: unknown } = {},
  ): Promise<MockResponse> {
    header("Origin", origin);
    if (!(Object.hasOwn(opts, "method") && opts.method == null)) {
      header("Access-Control-Request-Method", opts.method ? opts.method.toUpperCase() : "GET");
    }
    if (opts.headers) header("Access-Control-Request-Headers", opts.headers);
    return options(path);
  }

  beforeEach(() => {
    test.corsResult = null;
    session = null;
    app = loadApp("test");
  });

  it("should support simple CORS request", async () => {
    await successfulCorsRequest();
    expect(corsResult().isHit()).toBeTruthy();
  });

  it("should not return CORS headers if Origin header isn't present", async () => {
    await get("/");
    assertNotCorsSuccess(lastResponse());
    expect(corsResult().isHit()).toBeFalsy();
  });

  it("should support OPTIONS CORS request", async () => {
    await successfulCorsRequest("/options", { method: "options" });
  });

  it("should support regex origins configuration", async () => {
    await successfulCorsRequest({ origin: "http://192.168.0.1:1234" });
  });

  it("should support subdomain example", async () => {
    await successfulCorsRequest({ origin: "http://subdomain.example.com" });
  });

  it("should support proc origins configuration", async () => {
    await successfulCorsRequest("/proc-origin", { origin: "http://10.10.10.10:3000" });
  });

  it("should support lambda origin configuration", async () => {
    await successfulCorsRequest("/lambda-origin", { origin: "http://10.10.10.10:3000" });
  });

  it("should support proc origins configuration (inverse)", async () => {
    await corsRequest("/proc-origin", { origin: "http://bad.guy" });
    assertNotCorsSuccess(lastResponse());
  });

  it("should not mix up path rules across origins", async () => {
    header("Origin", "http://10.10.10.10:3000");
    await get("/");
    assertNotCorsSuccess(lastResponse());
  });

  it("should support alternative X-Origin header", async () => {
    header("X-Origin", "http://localhost:3000");
    await get("/");
    assertCorsSuccess(lastResponse());
  });

  it("should support expose header configuration", async () => {
    await successfulCorsRequest("/expose_single_header");
    expect(lastResponse().headers["access-control-expose-headers"]).toEqual("expose-test");
  });

  it("should support expose multiple header configuration", async () => {
    await successfulCorsRequest("/expose_multiple_headers");
    expect(lastResponse().headers["access-control-expose-headers"]).toEqual(
      "expose-test-1, expose-test-2",
    );
  });

  it("should add Vary header if resource matches even if Origin header isn't present", async () => {
    await get("/");
    assertNotCorsSuccess(lastResponse());
    expect(lastResponse().headers["vary"]).toEqual("Origin");
  });

  it("should add Vary header based on :vary option", async () => {
    await successfulCorsRequest("/vary_test");
    expect(lastResponse().headers["vary"]).toEqual("Origin, Host");
  });

  it("decode URL and resolve paths before resource matching", async () => {
    header("Origin", "http://localhost:3000");
    await get("/public/a/..%2F..%2Fprivate/stuff");
    assertNotCorsSuccess(lastResponse());
  });

  describe("with upstream Vary headers", () => {
    beforeEach(() => {
      app = loadApp("test", { proxy: true });
    });

    it("should add to them", async () => {
      await successfulCorsRequest("/vary_test");
      expect(lastResponse().headers["vary"]).toEqual("Origin, User-Agent, Host");
    });
  });

  it("should add Vary header if Access-Control-Allow-Origin header was added and if it is specific", async () => {
    await successfulCorsRequest("/", { origin: "http://192.168.0.3:8080" });
    expect(lastResponse().headers["access-control-allow-origin"]).toEqual(
      "http://192.168.0.3:8080",
    );
    expect(lastResponse().headers["vary"]).not.toBeUndefined();
  });

  it("should add Vary header even if Access-Control-Allow-Origin header was added and it is generic (*)", async () => {
    await successfulCorsRequest("/public_without_credentials", {
      origin: "http://192.168.1.3:8080",
    });
    expect(lastResponse().headers["access-control-allow-origin"]).toEqual("*");
    expect(lastResponse().headers["vary"]).toEqual("Origin");
  });

  it("should support multi allow configurations for the same resource", async () => {
    await successfulCorsRequest("/multi-allow-config", { origin: "http://mucho-grande.com" });
    expect(lastResponse().headers["access-control-allow-origin"]).toEqual(
      "http://mucho-grande.com",
    );
    expect(lastResponse().headers["vary"]).toEqual("Origin");

    await successfulCorsRequest("/multi-allow-config", { origin: "http://192.168.1.3:8080" });
    expect(lastResponse().headers["access-control-allow-origin"]).toEqual("*");
    expect(lastResponse().headers["vary"]).toEqual("Origin");
  });

  it("should not return CORS headers on OPTIONS request if Access-Control-Allow-Origin is not present", async () => {
    await options("/get-only");
    expect(lastResponse().headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("should not apply CORS headers if it does not match conditional on resource", async () => {
    header("Origin", "http://192.168.0.1:1234");
    await get("/conditional");
    assertNotCorsSuccess(lastResponse());
  });

  it("should apply CORS headers if it does match conditional on resource", async () => {
    header("X-OK", "1");
    await successfulCorsRequest("/conditional", { origin: "http://192.168.0.1:1234" });
  });

  it("should not allow everything if Origin is configured as blank string", async () => {
    await corsRequest("/blank-origin", { origin: "http://example.net" });
    assertNotCorsSuccess(lastResponse());
  });

  it("should not allow credentials for public resources", async () => {
    await successfulCorsRequest("/public");
    expect(lastResponse().headers["access-control-allow-credentials"]).toBeUndefined();
  });

  describe("logging", () => {
    it("should not log debug messages if debug option is false", () => {
      const app = mockApp();

      const logger = mockLogger();

      const cors = new Cors(app, { debug: false, logger: logger }, () => {});
      cors["debug"]({}, "testing");
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it("should log debug messages if debug option is true", () => {
      const app = mockApp();

      const logger = mockLogger();

      const cors = new Cors(app, { debug: true, logger: logger }, () => {});
      cors["debug"]({}, "testing");
      expect(logger.debug).toHaveBeenCalledTimes(1);
    });

    it("should use rack.logger if available", async () => {
      const app = mockApp();

      const logger = mockLogger();

      const cors = new Cors(app, { debug: true }, () => {});
      await cors.call({ "rack.logger": logger, HTTP_ORIGIN: "test.com" });
      expect(logger.debug).toHaveBeenCalled();
    });

    it("should use logger proc", async () => {
      const app = mockApp();

      const logger = mockLogger();

      const cors = new Cors(app, { debug: true, logger: () => logger }, () => {});
      await cors.call({ HTTP_ORIGIN: "test.com" });
      expect(logger.debug).toHaveBeenCalledTimes(1);
    });

    describe("with Rails setup", () => {
      afterEach(() => {
        const T = TopLevel as { Trails?: { logger?: unknown } };
        if (T.Trails != null) T.Trails.logger = null;
      });

      it("should use Rails.logger if available", async () => {
        const app = mockApp();

        const logger = mockLogger();

        (TopLevel as { Trails?: { logger?: unknown } }).Trails = { logger: logger };

        const cors = new Cors(app, { debug: true }, () => {});
        await cors.call({ HTTP_ORIGIN: "test.com" });
        expect(logger.debug).toHaveBeenCalledTimes(1);
      });
    });

    it("should use Logger if none is set", async () => {
      const app = mockApp();

      const formatter = vi.spyOn(Logger.prototype, "formatter", "set");
      const level = vi.spyOn(Logger.prototype, "level", "set");
      const debug = vi.spyOn(Logger.prototype, "debug").mockReturnValue(true);

      const cors = new Cors(app, { debug: true }, () => {});
      await cors.call({ HTTP_ORIGIN: "test.com" });
      expect(formatter).toHaveBeenCalledTimes(1);
      expect(level).toHaveBeenLastCalledWith(Logger.Severity.DEBUG);
      expect(debug).toHaveBeenCalledTimes(1);
      formatter.mockRestore();
      level.mockRestore();
      debug.mockRestore();
    });
  });

  describe("preflight requests", () => {
    it("should fail if origin is invalid", async () => {
      await preflightRequest("http://allyourdataarebelongtous.com", "/");
      assertNotCorsSuccess(lastResponse());
      expect(corsResult().isHit()).toBeFalsy();
      expect(corsResult().isPreflight()).toBeTruthy();
    });

    it("should fail if Access-Control-Request-Method is not allowed", async () => {
      await preflightRequest("http://localhost:3000", "/get-only", { method: "post" });
      assertNotCorsSuccess(lastResponse());
      expect(corsResult().missReason).toEqual(Cors.Result.MISS_DENY_METHOD);
      expect(corsResult().isHit()).toBeFalsy();
      expect(corsResult().isPreflight()).toBeTruthy();
    });

    it("should fail if header is not allowed", async () => {
      await preflightRequest("http://localhost:3000", "/single_header", { headers: "Fooey" });
      assertNotCorsSuccess(lastResponse());
      expect(corsResult().missReason).toEqual(Cors.Result.MISS_DENY_HEADER);
      expect(corsResult().isHit()).toBeFalsy();
      expect(corsResult().isPreflight()).toBeTruthy();
    });

    it("should allow any header if headers = :any", async () => {
      await preflightRequest("http://localhost:3000", "/", { headers: "Fooey" });
      assertCorsSuccess(lastResponse());
    });

    it("should allow any method if methods = :any", async () => {
      await preflightRequest("http://localhost:3000", "/", { methods: ":any" });
      assertCorsSuccess(lastResponse());
    });

    it("allows PATCH method", async () => {
      await preflightRequest("http://localhost:3000", "/", { methods: ["patch"] });
      assertCorsSuccess(lastResponse());
    });

    it("should allow header case insensitive match", async () => {
      await preflightRequest("http://localhost:3000", "/single_header", {
        headers: "X-Domain-Token",
      });
      assertCorsSuccess(lastResponse());
    });

    it("should allow multiple headers match", async () => {
      await preflightRequest("http://localhost:3000", "/two_headers", {
        headers: "X-Requested-With, X-Domain-Token",
      });
      assertCorsSuccess(lastResponse());

      await preflightRequest("http://localhost:3000", "/two_headers", {
        headers: "x-requested-with,x-domain-token",
      });
      assertCorsSuccess(lastResponse());
    });

    it("should allow '*' origins to allow any origin", async () => {
      await preflightRequest("http://locohost:3000", "/public");
      assertCorsSuccess(lastResponse());
      expect(lastResponse().headers["access-control-allow-origin"]).toEqual("*");
    });

    it("should allow resource paths containing '$' char", async () => {
      await preflightRequest("http://localhost:3000", "/$batch", { method: "post" });
      assertCorsSuccess(lastResponse());
      expect(lastResponse().headers["access-control-allow-origin"]).not.toEqual(null);
      expect(lastResponse().headers["access-control-allow-methods"]).toEqual("POST");
    });

    it("should allow '/<path>/' resource if match pattern is /<path>/*", async () => {
      await preflightRequest("http://localhost:3000", "/wildcard/");
      assertCorsSuccess(lastResponse());
      expect(lastResponse().headers["access-control-allow-origin"]).not.toEqual(null);
    });

    it("should allow '/<path>' resource if match pattern is /<path>/*", async () => {
      await preflightRequest("http://localhost:3000", "/wildcard");
      assertCorsSuccess(lastResponse());
      expect(lastResponse().headers["access-control-allow-origin"]).not.toEqual(null);
    });

    it("should allow '*' origin to allow any origin, and set '*' if no credentials required", async () => {
      await preflightRequest("http://locohost:3000", "/public_without_credentials");
      assertCorsSuccess(lastResponse());
      expect(lastResponse().headers["access-control-allow-origin"]).toEqual("*");
    });

    it('should return "file://" as header with "file://" as origin', async () => {
      await preflightRequest("file://", "/");
      assertCorsSuccess(lastResponse());
      expect(lastResponse().headers["access-control-allow-origin"]).toEqual("file://");
    });

    it("supports custom protocols in origin", async () => {
      await preflightRequest("custom-protocol://abcdefg", "/");
      assertCorsSuccess(lastResponse());
      expect(lastResponse().headers["access-control-allow-origin"]).toEqual(
        "custom-protocol://abcdefg",
      );
    });

    describe("", () => {
      beforeEach(() => {
        app = new Builder(null, {}, (b: Builder) => {
          b.use(CaptureResult, { holder: test });
          b.use(
            Cors,
            { debug: true, logger: new Logger(new StringIO()) },
            block(function (this: Cors) {
              this.allow(function () {
                this.origins("*");
                this.resource("/", { methods: "post" });
              });
            }),
          );
          b.map("/", (m: Builder) => {
            m.run((_env: RackEnv) => [500, {}, ["FAIL!"]]);
          });
        });
      });

      it("should not send failed preflight requests thru the app", async () => {
        await preflightRequest("http://localhost", "/", { method: "unsupported" });
        assertNotCorsSuccess(lastResponse());
        expect(lastResponse().status).toEqual(200);
        expect(corsResult().isPreflight()).toBeTruthy();
        expect(corsResult().isHit()).toBeFalsy();
        expect(corsResult().missReason).toEqual(Cors.Result.MISS_DENY_METHOD);
      });
    });
  });

  describe("with insecure configuration", () => {
    beforeEach(() => {
      app = loadApp("insecure");
    });

    it("should raise an error", async () => {
      await expect(corsRequest("/public")).rejects.toThrow(Cors.Resource.CorsMisconfigurationError);
    });
  });

  describe("with non HTTP config", () => {
    beforeEach(() => {
      app = loadApp("non_http");
    });

    it("should support non http/https origins", async () => {
      await successfulCorsRequest("/public", { origin: "content://com.company.app" });
    });
  });

  describe("Rack::Lint", () => {
    beforeEach(() => {
      app = new Builder(null, {}, (b: Builder) => {
        b.use(Cors);
        b.use(Lint);
        b.run((_env: RackEnv) => [200, { "content-type": "text/html" }, ["hello"]]);
      });
    });

    it("is lint-compliant with non-CORS request", async () => {
      await get("/");
      expect(lastResponse().status).toEqual(200);
    });
  });

  describe("with app overriding CORS header", () => {
    beforeEach(() => {
      app = new Builder(null, {}, (b: Builder) => {
        b.use(
          Cors,
          { debug: true, logger: new Logger(new StringIO()) },
          block(function (this: Cors) {
            this.allow(function () {
              this.origins("*");
              this.resource("/");
            });
          }),
        );
        b.map("/", (m: Builder) => {
          m.run((_env: RackEnv) => [
            200,
            { "access-control-allow-origin": "http://foo.net" },
            ["success"],
          ]);
        });
      });
    });

    it("should return app header", async () => {
      await successfulCorsRequest({ origin: "http://example.net" });
      expect(lastResponse().headers["access-control-allow-origin"]).toEqual("http://foo.net");
    });

    it("should return original headers if in debug", async () => {
      await successfulCorsRequest({ origin: "http://example.net" });
      expect(lastResponse().headers["x-rack-cors-original-access-control-allow-origin"]).toEqual(
        "*",
      );
    });
  });

  describe("with headers set to nil", () => {
    beforeEach(() => {
      app = new Builder(null, {}, (b: Builder) => {
        b.use(
          Cors,
          block(function (this: Cors) {
            this.allow(function () {
              this.origins("*");
              this.resource("/", { headers: null });
            });
          }),
        );
        b.map("/", (m: Builder) => {
          m.run((_env: RackEnv) => [200, { "content-type": "text/html" }, ["hello"]]);
        });
      });
    });

    it("should succeed with CORS simple headers", async () => {
      await preflightRequest("http://localhost:3000", "/", { headers: "Accept" });
      assertCorsSuccess(lastResponse());
    });
  });

  describe("with custom allowed headers", () => {
    beforeEach(() => {
      app = new Builder(null, {}, (b: Builder) => {
        b.use(
          Cors,
          block(function (this: Cors) {
            this.allow(function () {
              this.origins("*");
              this.resource("/", { headers: [] });
            });
          }),
        );
        b.map("/", (m: Builder) => {
          m.run((_env: RackEnv) => [200, { "content-type": "text/html" }, ["hello"]]);
        });
      });
    });

    it("should succeed with CORS simple headers", async () => {
      await preflightRequest("http://localhost:3000", "/", { headers: "Accept" });
      assertCorsSuccess(lastResponse());
      await preflightRequest("http://localhost:3000", "/", { headers: "Accept-Language" });
      assertCorsSuccess(lastResponse());
      await preflightRequest("http://localhost:3000", "/", { headers: "Content-Type" });
      assertCorsSuccess(lastResponse());
      await preflightRequest("http://localhost:3000", "/", { headers: "Content-Language" });
      assertCorsSuccess(lastResponse());
    });
  });
});
