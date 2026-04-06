import { describe, it, expect } from "vitest";
import {
  requestToRackEnv,
  requestToRackEnvWithBody,
  rackResponseToFetchResponse,
} from "./rack-bridge.js";

describe("requestToRackEnv", () => {
  it("converts a simple GET request", () => {
    const req = new Request("http://localhost:3000/users?page=1");
    const env = requestToRackEnv(req);

    expect(env["REQUEST_METHOD"]).toBe("GET");
    expect(env["PATH_INFO"]).toBe("/users");
    expect(env["QUERY_STRING"]).toBe("page=1");
    expect(env["SERVER_NAME"]).toBe("localhost");
    expect(env["SERVER_PORT"]).toBe("3000");
    expect(env["rack.url_scheme"]).toBe("http");
    expect(env["HTTPS"]).toBe("off");
  });

  it("strips basePath from PATH_INFO and sets SCRIPT_NAME", () => {
    const req = new Request("http://localhost/~dev/users/1");
    const env = requestToRackEnv(req, "/~dev");

    expect(env["PATH_INFO"]).toBe("/users/1");
    expect(env["SCRIPT_NAME"]).toBe("/~dev");
  });

  it("defaults to / when basePath equals full path", () => {
    const req = new Request("http://localhost/~dev");
    const env = requestToRackEnv(req, "/~dev");

    expect(env["PATH_INFO"]).toBe("/");
    expect(env["SCRIPT_NAME"]).toBe("/~dev");
  });

  it("handles HTTPS", () => {
    const req = new Request("https://example.com/api");
    const env = requestToRackEnv(req);

    expect(env["HTTPS"]).toBe("on");
    expect(env["rack.url_scheme"]).toBe("https");
    expect(env["SERVER_PORT"]).toBe("443");
  });

  it("maps request headers to CGI-style keys", () => {
    const req = new Request("http://localhost/", {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "42",
        Accept: "text/html",
        "X-Custom-Header": "hello",
      },
    });
    const env = requestToRackEnv(req);

    expect(env["CONTENT_TYPE"]).toBe("application/json");
    expect(env["CONTENT_LENGTH"]).toBe("42");
    expect(env["HTTP_ACCEPT"]).toBe("text/html");
    expect(env["HTTP_X_CUSTOM_HEADER"]).toBe("hello");
  });

  it("provides rack.input and rack.errors", () => {
    const req = new Request("http://localhost/");
    const env = requestToRackEnv(req);

    expect((env["rack.input"] as any).read()).toBe("");
    expect((env["rack.errors"] as any).string()).toBe("");
  });

  it("handles empty query string", () => {
    const req = new Request("http://localhost/users");
    const env = requestToRackEnv(req);

    expect(env["QUERY_STRING"]).toBe("");
  });

  it("decodes percent-encoded paths", () => {
    const req = new Request("http://localhost/users/John%20Doe");
    const env = requestToRackEnv(req);

    expect(env["PATH_INFO"]).toBe("/users/John Doe");
  });

  it("does not strip basePath from similar-but-different prefix", () => {
    const req = new Request("http://localhost/~devil/users");
    const env = requestToRackEnv(req, "/~dev");

    expect(env["PATH_INFO"]).toBe("/~devil/users");
    expect(env["SCRIPT_NAME"]).toBe("");
  });

  it("normalizes trailing slash on basePath", () => {
    const req = new Request("http://localhost/~dev/users/1");
    const env = requestToRackEnv(req, "/~dev/");

    expect(env["PATH_INFO"]).toBe("/users/1");
  });

  it("sets HTTP_HOST from request URL", () => {
    const req = new Request("http://localhost:3000/users");
    const env = requestToRackEnv(req);

    expect(env["HTTP_HOST"]).toBe("localhost:3000");
  });

  it("survives malformed percent-encoding", () => {
    const req = new Request("http://localhost/%E0%A4");
    const env = requestToRackEnv(req);

    expect(env["PATH_INFO"]).toBe("/%E0%A4");
  });
});

