import { it, expect } from "vitest";
import { BodyProxy } from "./body-proxy.js";
import { MockRequest, type RackApp } from "./mock-request.js";
import { MockResponse } from "./mock-response.js";
import { UploadedFile } from "./multipart/uploaded-file.js";
import { Request } from "./request.js";
import { StringIO } from "@blazetrails/ruby-compat";
import * as path from "path";

const fixtureDir = path.join(__dirname, "..", "test", "multipart");

let lastEnv: Record<string, any> = {};

const app: RackApp = (env) => {
  lastEnv = env;
  const req = new Request(env);

  const input = env["rack.input"];
  if (input) env["mock.postdata"] = input.read();

  if (req.GET["error"]) {
    env["rack.errors"].puts(req.GET["error"]);
    env["rack.errors"].flush();
  }

  return [200, { "content-type": "text/yaml" }, [""]];
};

it("return a MockResponse", async () => {
  const res = await new MockRequest(app).get("");
  expect(res).toBeInstanceOf(MockResponse);
});

it("be able to only return the environment", () => {
  const env = MockRequest.envFor("");
  expect(typeof env).toBe("object");
});

it("should handle a non-GET request with :input String and :params", () => {
  const env = MockRequest.envFor("/", { ":method": "post", ":input": "", ":params": {} });
  expect(env["PATH_INFO"]).toBe("/");
  expect(typeof env).toBe("object");
  expect(env["rack.input"].read()).toBe("");
});

it("should convert :input IO object to binary encoding", () => {
  const f = new StringIO("binary data \xff");
  const env = MockRequest.envFor("/", { ":method": "post", ":input": f });
  expect(env["rack.input"].read()).toBe("binary data \xff");
});

it("should handle :input object that does not respond to set_encoding", () => {
  const input = {
    read() {
      return "data";
    },
    size: 4,
  };
  const env = MockRequest.envFor("/", { ":input": input });
  expect(env["rack.input"].read()).toBe("data");
});

it("return an environment with a path", () => {
  const env = MockRequest.envFor(
    "http://www.example.com/parse?location[]=1&location[]=2&age_group[]=2",
  );
  expect(env["QUERY_STRING"]).toBe("location[]=1&location[]=2&age_group[]=2");
  expect(env["PATH_INFO"]).toBe("/parse");
  expect(typeof env).toBe("object");
});

it("provide sensible defaults", async () => {
  await new MockRequest(app).request();

  const env = lastEnv;
  expect(env["REQUEST_METHOD"]).toBe("GET");
  expect(env["SERVER_NAME"]).toBe("example.org");
  expect(env["SERVER_PORT"]).toBe("80");
  expect(env["SERVER_PROTOCOL"]).toBe("HTTP/1.1");
  expect(env["QUERY_STRING"]).toBe("");
  expect(env["PATH_INFO"]).toBe("/");
  expect(env["SCRIPT_NAME"]).toBe("");
  expect(env["rack.url_scheme"]).toBe("http");
  expect(env["mock.postdata"]).toBeUndefined();
});

it("allow GET/POST/PUT/DELETE/HEAD", async () => {
  await new MockRequest(app).get("", { ":input": "foo" });
  expect(lastEnv["REQUEST_METHOD"]).toBe("GET");

  await new MockRequest(app).post("", { ":input": "foo" });
  expect(lastEnv["REQUEST_METHOD"]).toBe("POST");

  await new MockRequest(app).put("", { ":input": "foo" });
  expect(lastEnv["REQUEST_METHOD"]).toBe("PUT");

  await new MockRequest(app).patch("", { ":input": "foo" });
  expect(lastEnv["REQUEST_METHOD"]).toBe("PATCH");

  await new MockRequest(app).delete("", { ":input": "foo" });
  expect(lastEnv["REQUEST_METHOD"]).toBe("DELETE");

  expect(MockRequest.envFor("/", { ":method": "HEAD" })["REQUEST_METHOD"]).toBe("HEAD");

  expect(MockRequest.envFor("/", { ":method": "OPTIONS" })["REQUEST_METHOD"]).toBe("OPTIONS");
});

it("set content length", () => {
  let env = MockRequest.envFor("/", { ":input": "foo" });
  expect(env["CONTENT_LENGTH"]).toBe("3");

  env = MockRequest.envFor("/", { ":input": new StringIO("foo") });
  expect(env["CONTENT_LENGTH"]).toBe("3");

  env = MockRequest.envFor("/", { ":input": { read: () => "foo" } });
  expect(env["CONTENT_LENGTH"]).toBeUndefined();
});

it("allow posting", async () => {
  await new MockRequest(app).get("", { ":input": "foo" });
  expect(lastEnv["mock.postdata"]).toBe("foo");

  await new MockRequest(app).post("", { ":input": new StringIO("foo") });
  expect(lastEnv["mock.postdata"]).toBe("foo");
});

it("use all parts of an URL", async () => {
  const res = await new MockRequest(app).get("https://bla.example.org:9292/meh/foo?bar");
  expect(res).toBeInstanceOf(MockResponse);

  const env = lastEnv;
  expect(env["REQUEST_METHOD"]).toBe("GET");
  expect(env["SERVER_NAME"]).toBe("bla.example.org");
  expect(env["SERVER_PORT"]).toBe("9292");
  expect(env["QUERY_STRING"]).toBe("bar");
  expect(env["PATH_INFO"]).toBe("/meh/foo");
  expect(env["rack.url_scheme"]).toBe("https");
});

