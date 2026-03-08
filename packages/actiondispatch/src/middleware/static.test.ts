import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Static } from "./static.js";
import type { RackEnv, RackResponse } from "@rails-ts/rack";
import { bodyFromString, bodyToString } from "@rails-ts/rack";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const dynamicApp = async (_env: RackEnv): Promise<RackResponse> => [
  200,
  { "content-type": "text/plain" },
  bodyFromString("dynamic content"),
];

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "static-test-"));
  // Create test files
  fs.writeFileSync(path.join(tmpDir, "index.html"), "<html>root</html>");
  fs.mkdirSync(path.join(tmpDir, "subdir"));
  fs.writeFileSync(path.join(tmpDir, "subdir", "index.html"), "<html>subdir</html>");
  fs.writeFileSync(path.join(tmpDir, "subdir", "page.html"), "<html>page</html>");
  fs.writeFileSync(path.join(tmpDir, "hello.txt"), "hello world");
  fs.writeFileSync(path.join(tmpDir, "file.js"), "console.log('hi')");
  fs.writeFileSync(path.join(tmpDir, "style.css"), "body { color: red; }");
  fs.writeFileSync(path.join(tmpDir, "data.json"), '{"key":"value"}');
  fs.writeFileSync(path.join(tmpDir, "image.svg"), "<svg></svg>");
  // Compressed versions
  fs.writeFileSync(path.join(tmpDir, "hello.txt.gz"), "gzipped content");
  fs.writeFileSync(path.join(tmpDir, "hello.txt.br"), "brotli content");
  fs.writeFileSync(path.join(tmpDir, "image.svg.gz"), "gzipped svg");
  // Special filenames
  fs.writeFileSync(path.join(tmpDir, "file with spaces.txt"), "spaces");
  fs.writeFileSync(path.join(tmpDir, "file!bang.txt"), "bang");
  fs.writeFileSync(path.join(tmpDir, "file$dollar.txt"), "dollar");
  fs.writeFileSync(path.join(tmpDir, "file&amp.txt"), "amp");
  fs.writeFileSync(path.join(tmpDir, "file'apos.txt"), "apos");
  fs.writeFileSync(path.join(tmpDir, "file(paren).txt"), "paren");
  fs.writeFileSync(path.join(tmpDir, "file+plus.txt"), "plus");
  fs.writeFileSync(path.join(tmpDir, "file,comma.txt"), "comma");
  fs.writeFileSync(path.join(tmpDir, "file;semi.txt"), "semi");
  fs.writeFileSync(path.join(tmpDir, "file@at.txt"), "at");
  fs.writeFileSync(path.join(tmpDir, "file:colon.txt"), "colon");
  fs.writeFileSync(path.join(tmpDir, "file*star.txt"), "star");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ActionDispatch::Static", () => {
  it("serves dynamic content", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status, _, body] = await mw.call({ PATH_INFO: "/missing", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("dynamic content");
  });

  it("handles urls with null byte", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/hello\0.txt", REQUEST_METHOD: "GET" });
    // Falls through to dynamic app
    expect(status).toBe(200);
  });

  it("serves static index at root", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status, headers, body] = await mw.call({ PATH_INFO: "/", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("text/html");
    expect(await bodyToString(body)).toContain("root");
  });

  it("serves static file in directory", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status, _, body] = await mw.call({ PATH_INFO: "/hello.txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("hello world");
  });

  it("serves static index file in directory", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status, _, body] = await mw.call({ PATH_INFO: "/subdir/", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toContain("subdir");
  });

  it("serves file with same name before index in directory", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status, _, body] = await mw.call({ PATH_INFO: "/subdir/page.html", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toContain("page");
  });

  it("serves static file with exclamation mark in filename", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/file!bang.txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
  });

  it("serves static file with dollar sign in filename", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/file$dollar.txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
  });

  it("serves static file with ampersand in filename", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/file&amp.txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
  });

  it("serves static file with apostrophe in filename", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/file'apos.txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
  });

  it("serves static file with parentheses in filename", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/file(paren).txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
  });

  it("serves static file with plus sign in filename", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/file+plus.txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
  });

  it("serves static file with comma in filename", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/file,comma.txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
  });

  it("serves static file with semi colon in filename", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/file;semi.txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
  });

  it("serves static file with at symbol in filename", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/file@at.txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
  });

  it("serves gzip files when header set", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status, headers] = await mw.call({
      PATH_INFO: "/hello.txt",
      REQUEST_METHOD: "GET",
      HTTP_ACCEPT_ENCODING: "gzip",
    });
    expect(status).toBe(200);
    expect(headers["content-encoding"]).toBe("gzip");
  });

  it("serves gzip files when svg", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status, headers] = await mw.call({
      PATH_INFO: "/image.svg",
      REQUEST_METHOD: "GET",
      HTTP_ACCEPT_ENCODING: "gzip",
    });
    expect(status).toBe(200);
    expect(headers["content-encoding"]).toBe("gzip");
  });

  it("set vary when origin compressed but client cant accept", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status, headers] = await mw.call({
      PATH_INFO: "/hello.txt",
      REQUEST_METHOD: "GET",
      HTTP_ACCEPT_ENCODING: "identity",
    });
    expect(status).toBe(200);
    expect(headers["vary"]).toBe("Accept-Encoding");
  });

  it("serves brotli files when header set", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status, headers] = await mw.call({
      PATH_INFO: "/hello.txt",
      REQUEST_METHOD: "GET",
      HTTP_ACCEPT_ENCODING: "br",
    });
    expect(status).toBe(200);
    expect(headers["content-encoding"]).toBe("br");
  });

  it("serves brotli files before gzip files", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status, headers] = await mw.call({
      PATH_INFO: "/hello.txt",
      REQUEST_METHOD: "GET",
      HTTP_ACCEPT_ENCODING: "br, gzip",
    });
    expect(status).toBe(200);
    expect(headers["content-encoding"]).toBe("br");
  });

  it("does not modify path info", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const env = { PATH_INFO: "/hello.txt", REQUEST_METHOD: "GET" } as RackEnv;
    await mw.call(env);
    expect(env["PATH_INFO"]).toBe("/hello.txt");
  });

  it("only set one content type", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [_, headers] = await mw.call({ PATH_INFO: "/hello.txt", REQUEST_METHOD: "GET" });
    expect(headers["content-type"]).toBe("text/plain; charset=utf-8");
  });

  it("serves files with headers", async () => {
    const mw = new Static(dynamicApp, {
      root: tmpDir,
      headers: { "cache-control": "public, max-age=3600" },
    });
    const [_, headers] = await mw.call({ PATH_INFO: "/hello.txt", REQUEST_METHOD: "GET" });
    expect(headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("ignores unknown http methods", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/hello.txt", REQUEST_METHOD: "POST" });
    expect(status).toBe(200); // falls through to dynamic app
  });

  it("custom handler called when file is outside root", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/../etc/passwd", REQUEST_METHOD: "GET" });
    // Path traversal is blocked, falls through to dynamic app
    expect(status).toBe(200);
  });

  it("non default static index", async () => {
    fs.writeFileSync(path.join(tmpDir, "default.html"), "<html>custom index</html>");
    const mw = new Static(dynamicApp, { root: tmpDir, index: "default.html" });
    const [status, _, body] = await mw.call({ PATH_INFO: "/", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toContain("custom index");
    fs.unlinkSync(path.join(tmpDir, "default.html"));
  });

  it("serves static file with colon", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/file:colon.txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
  });

  it("serves static file with asterisk", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [status] = await mw.call({ PATH_INFO: "/file*star.txt", REQUEST_METHOD: "GET" });
    expect(status).toBe(200);
  });

  it("content type for css", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [_, headers] = await mw.call({ PATH_INFO: "/style.css", REQUEST_METHOD: "GET" });
    expect(headers["content-type"]).toContain("text/css");
  });

  it("content type for js", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [_, headers] = await mw.call({ PATH_INFO: "/file.js", REQUEST_METHOD: "GET" });
    expect(headers["content-type"]).toContain("text/javascript");
  });

  it("content type for json", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [_, headers] = await mw.call({ PATH_INFO: "/data.json", REQUEST_METHOD: "GET" });
    expect(headers["content-type"]).toContain("application/json");
  });

  it("content type for svg", async () => {
    const mw = new Static(dynamicApp, { root: tmpDir });
    const [_, headers] = await mw.call({
      PATH_INFO: "/image.svg",
      REQUEST_METHOD: "GET",
    });
    expect(headers["content-type"]).toContain("image/svg+xml");
  });
});
