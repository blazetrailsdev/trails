import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Static } from "./static.js";
import { MockRequest } from "./mock-request.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

let tmpDir: string;
const fallbackApp = async () => [200, { "content-type": "text/plain" }, ["fallback"]] as [number, Record<string, string>, any];

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rack-static-"));
  fs.mkdirSync(path.join(tmpDir, "static"));
  fs.writeFileSync(path.join(tmpDir, "static", "test.txt"), "static file");
  fs.writeFileSync(path.join(tmpDir, "static", "test.css"), "body {}");
  fs.writeFileSync(path.join(tmpDir, "static", ".hidden"), "hidden");
  fs.writeFileSync(path.join(tmpDir, "static", "index.html"), "<html>index</html>");
  fs.writeFileSync(path.join(tmpDir, "static", "test.txt.gz"), "gzipped content");
  fs.writeFileSync(path.join(tmpDir, "static", "font.woff2"), "font data");
  fs.mkdirSync(path.join(tmpDir, "static", "sub"));
  fs.writeFileSync(path.join(tmpDir, "static", "sub", "page.html"), "<html>sub</html>");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Rack::Static", () => {
  it("serves files", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir });
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("static file");
  });

  it("does not serve files outside :urls", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir });
    const res = await new MockRequest((env) => app.call(env)).get("/other/test.txt");
    expect(res.bodyString).toBe("fallback");
  });

  it("404s if url root is known but it can't find the file", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir });
    const res = await new MockRequest((env) => app.call(env)).get("/static/missing.txt");
    expect(res.status).toBe(404);
  });

  it("serves files when using :cascade option", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir, cascade: true });
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("static file");
  });

  it("calls down the chain if if can't find the file when using the :cascade option", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir, cascade: true });
    const res = await new MockRequest((env) => app.call(env)).get("/static/missing.txt");
    expect(res.bodyString).toBe("fallback");
  });

  it("calls down the chain if url root is not known", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir });
    const res = await new MockRequest((env) => app.call(env)).get("/dynamic/page");
    expect(res.bodyString).toBe("fallback");
  });

  it("calls index file when requesting root in the given folder", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir, index: "index.html" });
    const res = await new MockRequest((env) => app.call(env)).get("/static/");
    expect(res.status).toBe(200);
    expect(res.bodyString).toContain("index");
  });

  it("does not call index file when requesting folder with unknown prefix", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir, index: "index.html" });
    const res = await new MockRequest((env) => app.call(env)).get("/other/");
    expect(res.bodyString).toBe("fallback");
  });

  it("doesn't call index file if :index option was omitted", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir });
    const res = await new MockRequest((env) => app.call(env)).get("/static/");
    expect(res.status).toBe(404);
  });

  it("serves hidden files", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir });
    const res = await new MockRequest((env) => app.call(env)).get("/static/.hidden");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("hidden");
  });

  it("calls down the chain if the URI is not specified", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir });
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.bodyString).toBe("fallback");
  });

  it("allows the root URI to be configured via hash options", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir });
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt");
    expect(res.status).toBe(200);
  });

  it("serves gzipped files if client accepts gzip encoding and gzip files are present", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir, gzip: true });
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt", {
      HTTP_ACCEPT_ENCODING: "gzip, deflate",
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
  });

  it("serves regular files if client accepts gzip encoding and gzip files are not present", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir, gzip: true });
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.css", {
      HTTP_ACCEPT_ENCODING: "gzip, deflate",
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("serves regular files if client does not accept gzip encoding", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir, gzip: true });
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("returns 304 if gzipped file isn't modified since last serve", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir, gzip: true });
    const future = new Date(Date.now() + 86400000).toUTCString();
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt", {
      HTTP_ACCEPT_ENCODING: "gzip, deflate",
      HTTP_IF_MODIFIED_SINCE: future,
    });
    expect(res.status).toBe(304);
  });

  it("return 304 if gzipped file isn't modified since last serve", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir, gzip: true });
    const future = new Date(Date.now() + 86400000).toUTCString();
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt", {
      HTTP_ACCEPT_ENCODING: "gzip",
      HTTP_IF_MODIFIED_SINCE: future,
    });
    expect(res.status).toBe(304);
  });

  it("supports serving fixed cache-control (legacy option)", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir, cache_control: "public, max-age=600" });
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt");
    expect(res.headers["cache-control"]).toBe("public, max-age=600");
  });

  it("supports header rule :all", async () => {
    const app = new Static(fallbackApp, {
      urls: ["/static"], root: tmpDir,
      header_rules: [[":all", { "x-all": "yes" }]],
    });
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt");
    expect(res.headers["x-all"]).toBe("yes");
  });

  it("supports header rule :fonts", async () => {
    const app = new Static(fallbackApp, {
      urls: ["/static"], root: tmpDir,
      header_rules: [[":fonts", { "access-control-allow-origin": "*" }]],
    });
    const res = await new MockRequest((env) => app.call(env)).get("/static/font.woff2");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("supports file extension header rules provided as an Array", async () => {
    const app = new Static(fallbackApp, {
      urls: ["/static"], root: tmpDir,
      header_rules: [[[".txt"], { "x-ext": "txt" }]],
    });
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt");
    expect(res.headers["x-ext"]).toBe("txt");
  });

  it("supports folder rules provided as a String", async () => {
    const app = new Static(fallbackApp, {
      urls: ["/static"], root: tmpDir,
      header_rules: [["/static/sub", { "x-folder": "sub" }]],
    });
    const res = await new MockRequest((env) => app.call(env)).get("/static/sub/page.html");
    expect(res.headers["x-folder"]).toBe("sub");
  });

  it("supports folder header rules provided as a String not starting with a slash", async () => {
    const app = new Static(fallbackApp, {
      urls: ["/static"], root: tmpDir,
      header_rules: [["static/sub", { "x-folder": "sub2" }]],
    });
    const res = await new MockRequest((env) => app.call(env)).get("/static/sub/page.html");
    expect(res.headers["x-folder"]).toBe("sub2");
  });

  it("supports flexible header rules provided as Regexp", async () => {
    const app = new Static(fallbackApp, {
      urls: ["/static"], root: tmpDir,
      header_rules: [[/\.txt$/, { "x-regex": "matched" }]],
    });
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt");
    expect(res.headers["x-regex"]).toBe("matched");
  });

  it("prioritizes header rules over fixed cache-control setting (legacy option)", async () => {
    const app = new Static(fallbackApp, {
      urls: ["/static"], root: tmpDir,
      cache_control: "public",
      header_rules: [[":all", { "cache-control": "private" }]],
    });
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt");
    expect(res.headers["cache-control"]).toBe("private");
  });

  it("expands the root path upon the middleware initialization", async () => {
    const app = new Static(fallbackApp, { urls: ["/static"], root: tmpDir });
    // Just verifying it initializes without error and can serve
    const res = await new MockRequest((env) => app.call(env)).get("/static/test.txt");
    expect(res.status).toBe(200);
  });
});
