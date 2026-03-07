import { describe, it, expect } from "vitest";
import { MockRequest, FatalWarning } from "./mock-request.js";
import { MockResponse } from "./mock-response.js";

describe("Rack::MockRequest", () => {
  const appId = async (env: Record<string, any>): Promise<[number, Record<string, string>, any]> => {
    return [200, { "content-type": "text/plain" }, ["OK"]];
  };

  const appEnv = async (env: Record<string, any>): Promise<[number, Record<string, string>, any]> => {
    return [200, { "content-type": "text/plain" }, [JSON.stringify(env)]];
  };

  it("return a MockResponse", async () => {
    const req = new MockRequest(appId);
    const res = await req.get("/");
    expect(res).toBeInstanceOf(MockResponse);
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("OK");
  });

  it("be able to only return the environment", () => {
    const env = MockRequest.envFor("/foo");
    expect(env["REQUEST_METHOD"]).toBe("GET");
    expect(env["PATH_INFO"]).toBe("/foo");
  });

  it("should handle a non-GET request with :input String and :params", async () => {
    const env = MockRequest.envFor("/", { method: "POST", input: "hello", params: { foo: "bar" } });
    // When input is already provided, params should not override it
    expect(env["rack.input"].read()).toBe("hello");
  });

  it.skip("should convert :input IO object to binary encoding", () => {});

  it.skip("should handle :input object that does not respond to set_encoding", () => {});

  it("return an environment with a path", () => {
    const env = MockRequest.envFor("https://example.com/foo");
    expect(env["PATH_INFO"]).toBe("/foo");
    expect(env["SERVER_NAME"]).toBe("example.com");
    expect(env["rack.url_scheme"]).toBe("https");
  });

  it("provide sensible defaults", () => {
    const env = MockRequest.envFor("/");
    expect(env["REQUEST_METHOD"]).toBe("GET");
    expect(env["SERVER_NAME"]).toBe("example.org");
    expect(env["SERVER_PORT"]).toBe("80");
    expect(env["QUERY_STRING"]).toBe("");
    expect(env["PATH_INFO"]).toBe("/");
    expect(env["rack.url_scheme"]).toBe("http");
    expect(env["SCRIPT_NAME"]).toBe("");
    expect(env["rack.errors"]).toBeDefined();
  });

  it("allow GET/POST/PUT/DELETE/HEAD", async () => {
    const req = new MockRequest(async (env) => [200, {}, [env["REQUEST_METHOD"]]]);
    expect((await req.get("/")).bodyString).toBe("GET");
    expect((await req.post("/")).bodyString).toBe("POST");
    expect((await req.put("/")).bodyString).toBe("PUT");
    expect((await req.delete("/")).bodyString).toBe("DELETE");
    expect((await req.head("/")).bodyString).toBe("HEAD");
  });

  it("set content length", () => {
    const env = MockRequest.envFor("/", { input: "foo" });
    expect(env["CONTENT_LENGTH"]).toBe("3");
  });

  it("allow posting", async () => {
    const req = new MockRequest(async (env) => {
      return [200, {}, [env["rack.input"].read()]];
    });
    const res = await req.post("/", { input: "posting data" });
    expect(res.bodyString).toBe("posting data");
  });

  it("use all parts of an URL", () => {
    const env = MockRequest.envFor("https://bla.example.org:9292/meh?foo=bar");
    expect(env["SERVER_NAME"]).toBe("bla.example.org");
    expect(env["SERVER_PORT"]).toBe("9292");
    expect(env["QUERY_STRING"]).toBe("foo=bar");
    expect(env["PATH_INFO"]).toBe("/meh");
    expect(env["rack.url_scheme"]).toBe("https");
    expect(env["HTTPS"]).toBe("on");
  });

  it("set SSL port and HTTP flag on when using https", () => {
    const env = MockRequest.envFor("https://example.org/");
    expect(env["HTTPS"]).toBe("on");
    expect(env["rack.url_scheme"]).toBe("https");
  });

  it("prepend slash to uri path", () => {
    const env = MockRequest.envFor("foo");
    expect(env["PATH_INFO"]).toBe("/foo");
  });

  it("properly convert method name to an uppercase string", () => {
    const env = MockRequest.envFor("/", { method: "post" });
    expect(env["REQUEST_METHOD"]).toBe("POST");
  });

  it("accept :script_name option to set SCRIPT_NAME", () => {
    const env = MockRequest.envFor("/", { script_name: "/myapp" });
    expect(env["SCRIPT_NAME"]).toBe("/myapp");
  });

  it("accept :http_version option to set SERVER_PROTOCOL", () => {
    const env = MockRequest.envFor("/", { http_version: "HTTP/2.0" });
    expect(env["SERVER_PROTOCOL"]).toBe("HTTP/2.0");
  });

  it("accept params and build query string for GET requests", () => {
    const env = MockRequest.envFor("/", { params: { foo: "bar", baz: "bla" } });
    expect(env["QUERY_STRING"]).toContain("foo=bar");
    expect(env["QUERY_STRING"]).toContain("baz=bla");
  });

  it("accept raw input in params for GET requests", () => {
    const env = MockRequest.envFor("/", { params: "foo=bar" });
    expect(env["QUERY_STRING"]).toContain("foo=bar");
  });

  it("accept params and build url encoded params for POST requests", () => {
    const env = MockRequest.envFor("/", { method: "POST", params: { foo: "bar" } });
    expect(env["rack.input"].read()).toContain("foo=bar");
    expect(env["CONTENT_TYPE"]).toBe("application/x-www-form-urlencoded");
  });

  it("accept raw input in params for POST requests", () => {
    const env = MockRequest.envFor("/", { method: "POST", params: "foo=bar" });
    expect(env["rack.input"].read()).toBe("foo=bar");
  });

  it.skip("accept params and build multipart encoded params for POST requests", () => {});

  it.skip("behave valid according to the Rack spec", () => {});

  it("call close on the original body object", async () => {
    let closed = false;
    const body = {
      each(cb: (s: string) => void) { cb("hi"); },
      close() { closed = true; },
    };
    const app = async (_env: any): Promise<[number, Record<string, string>, any]> => {
      return [200, { "content-type": "text/plain" }, body];
    };
    const req = new MockRequest(app);
    await req.get("/");
    expect(closed).toBe(true);
  });

  it.skip("defaults encoding to ASCII 8BIT", () => {});
});
