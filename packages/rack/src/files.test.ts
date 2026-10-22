import { it, expect } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { Files } from "./files.js";
import { Lint } from "./lint.js";
import { Request } from "./request.js";
import { MockRequest } from "./mock-request.js";
import { MockResponse } from "./mock-response.js";

const DOCROOT = File.expandPath(File.join(__dirname, "..", "test"));

function files(...args: ConstructorParameters<typeof Files>): Lint {
  return new Lint(new Files(...args));
}

it("can be used without root", async () => {
  const app = new Files(null);

  const request = new Request(MockRequest.envFor("/cgi/test"));

  const filePath = File.expandPath("cgi/test", DOCROOT);
  expect(app.serving(request, filePath)[0]).toBe(200);
});

it("serves files with + in the file name", async () => {
  const dir = Dir.mktmpdir();
  try {
    File.write(File.join(dir, "you+me.txt"), "hello world");
    const app = files(dir);
    const env = MockRequest.envFor("/you+me.txt");
    const [status, , body] = await app.call(env);

    expect(status).toBe(200);

    let str = "";
    body.each(
      (x: string | Uint8Array) => (str += typeof x === "string" ? x : String.fromCharCode(...x)),
    );
    expect(str).toMatch("hello world");
  } finally {
    FileUtils.rmRf(dir);
  }
});

it("serve files", async () => {
  const res = await new MockRequest(files(DOCROOT)).get("/cgi/test");

  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/ruby/);
});

it("does not serve directories", async () => {
  const res = await new MockRequest(files(DOCROOT)).get("/cgi/assets");
  expect(res.status).toBe(404);
});

it("set last-modified header", async () => {
  const res = await new MockRequest(files(DOCROOT)).get("/cgi/test");

  const path = File.join(DOCROOT, "/cgi/test");

  expect(res.isOk).toBeTruthy();
  expect(res.get("last-modified")).toBe(File.mtime(path).toUTCString());
});

it("return 304 if file isn't modified since last serve", async () => {
  const path = File.join(DOCROOT, "/cgi/test");
  const res = await new MockRequest(files(DOCROOT)).get("/cgi/test", {
    HTTP_IF_MODIFIED_SINCE: File.mtime(path).toUTCString(),
  });

  expect(res.status).toBe(304);
  expect(res.body.length === 0).toBeTruthy();
});

it("return the file if it's modified since last serve", async () => {
  const path = File.join(DOCROOT, "/cgi/test");
  const res = await new MockRequest(files(DOCROOT)).get("/cgi/test", {
    HTTP_IF_MODIFIED_SINCE: new Date(File.mtime(path).getTime() - 100_000).toUTCString(),
  });

  expect(res.isOk).toBeTruthy();
});

it("serve files with URL encoded filenames", async () => {
  const res = await new MockRequest(files(DOCROOT)).get("/cgi/%74%65%73%74");

  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/ruby/);
});

it("serve uri with URL encoded null byte (%00) in filenames", async () => {
  const res = await new MockRequest(files(DOCROOT)).get("/cgi/test%00");
  expect(res.isBadRequest).toBeTruthy();
});

it("allow safe directory traversal", async () => {
  const req = new MockRequest(files(DOCROOT));

  let res = await req.get("/cgi/../cgi/test");
  expect(res.isSuccessful).toBeTruthy();

  res = await req.get(".");
  expect(res.isNotFound).toBeTruthy();

  res = await req.get("test/..");
  expect(res.isNotFound).toBeTruthy();
});

it("not allow unsafe directory traversal", async () => {
  const req = new MockRequest(files(DOCROOT));

  let res = await req.get("/../README.rdoc");
  expect(res.isClientError).toBeTruthy();

  res = await req.get("../test/spec_file.rb");
  expect(res.isClientError).toBeTruthy();

  res = await req.get("../README.rdoc");
  expect(res.isClientError).toBeTruthy();

  expect(res.isNotFound).toBeTruthy();
});