it("set SSL port and HTTP flag on when using https", async () => {
  const res = await new MockRequest(app).get("https://example.org/foo");
  expect(res).toBeInstanceOf(MockResponse);

  const env = lastEnv;
  expect(env["REQUEST_METHOD"]).toBe("GET");
  expect(env["SERVER_NAME"]).toBe("example.org");
  expect(env["SERVER_PORT"]).toBe("443");
  expect(env["QUERY_STRING"]).toBe("");
  expect(env["PATH_INFO"]).toBe("/foo");
  expect(env["rack.url_scheme"]).toBe("https");
  expect(env["HTTPS"]).toBe("on");
});

it("prepend slash to uri path", async () => {
  const res = await new MockRequest(app).get("foo");
  expect(res).toBeInstanceOf(MockResponse);

  const env = lastEnv;
  expect(env["REQUEST_METHOD"]).toBe("GET");
  expect(env["SERVER_NAME"]).toBe("example.org");
  expect(env["SERVER_PORT"]).toBe("80");
  expect(env["QUERY_STRING"]).toBe("");
  expect(env["PATH_INFO"]).toBe("/foo");
  expect(env["rack.url_scheme"]).toBe("http");
});

it("properly convert method name to an uppercase string", async () => {
  await new MockRequest(app).request("get");
  expect(lastEnv["REQUEST_METHOD"]).toBe("GET");
});

it("accept :script_name option to set SCRIPT_NAME", async () => {
  await new MockRequest(app).get("/", { ":script_name": "/foo" });
  expect(lastEnv["SCRIPT_NAME"]).toBe("/foo");
});

it("accept :http_version option to set SERVER_PROTOCOL", async () => {
  await new MockRequest(app).get("/", { ":http_version": "HTTP/1.0" });
  expect(lastEnv["SERVER_PROTOCOL"]).toBe("HTTP/1.0");
});

it("accept params and build query string for GET requests", async () => {
  await new MockRequest(app).get("/foo?baz=2", { ":params": { foo: { bar: "1" } } });

  const env = lastEnv;
  expect(env["REQUEST_METHOD"]).toBe("GET");
  expect(env["QUERY_STRING"]).toContain("baz=2");
  expect(env["QUERY_STRING"]).toContain("foo%5Bbar%5D=1");
  expect(env["PATH_INFO"]).toBe("/foo");
  expect(env["mock.postdata"]).toBeUndefined();
});

it("accept raw input in params for GET requests", async () => {
  await new MockRequest(app).get("/foo?baz=2", { ":params": "foo%5Bbar%5D=1" });

  const env = lastEnv;
  expect(env["REQUEST_METHOD"]).toBe("GET");
  expect(env["QUERY_STRING"]).toContain("baz=2");
  expect(env["QUERY_STRING"]).toContain("foo%5Bbar%5D=1");
  expect(env["PATH_INFO"]).toBe("/foo");
  expect(env["mock.postdata"]).toBeUndefined();
});

it("accept params and build url encoded params for POST requests", async () => {
  await new MockRequest(app).post("/foo", { ":params": { foo: { bar: "1" } } });

  const env = lastEnv;
  expect(env["REQUEST_METHOD"]).toBe("POST");
  expect(env["QUERY_STRING"]).toBe("");
  expect(env["PATH_INFO"]).toBe("/foo");
  expect(env["CONTENT_TYPE"]).toBe("application/x-www-form-urlencoded");
  expect(env["mock.postdata"]).toBe("foo%5Bbar%5D=1");
});

it("accept raw input in params for POST requests", async () => {
  await new MockRequest(app).post("/foo", { ":params": "foo%5Bbar%5D=1" });

  const env = lastEnv;
  expect(env["REQUEST_METHOD"]).toBe("POST");
  expect(env["QUERY_STRING"]).toBe("");
  expect(env["PATH_INFO"]).toBe("/foo");
  expect(env["CONTENT_TYPE"]).toBe("application/x-www-form-urlencoded");
  expect(env["mock.postdata"]).toBe("foo%5Bbar%5D=1");
});

it("accept params and build multipart encoded params for POST requests", async () => {
  const files = new UploadedFile(path.join(fixtureDir, "file1.txt"));
  await new MockRequest(app).post("/foo", {
    ":params": { "submit-name": "Larry", files },
  });

  const env = lastEnv;
  expect(env["REQUEST_METHOD"]).toBe("POST");
  expect(env["QUERY_STRING"]).toBe("");
  expect(env["PATH_INFO"]).toBe("/foo");
  expect(env["CONTENT_TYPE"]).toBe("multipart/form-data; boundary=AaB03x");
  expect(env["mock.postdata"].replace(/\r/g, "").length).toBe(206);
});

it("behave valid according to the Rack spec", async () => {
  const url = "https://bla.example.org:9292/meh/foo?bar";
  expect(await new MockRequest(app).get(url, { ":lint": true })).toBeInstanceOf(MockResponse);
});

it("call close on the original body object", async () => {
  let called = false;
  const body = new BodyProxy(["hi"], () => {
    called = true;
  });
  const capp: RackApp = () => [200, { "content-type": "text/plain" }, body];
  expect(called).toBe(false);
  await new MockRequest(capp).get("/", { ":lint": true });
  expect(called).toBe(true);
});

it("defaults encoding to ASCII 8BIT", () => {
  const req = MockRequest.envFor("/foo");

  const keys = [
    "REQUEST_METHOD",
    "SERVER_NAME",
    "SERVER_PORT",
    "QUERY_STRING",
    "PATH_INFO",
    "HTTPS",
    "rack.url_scheme",
  ];
  for (const k of keys) {
    expect(typeof req[k]).toBe("string");
  }
});
