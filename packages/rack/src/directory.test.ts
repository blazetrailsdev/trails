import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Directory } from "./directory.js";
import { MockRequest } from "./mock-request.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rack-dir-"));
  fs.mkdirSync(path.join(tmpDir, "sub dir+plus"));
  fs.writeFileSync(path.join(tmpDir, "test.txt"), "hello");
  fs.writeFileSync(path.join(tmpDir, "sub dir+plus", "file.txt"), "nested");
  fs.mkdirSync(path.join(tmpDir, "subdir"));
  fs.writeFileSync(path.join(tmpDir, "subdir", "page.html"), "<html>page</html>");
  fs.writeFileSync(path.join(tmpDir, "spaced file.txt"), "spaced");
  fs.writeFileSync(path.join(tmpDir, "quoted'file.txt"), "quoted");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeApp() {
  return new Directory(tmpDir);
}

describe("Rack::Directory", () => {
  it("serves directories with + in the name", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/sub%20dir%2Bplus/");
    expect(res.status).toBe(200);
    expect(res.bodyString).toContain("file.txt");
  });

  it("serve root directory index", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.status).toBe(200);
    expect(res.bodyString).toContain("test.txt");
    expect(res.bodyString).toContain("subdir");
  });

  it("serve directory indices", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/subdir/");
    expect(res.status).toBe(200);
    expect(res.bodyString).toContain("page.html");
  });

  it.skip("return 404 for pipes", () => {});

  it.skip("serve directory indices with bad symlinks", () => {});

  it.skip("return 404 for unreadable directories", () => {});

  it("pass to app if file found", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test.txt");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("hello");
  });

  it("serve uri with URL encoded filenames", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/spaced%20file.txt");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("spaced");
  });

  it("serve uri with URL encoded null byte (%00) in filenames", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test%00.txt");
    expect(res.status).toBe(400);
  });

  it("allow directory traversal inside root directory", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/subdir/../test.txt");
    expect(res.status).toBe(200);
  });

  it("not allow directory traversal", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/../../../etc/passwd");
    expect(res.status).toBe(404);
  });

  it("not allow directory traversal via root prefix bypass", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/%2E%2E/%2E%2E/etc/passwd");
    expect(res.status).toBe(404);
  });

  it("not allow dir globs", async () => {
    const app = makeApp();
    // Glob patterns should not expand
    const res = await new MockRequest((env) => app.call(env)).get("/*.txt");
    expect(res.status).toBe(404);
  });

  it("404 if it can't find the file", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/nonexistent.txt");
    expect(res.status).toBe(404);
  });

  it("uri escape path parts", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.status).toBe(200);
    // Directory listing should contain URI-escaped links
    expect(res.bodyString).toContain("href=");
  });

  it("correctly escape script name with spaces", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/", { SCRIPT_NAME: "/my app" });
    expect(res.status).toBe(200);
    expect(res.bodyString).toContain("my app");
  });

  it("correctly escape script name with '", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/", { SCRIPT_NAME: "/it's" });
    expect(res.status).toBe(200);
    expect(res.bodyString).toContain("&#39;");
  });

  it("correctly escape script name", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/", { SCRIPT_NAME: "/test<script>" });
    expect(res.status).toBe(200);
    expect(res.bodyString).not.toContain("<script>");
    expect(res.bodyString).toContain("&lt;script&gt;");
  });

  it("return error when file not found for head request", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).head("/nonexistent.txt");
    expect(res.status).toBe(404);
  });
});
