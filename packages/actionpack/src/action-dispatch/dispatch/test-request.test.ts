import { describe, expect, it } from "vitest";
import { TestRequest } from "../testing/test-request.js";

describe("TestRequestTest", () => {
  it.skip("reasonable defaults", () => {});

  it.skip("cookie jar", () => {});

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
    void req.requestMethod;
    req.requestMethod = "POST";
    expect(req.requestMethod).toBe("POST");
  });

  it.skip("setter methods work and do not change Rack SPEC conformity", () => {});
});