describe("requestToRackEnvWithBody", () => {
  it("reads POST body into rack.input", async () => {
    const req = new Request("http://localhost/users", {
      method: "POST",
      body: "name=dean&email=dean@example.com",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const env = await requestToRackEnvWithBody(req);

    expect(env["REQUEST_METHOD"]).toBe("POST");
    expect((env["rack.input"] as any).read()).toBe("name=dean&email=dean@example.com");
    expect(env["CONTENT_TYPE"]).toBe("application/x-www-form-urlencoded");
  });

  it("sets CONTENT_LENGTH from body when not in headers", async () => {
    const req = new Request("http://localhost/users", {
      method: "POST",
      body: "hello",
    });
    const env = await requestToRackEnvWithBody(req);

    expect(env["CONTENT_LENGTH"]).toBe("5");
  });

  it("does not read body for GET requests", async () => {
    const req = new Request("http://localhost/users");
    const env = await requestToRackEnvWithBody(req);

    expect((env["rack.input"] as any).read()).toBe("");
  });
});

describe("rackResponseToFetchResponse", () => {
  it("converts a simple Rack response", async () => {
    async function* body() {
      yield "Hello, World!";
    }
    const rackResp: [number, Record<string, string>, AsyncIterable<string>] = [
      200,
      { "content-type": "text/plain" },
      body(),
    ];

    const resp = await rackResponseToFetchResponse(rackResp);

    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("text/plain");
    expect(await resp.text()).toBe("Hello, World!");
  });

  it("handles multi-chunk bodies", async () => {
    async function* body() {
      yield "<html>";
      yield "<body>Hi</body>";
      yield "</html>";
    }
    const rackResp: [number, Record<string, string>, AsyncIterable<string>] = [
      200,
      { "content-type": "text/html" },
      body(),
    ];

    const resp = await rackResponseToFetchResponse(rackResp);
    expect(await resp.text()).toBe("<html><body>Hi</body></html>");
  });

  it("preserves status codes", async () => {
    async function* body() {
      yield "Not Found";
    }
    const rackResp: [number, Record<string, string>, AsyncIterable<string>] = [
      404,
      { "content-type": "text/plain" },
      body(),
    ];

    const resp = await rackResponseToFetchResponse(rackResp);
    expect(resp.status).toBe(404);
  });

  it("handles Uint8Array chunks", async () => {
    async function* body() {
      yield new TextEncoder().encode("binary data");
    }
    const rackResp: [number, Record<string, string>, AsyncIterable<string | Uint8Array>] = [
      200,
      { "content-type": "application/octet-stream" },
      body(),
    ];

    const resp = await rackResponseToFetchResponse(rackResp);
    expect(await resp.text()).toBe("binary data");
  });

  it("preserves binary data in Uint8Array-only bodies", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    async function* body() {
      yield bytes;
    }
    const rackResp: [number, Record<string, string>, AsyncIterable<string | Uint8Array>] = [
      200,
      { "content-type": "image/jpeg" },
      body(),
    ];

    const resp = await rackResponseToFetchResponse(rackResp);
    const result = new Uint8Array(await resp.arrayBuffer());
    expect(result).toEqual(bytes);
  });

  it("handles mixed string and binary chunks", async () => {
    async function* body() {
      yield "hello ";
      yield new TextEncoder().encode("world");
    }
    const rackResp: [number, Record<string, string>, AsyncIterable<string | Uint8Array>] = [
      200,
      { "content-type": "application/octet-stream" },
      body(),
    ];

    const resp = await rackResponseToFetchResponse(rackResp);
    const result = new Uint8Array(await resp.arrayBuffer());
    expect(new TextDecoder().decode(result)).toBe("hello world");
  });

  it("returns null body for 204 No Content", async () => {
    async function* body() {
      yield "";
    }
    const rackResp: [number, Record<string, string>, AsyncIterable<string>] = [204, {}, body()];

    const resp = await rackResponseToFetchResponse(rackResp);
    expect(resp.status).toBe(204);
    expect(resp.body).toBeNull();
  });

  it("passes through all headers", async () => {
    async function* body() {
      yield "";
    }
    const rackResp: [number, Record<string, string>, AsyncIterable<string>] = [
      301,
      { location: "/new-path", "x-custom": "value" },
      body(),
    ];

    const resp = await rackResponseToFetchResponse(rackResp);
    expect(resp.headers.get("location")).toBe("/new-path");
    expect(resp.headers.get("x-custom")).toBe("value");
  });
});
