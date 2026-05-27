import { describe, expect, it } from "vitest";
import { TestRequest } from "../testing/test-request.js";

// ==========================================================================
// dispatch/test_request_test.rb
//
// Rails design: ActionDispatch::TestRequest is a thin wrapper over
// ActionDispatch::Request that ships with a fixed DEFAULT_ENV (built from
// Rack::MockRequest.env_for("/", ...)) and convenience setters so tests can
// override individual request attributes without building full Rack envs.
//
// The TS `create()` factory mirrors `self.create(env={})`: it merges the
// caller-supplied env over DEFAULT_ENV and initialises the cookie hash.
// Setters (`host=`, `port=`, `userAgent=`, etc.) call `setHeader` directly
// on the env, matching the Rails pattern of `set_header(...)`.
// ==========================================================================

describe("TestRequestTest", () => {
  it.skip("reasonable defaults", () => {
    // Rails builds the base env via Rack::MockRequest.env_for("/"), which sets
    // SERVER_NAME to "example.org" and adds HTTPS/rack.errors keys not present
    // in our lightweight TS env. Skipping: Rack::MockRequest env parity gap.
  });

  it.skip("cookie jar", () => {
    // Requires a full CookieJar implementation wired to the request env.
    // Skipping: CookieJar not yet implemented on TestRequest.
  });

  it("does not complain when there is no application config", () => {
    const req = TestRequest.create({});
    expect(Object.keys(req.env).length).toBeGreaterThan(0);
  });

  it("default remote address is 0.0.0.0", () => {
    const req = TestRequest.create({});
    expect(req.remoteAddr).toBe("0.0.0.0");
  });

  it("allows remote address to be overridden", () => {
    const req = TestRequest.create({ REMOTE_ADDR: "127.0.0.1" });
    expect(req.remoteAddr).toBe("127.0.0.1");
  });

  it("default host is test.host", () => {
    const req = TestRequest.create({});
    expect(req.host).toBe("test.host");
  });

  it("allows host to be overridden", () => {
    const req = TestRequest.create({ HTTP_HOST: "www.example.com" });
    expect(req.host).toBe("www.example.com");
  });

  it("default user agent is 'Rails Testing'", () => {
    const req = TestRequest.create({});
    expect(req.userAgent).toBe("Rails Testing");
  });

  it("allows user agent to be overridden", () => {
    const req = TestRequest.create({ HTTP_USER_AGENT: "GoogleBot" });
    expect(req.userAgent).toBe("GoogleBot");
  });

  it("request_method getter and setter", () => {
    const req = TestRequest.create();
    void req.requestMethod; // access before setter to reproduce memoization bug in Rails test
    req.requestMethod = "POST";
    expect(req.requestMethod).toBe("POST");
  });

  it.skip("setter methods work and do not change Rack SPEC conformity", () => {
    // Uses Rack::Lint.new(...).call(req.env) to validate the env after setting
    // all headers. No equivalent Rack::Lint available in TS.
    // Skipping: Rack::Lint parity gap.
  });
});