it("allow files with .. in their name", async () => {
  const req = new MockRequest(files(DOCROOT));
  let res = await req.get("/cgi/..test");
  expect(res.isNotFound).toBeTruthy();

  res = await req.get("/cgi/test..");
  expect(res.isNotFound).toBeTruthy();

  res = await req.get("/cgi../test..");
  expect(res.isNotFound).toBeTruthy();
});

it("not allow unsafe directory traversal with encoded periods", async () => {
  const res = await new MockRequest(files(DOCROOT)).get("/%2E%2E/README");

  expect(res.isClientError).toBeTruthy();
  expect(res.isNotFound).toBeTruthy();
});

it("allow safe directory traversal with encoded periods", async () => {
  const res = await new MockRequest(files(DOCROOT)).get("/cgi/%2E%2E/cgi/test");

  expect(res.isSuccessful).toBeTruthy();
});

it("404 if it can't find the file", async () => {
  const res = await new MockRequest(files(DOCROOT)).get("/cgi/blubb");

  expect(res.isNotFound).toBeTruthy();
});

it("detect SystemCallErrors", async () => {
  const res = await new MockRequest(files(DOCROOT)).get("/cgi");

  expect(res.isNotFound).toBeTruthy();
});

it("return bodies that respond to #to_path", async () => {
  const env = MockRequest.envFor("/cgi/test");
  const [status, , body] = await new Files(DOCROOT).call(env);

  const path = File.join(DOCROOT, "/cgi/test");

  expect(status).toBe(200);
  expect(body).toRespondTo("toPath");
  expect(body.toPath()).toBe(path);
});

it("return bodies that do not respond to #to_path if a byte range is requested", async () => {
  const env = MockRequest.envFor("/cgi/test");
  env["HTTP_RANGE"] = "bytes=22-33";
  const [status, , body] = await new Files(DOCROOT).call(env);

  expect(status).toBe(206);
  expect(body).not.toRespondTo("toPath");
});

it("return correct byte range in body", async () => {
  const env = MockRequest.envFor("/cgi/test");
  env["HTTP_RANGE"] = "bytes=22-33";
  const res = new MockResponse(...(await files(DOCROOT).call(env)));

  expect(res.status).toBe(206);
  expect(res.get("content-length")).toBe("12");
  expect(res.get("content-range")).toBe("bytes 22-33/209");
  expect(res.body).toBe("IS FILE! ***");
});

it("handle case where file is truncated during request", async () => {
  const env = MockRequest.envFor("/cgi/test");
  env["HTTP_RANGE"] = "bytes=0-3300";
  const files = new (class extends Files {
    override filesize(_: string): number {
      return 10000;
    }
  })(DOCROOT);

  const res = new MockResponse(...(await files.call(env)));
  expect(res.status).toBe(206);
  expect(res.length).toBe(209);
  res.finish();

  expect(res.get("content-length")).toBe("209");
  expect(res.get("content-range")).toBe("bytes 0-3300/10000");
});

it("return correct multiple byte ranges in body", async () => {
  const env = MockRequest.envFor("/cgi/test");
  env["HTTP_RANGE"] = "bytes=22-33, 60-80";
  const res = new MockResponse(...(await files(DOCROOT).call(env)));

  expect(res.status).toBe(206);
  expect(res.get("content-length")).toBe("191");
  expect(res.get("content-type")).toBe("multipart/byteranges; boundary=AaB03x");
  const expectedBody = `\r
--AaB03x\r
content-type: text/plain\r
content-range: bytes 22-33/209\r
\r
IS FILE! ***\r
--AaB03x\r
content-type: text/plain\r
content-range: bytes 60-80/209\r
\r
, tests will break!!!\r
--AaB03x--\r
`;

  expect(res.body).toBe(expectedBody);
});

