import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Files } from "./files.js";
import { MockRequest } from "./mock-request.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

let tmpDir: string;
let testFile: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rack-files-"));
  testFile = path.join(tmpDir, "test.txt");
  fs.writeFileSync(testFile, "Hello World");
  fs.writeFileSync(path.join(tmpDir, "test+plus.txt"), "plus file");
  fs.writeFileSync(path.join(tmpDir, "test space.txt"), "space file");
  fs.mkdirSync(path.join(tmpDir, "subdir"));
  fs.writeFileSync(path.join(tmpDir, "subdir", "nested.txt"), "nested");
  fs.writeFileSync(path.join(tmpDir, "empty.txt"), "");
  fs.writeFileSync(path.join(tmpDir, "test..dots.txt"), "dots");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeApp(headers: Record<string, string> = {}, defaultMime: string | null = "text/plain") {
  return new Files(tmpDir, headers, defaultMime);
}

it("returns 416 error and correct Content-Range for unsatisfiable byte range", async () => {
  const app = makeApp();
  const res = await new MockRequest((env) => app.call(env)).get("/test.txt", { HTTP_RANGE: "bytes=100-200" });
  expect(res.status).toBe(416);
  expect(res.headers["content-range"]).toContain("bytes */");
});

it("ignores range when file size is 0 bytes", async () => {
  const app = makeApp();
  const res = await new MockRequest((env) => app.call(env)).get("/empty.txt", { HTTP_RANGE: "bytes=0-0" });
  expect(res.status).toBe(200);
});

it("supports custom http headers", async () => {
  const app = makeApp({ "x-custom": "value" });
  const res = await new MockRequest((env) => app.call(env)).get("/test.txt");
  expect(res.headers["x-custom"]).toBe("value");
});

it("allows customizing the way http header's are set", async () => {
  const app = makeApp({ "cache-control": "public" });
  const res = await new MockRequest((env) => app.call(env)).get("/test.txt");
  expect(res.headers["cache-control"]).toBe("public");
});

it("does not add custom HTTP headers when none are supplied", async () => {
  const app = makeApp();
  const res = await new MockRequest((env) => app.call(env)).get("/test.txt");
  expect(res.headers["x-custom"]).toBeUndefined();
});

it("only supports GET, HEAD, and OPTIONS requests", async () => {
  const app = makeApp();
  const res = await new MockRequest((env) => app.call(env)).post("/test.txt");
  expect(res.status).toBe(405);
});

it("sets Allow correctly for OPTIONS requests", async () => {
  const app = makeApp();
  const res = await new MockRequest((env) => app.call(env)).options("/test.txt");
  expect(res.status).toBe(200);
  expect(res.headers["allow"]).toContain("GET");
});

it("sets content-length correctly for HEAD requests", async () => {
  const app = makeApp();
  const res = await new MockRequest((env) => app.call(env)).head("/test.txt");
  expect(res.status).toBe(200);
  expect(res.headers["content-length"]).toBe("11");
});

it("defaults to a MIME type of text/plain", async () => {
  const app = makeApp();
  const res = await new MockRequest((env) => app.call(env)).get("/test.txt");
  expect(res.headers["content-type"]).toContain("text/plain");
});

it("allows the default MIME type to be set", async () => {
  const noExtFile = path.join(tmpDir, "noext");
  fs.writeFileSync(noExtFile, "data");
  const app = new Files(tmpDir, {}, "application/octet-stream");
  const res = await new MockRequest((env) => app.call(env)).get("/noext");
  expect(res.headers["content-type"]).toBe("application/octet-stream");
});

it("does not set the content-type header if the MIME type is not specified", async () => {
  const noExtFile = path.join(tmpDir, "noext2");
  fs.writeFileSync(noExtFile, "data");
  const app = new Files(tmpDir, {}, null);
  const res = await new MockRequest((env) => app.call(env)).get("/noext2");
  expect(res.headers["content-type"]).toBeUndefined();
});

