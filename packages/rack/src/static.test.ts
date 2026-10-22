import { it, expect, beforeEach } from "vitest";
import { Dir, File, getZlib } from "@blazetrails/ruby-compat";
import { Static, type StaticOptions } from "./static.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";

class DummyApp {
  call(_env: Record<string, any>): [number, Record<string, any>, any] {
    return [200, { "content-type": "text/plain" }, ["Hello World"]];
  }
}

const DOCROOT = File.expandPath(File.join(__dirname, "..", "test"));

function _static(app: DummyApp, ...args: [StaticOptions?]): Lint {
  return new Lint(new Static(app, ...args));
}

const root = File.expandPath(File.join(__dirname, "..", "test"));

const OPTIONS: StaticOptions = { urls: ["/cgi"], root: root };
const CASCADE_OPTIONS: StaticOptions = { urls: ["/cgi"], root: root, cascade: true };
const STATIC_OPTIONS: StaticOptions = { urls: [""], root: `${root}/static`, index: "index.html" };
const STATIC_URLS_OPTIONS: StaticOptions = {
  urls: ["/static"],
  root: `${root}`,
  index: "index.html",
};
const HASH_OPTIONS: StaticOptions = { urls: { "/cgi/sekret": "cgi/test" }, root: root };
const HASH_ROOT_OPTIONS: StaticOptions = { urls: { "/": "static/foo.html" }, root: root };
const GZIP_OPTIONS: StaticOptions = { urls: ["/cgi"], root: root, gzip: true };

let request: MockRequest;
let cascadeRequest: MockRequest;
let staticRequest: MockRequest;
let staticUrlsRequest: MockRequest;
let hashRequest: MockRequest;
let hashRootRequest: MockRequest;
let gzipRequest: MockRequest;
let headerRequest: MockRequest;

beforeEach(() => {
  request = new MockRequest(_static(new DummyApp(), OPTIONS));
  cascadeRequest = new MockRequest(_static(new DummyApp(), CASCADE_OPTIONS));
  staticRequest = new MockRequest(_static(new DummyApp(), STATIC_OPTIONS));
  staticUrlsRequest = new MockRequest(_static(new DummyApp(), STATIC_URLS_OPTIONS));
  hashRequest = new MockRequest(_static(new DummyApp(), HASH_OPTIONS));
  hashRootRequest = new MockRequest(_static(new DummyApp(), HASH_ROOT_OPTIONS));
  gzipRequest = new MockRequest(_static(new DummyApp(), GZIP_OPTIONS));
  headerRequest = new MockRequest(_static(new DummyApp(), HEADER_OPTIONS));
});

it("serves files", async () => {
  const res = await request.get("/cgi/test");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/ruby/);
});

it("does not serve files outside :urls", async () => {
  const res = await request.get(`/cgi/../${File.basename(__filename)}`);
  expect(res.isOk).toBeTruthy();
  expect(res.body).toBe("Hello World");
});

it("404s if url root is known but it can't find the file", async () => {
  const res = await request.get("/cgi/foo");
  expect(res.isNotFound).toBeTruthy();
});

it("serves files when using :cascade option", async () => {
  const res = await cascadeRequest.get("/cgi/test");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/ruby/);
});

it("calls down the chain if if can't find the file when using the :cascade option", async () => {
  const res = await cascadeRequest.get("/cgi/foo");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toBe("Hello World");
});

it("calls down the chain if url root is not known", async () => {
  const res = await request.get("/something/else");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toBe("Hello World");
});

it("calls index file when requesting root in the given folder", async () => {
  let res = await staticRequest.get("/");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/index!/);

  res = await staticRequest.get("/other/");
  expect(res.isNotFound).toBeTruthy();

  res = await staticRequest.get("/another/");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/another index!/);
});

it("does not call index file when requesting folder with unknown prefix", async () => {
  let res = await staticUrlsRequest.get("/static/another/");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/index!/);

  res = await staticUrlsRequest.get("/something/else/");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toBe("Hello World");
});

it("doesn't call index file if :index option was omitted", async () => {
  const res = await request.get("/");
  expect(res.body).toBe("Hello World");
});

it("serves hidden files", async () => {
  const res = await hashRequest.get("/cgi/sekret");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/ruby/);
});

it("calls down the chain if the URI is not specified", async () => {
  const res = await hashRequest.get("/something/else");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toBe("Hello World");
});

it("allows the root URI to be configured via hash options", async () => {
  const res = await hashRootRequest.get("/");
  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/foo.html!/);
});

it("serves gzipped files if client accepts gzip encoding and gzip files are present", async () => {
  const res = await gzipRequest.get("/cgi/test", { HTTP_ACCEPT_ENCODING: "deflate, gzip" });
  expect(res.isOk).toBeTruthy();
  expect(res.headers["content-encoding"]).toBe("gzip");
  expect(res.headers["content-type"]).toBe("text/plain");
  expect(
    getZlib()
      .gunzip(Uint8Array.from(res.body, (c) => c.charCodeAt(0)))
      .toString(),
  ).toMatch(/ruby/);
});