it("return error for unsatisfiable byte range", async () => {
  const env = MockRequest.envFor("/cgi/test");
  env["HTTP_RANGE"] = "bytes=1234-5678";
  const res = new MockResponse(...(await files(DOCROOT).call(env)));

  expect(res.status).toBe(416);
  expect(res.get("content-range")).toBe("bytes */209");
});

it("ignores range when file is 0 bytes", async () => {
  const env = MockRequest.envFor("/cgi/assets/images/favicon.ico");
  env["HTTP_RANGE"] = "bytes=0-1234";
  const res = new MockResponse(...(await files(DOCROOT).call(env)));

  expect(res.status).toBe(200);
  expect(res.get("content-range")).toBeUndefined();
});

it("support custom http headers", async () => {
  const env = MockRequest.envFor("/cgi/test");
  const [status, heads] = await files(DOCROOT, {
    "cache-control": "public, max-age=38",
    "access-control-allow-origin": "*",
  }).call(env);

  expect(status).toBe(200);
  expect(heads["cache-control"]).toBe("public, max-age=38");
  expect(heads["access-control-allow-origin"]).toBe("*");
});

it("support not add custom http headers if none are supplied", async () => {
  const env = MockRequest.envFor("/cgi/test");
  const [status, heads] = await files(DOCROOT).call(env);

  expect(status).toBe(200);
  expect(heads["cache-control"]).toBeUndefined();
  expect(heads["access-control-allow-origin"]).toBeUndefined();
});

it("only support GET, HEAD, and OPTIONS requests", async () => {
  const req = new MockRequest(files(DOCROOT));

  const forbidden = ["post", "put", "patch", "delete"] as const;
  for (const method of forbidden) {
    const res = await req[method]("/cgi/test");
    expect(res.isClientError).toBeTruthy();
    expect(res.isMethodNotAllowed).toBeTruthy();
    expect((res.headers["allow"] as string).split(/, */).sort()).toEqual([
      "GET",
      "HEAD",
      "OPTIONS",
    ]);
  }

  const allowed = ["get", "head", "options"] as const;
  for (const method of allowed) {
    const res = await req[method]("/cgi/test");
    expect(res.isSuccessful).toBeTruthy();
  }
});

it("set Allow correctly for OPTIONS requests", async () => {
  const req = new MockRequest(files(DOCROOT));
  const res = await req.options("/cgi/test");
  expect(res.isSuccessful).toBeTruthy();
  expect(res.headers["allow"]).not.toBe(null);
  expect((res.headers["allow"] as string).split(/, */).sort()).toEqual(["GET", "HEAD", "OPTIONS"]);
});

it("set content-length correctly for HEAD requests", async () => {
  const req = new MockRequest(new Lint(new Files(DOCROOT)));
  const res = await req.head("/cgi/test");
  expect(res.isSuccessful).toBeTruthy();
  expect(res.get("content-length")).toBe("209");
});

it("default to a mime type of text/plain", async () => {
  const req = new MockRequest(new Lint(new Files(DOCROOT)));
  const res = await req.get("/cgi/test");
  expect(res.isSuccessful).toBeTruthy();
  expect(res.get("content-type")).toBe("text/plain");
});

it("allow the default mime type to be set", async () => {
  const req = new MockRequest(new Lint(new Files(DOCROOT, null, "application/octet-stream")));
  const res = await req.get("/cgi/test");
  expect(res.isSuccessful).toBeTruthy();
  expect(res.get("content-type")).toBe("application/octet-stream");
});

it("not set content-type if the mime type is not set", async () => {
  const req = new MockRequest(new Lint(new Files(DOCROOT, null, null)));
  const res = await req.get("/cgi/test");
  expect(res.isSuccessful).toBeTruthy();
  expect(res.get("content-type")).toBeUndefined();
});

it("return error when file not found for head request", async () => {
  const res = await new MockRequest(files(DOCROOT)).head("/cgi/missing");
  expect(res.isNotFound).toBeTruthy();
  expect(res.body.length === 0).toBeTruthy();
});