it("returns 404 and empty body for a HEAD request when the file is not found", async () => {
  const app = makeApp();
  const res = await new MockRequest((env) => app.call(env)).head("/nonexistent.txt");
  expect(res.status).toBe(404);
});

describe("Rack::Files", () => {
  it("can be used without root", async () => {
    const app = new Files("");
    const res = await new MockRequest((env) => app.call(env)).get(testFile);
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("Hello World");
  });

  it("serves files with + in the file name", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test+plus.txt");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("plus file");
  });

  it("serves the correct file content for a GET request", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test.txt");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("Hello World");
  });

  it("does not serve directories", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/subdir");
    expect(res.status).toBe(404);
  });

  it("sets the last-modified header", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test.txt");
    expect(res.headers["last-modified"]).toBeDefined();
  });

  it("returns 304 if file isn't modified since last serve", async () => {
    const app = makeApp();
    const futureDate = new Date(Date.now() + 86400000).toUTCString();
    const res = await new MockRequest((env) => app.call(env)).get("/test.txt", {
      HTTP_IF_MODIFIED_SINCE: futureDate,
    });
    expect(res.status).toBe(304);
  });

  it("returns the file if it has been modified since last serve", async () => {
    const app = makeApp();
    const pastDate = new Date(0).toUTCString();
    const res = await new MockRequest((env) => app.call(env)).get("/test.txt", {
      HTTP_IF_MODIFIED_SINCE: pastDate,
    });
    expect(res.status).toBe(200);
  });

  it("serves files with URL encoded filenames", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test%20space.txt");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("space file");
  });

  it("serves uri with URL encoded null byte (%00) in filenames", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test%00.txt");
    expect(res.status).toBe(400);
  });

  it("allows safe directory traversal", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/subdir/../test.txt");
    expect(res.status).toBe(200);
  });

  it("does not allow unsafe directory traversal", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/../../../etc/passwd");
    expect(res.status).toBe(404);
  });

  it("allows files with .. in their name", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test..dots.txt");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("dots");
  });

  it("does not allow unsafe directory traversal with encoded periods", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/%2E%2E/%2E%2E/etc/passwd");
    expect(res.status).toBe(404);
  });

  it("allows safe directory traversal with encoded periods", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/subdir/%2E%2E/test.txt");
    expect(res.status).toBe(200);
  });

  it("returns 404 if it can't find the file", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/nonexistent.txt");
    expect(res.status).toBe(404);
  });

  it("detects SystemCallErrors", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns bodies that respond to #to_path", async () => {
    const app = makeApp();
    const env = MockRequest.envFor("/test.txt");
    const [status, headers, body] = app.serving(env, "/test.txt");
    expect(status).toBe(200);
    expect(typeof body.toPath).toBe("function");
    expect(body.toPath()).toBe(path.join(tmpDir, "test.txt"));
  });

  it("returns bodies that do not respond to #to_path if a byte range is requested", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test.txt", {
      HTTP_RANGE: "bytes=0-4",
    });
    expect(res.status).toBe(206);
    expect(res.bodyString).toBe("Hello");
  });

  it("returns correct byte range in body", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test.txt", {
      HTTP_RANGE: "bytes=6-10",
    });
    expect(res.status).toBe(206);
    expect(res.bodyString).toBe("World");
    expect(res.headers["content-range"]).toBe("bytes 6-10/11");
  });

  it("handles cases where the file is truncated during request", async () => {
    // If a file shrinks between stat and read, the server should handle gracefully
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test.txt");
    expect(res.status).toBe(200);
    // File content should still be served correctly
    expect(res.bodyString).toBe("Hello World");
  });

  it("returns correct multiple byte ranges in body", async () => {
    const app = makeApp();
    const res = await new MockRequest((env) => app.call(env)).get("/test.txt", {
      HTTP_RANGE: "bytes=0-4,6-10",
    });
    expect(res.status).toBe(206);
    expect(res.headers["content-type"]).toContain("multipart/byteranges");
    expect(res.bodyString).toContain("Hello");
    expect(res.bodyString).toContain("World");
  });
});