it("serves regular files if client accepts gzip encoding and gzip files are not present", async () => {
  const res = await gzipRequest.get("/cgi/rackup_stub.rb", {
    HTTP_ACCEPT_ENCODING: "deflate, gzip",
  });
  expect(res.isOk).toBeTruthy();
  expect(res.headers["content-encoding"]).toBeUndefined();
  expect(res.headers["content-type"]).toBe("text/x-script.ruby");
  expect(res.body).toMatch(/ruby/);
});

it("serves regular files if client does not accept gzip encoding", async () => {
  const res = await gzipRequest.get("/cgi/test");
  expect(res.isOk).toBeTruthy();
  expect(res.headers["content-encoding"]).toBeUndefined();
  expect(res.headers["content-type"]).toBe("text/plain");
  expect(res.body).toMatch(/ruby/);
});

it("returns 304 if gzipped file isn't modified since last serve", async () => {
  const path = File.join(DOCROOT, "/cgi/test");
  const res = await gzipRequest.get("/cgi/test", {
    HTTP_IF_MODIFIED_SINCE: File.mtime(path).toUTCString(),
  });
  expect(res.status).toBe(304);
  expect(res.body.length === 0).toBeTruthy();
  expect(res.headers["content-encoding"]).toBeUndefined();
  expect(res.headers["content-type"]).toBeUndefined();
});

it("return 304 if gzipped file isn't modified since last serve", async () => {
  const path = File.join(DOCROOT, "/cgi/test");
  const res = await gzipRequest.get("/cgi/test", {
    HTTP_IF_MODIFIED_SINCE: File.mtime(path + ".gz").toUTCString(),
    HTTP_ACCEPT_ENCODING: "deflate, gzip",
  });

  expect(res.status).toBe(304);
  expect(res.body.length === 0).toBeTruthy();
});

it("supports serving fixed cache-control (legacy option)", async () => {
  const opts = { ...OPTIONS, cache_control: "public" };
  const request = new MockRequest(_static(new DummyApp(), opts));
  const res = await request.get("/cgi/test");
  expect(res.isOk).toBeTruthy();
  expect(res.headers["cache-control"]).toBe("public");
});

const HEADER_OPTIONS: StaticOptions = {
  urls: ["/cgi"],
  root: root,
  header_rules: [
    ["all", { "cache-control": "public, max-age=100" }],
    ["fonts", { "cache-control": "public, max-age=200" }],
    [["png", "jpg"], { "cache-control": "public, max-age=300" }],
    ["/cgi/assets/folder/", { "cache-control": "public, max-age=400" }],
    ["cgi/assets/javascripts", { "cache-control": "public, max-age=500" }],
    [/\.(css|erb)$/, { "cache-control": "public, max-age=600" }],
    [false, { "cache-control": "public, max-age=600" }],
  ],
};

it("supports header rule :all", async () => {
  const res = await headerRequest.get("/cgi/assets/index.html");
  expect(res.isOk).toBeTruthy();
  expect(res.headers["cache-control"]).toBe("public, max-age=100");
});

it("supports header rule :fonts", async () => {
  const res = await headerRequest.get("/cgi/assets/fonts/font.eot");
  expect(res.isOk).toBeTruthy();
  expect(res.headers["cache-control"]).toBe("public, max-age=200");
});

it("supports file extension header rules provided as an Array", async () => {
  const res = await headerRequest.get("/cgi/assets/images/image.png");
  expect(res.isOk).toBeTruthy();
  expect(res.headers["cache-control"]).toBe("public, max-age=300");
});

it("supports folder rules provided as a String", async () => {
  const res = await headerRequest.get("/cgi/assets/folder/test.js");
  expect(res.isOk).toBeTruthy();
  expect(res.headers["cache-control"]).toBe("public, max-age=400");
});

it("supports folder header rules provided as a String not starting with a slash", async () => {
  const res = await headerRequest.get("/cgi/assets/javascripts/app.js");
  expect(res.isOk).toBeTruthy();
  expect(res.headers["cache-control"]).toBe("public, max-age=500");
});

it("supports flexible header rules provided as Regexp", async () => {
  const res = await headerRequest.get("/cgi/assets/stylesheets/app.css");
  expect(res.isOk).toBeTruthy();
  expect(res.headers["cache-control"]).toBe("public, max-age=600");
});

it("prioritizes header rules over fixed cache-control setting (legacy option)", async () => {
  const opts: StaticOptions = {
    ...OPTIONS,
    cache_control: "public, max-age=24",
    header_rules: [["all", { "cache-control": "public, max-age=42" }]],
  };

  const request = new MockRequest(_static(new DummyApp(), opts));
  const res = await request.get("/cgi/test");
  expect(res.isOk).toBeTruthy();
  expect(res.headers["cache-control"]).toBe("public, max-age=42");
});

it("expands the root path upon the middleware initialization", async () => {
  const relativePath = STATIC_OPTIONS.root!.replace(`${Dir.pwd()}/`, "");
  const opts: StaticOptions = { urls: [""], root: relativePath, index: "index.html" };
  const request = new MockRequest(_static(new DummyApp(), opts));
  await Dir.chdir("..", async () => {
    const res = await request.get("");
    expect(res.isOk).toBeTruthy();
    expect(res.body).toMatch(/index!/);
  });
});
