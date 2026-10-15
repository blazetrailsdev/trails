import { describe, it, beforeEach, expect } from "vitest";
import { readFile, stat, unlink, writeFile } from "fs/promises";
import { Lint, MockRequest, Mime, CONTENT_TYPE } from "@blazetrails/rack";
import type { MockResponse, RackApp, RackBody, RackEnv, RackResponse } from "@blazetrails/rack";
import { Gzip } from "@blazetrails/activesupport/gzip";
import { assertEqual, assertNil, assertNotEqual } from "@blazetrails/activesupport";
import { Static } from "../middleware/static.js";
import { FIXTURE_LOAD_PATH } from "../../test-helpers/abstract-unit.js";

const DummyApp = async (_env: RackEnv | null): Promise<RackResponse> => [
  200,
  { [CONTENT_TYPE]: "text/plain" },
  ["Hello, World!"] as unknown as RackBody,
];

const JAVASCRIPT_MIME_TYPE = Mime.MIME_TYPES[".js"];

function staticTest(publicPath: string): void {
  let root: string;
  let app: RackApp;

  beforeEach(() => {
    root = `${FIXTURE_LOAD_PATH}/${publicPath}`;
    app = buildApp(DummyApp, root, { headers: { "cache-control": "public, max-age=60" } });
  });

  it("serves dynamic content", async () => {
    assertEqual("Hello, World!", (await get("/nofile")).body);
  });

  it("handles urls with bad encoding", async () => {
    assertEqual("Hello, World!", (await get("/doorkeeper%E3E4")).body);
  });

  it("handles urls with ascii 8bit", async () => {
    assertEqual("Hello, World!", (await get("/doorkeeper%E3E4")).body);
  });

  it("handles urls with ascii 8bit on win 31j", async () => {
    assertEqual("Hello, World!", (await get("/doorkeeper%E3E4")).body);
  });

  it("handles urls with null byte", async () => {
    assertEqual("Hello, World!", (await get("/doorkeeper%00")).body);
  });

  it("serves static index at root", async () => {
    assertHtml("/index.html", await get("/index.html"));
    assertHtml("/index.html", await get("/index"));
    assertHtml("/index.html", await get("/"));
    assertHtml("/index.html", await get(""));
  });

  it("serves static file in directory", async () => {
    assertHtml("/foo/bar.html", await get("/foo/bar.html"));
    assertHtml("/foo/bar.html", await get("/foo/bar/"));
    assertHtml("/foo/bar.html", await get("/foo/bar"));
  });

  it("serves static index file in directory", async () => {
    assertHtml("/foo/index.html", await get("/foo/index.html"));
    assertHtml("/foo/index.html", await get("/foo/index"));
    assertHtml("/foo/index.html", await get("/foo/"));
    assertHtml("/foo/index.html", await get("/foo"));
  });

  it("serves file with same name before index in directory", async () => {
    assertHtml("/bar.html", await get("/bar"));
  });

  it("served static file with non english filename", async () => {
    assertHtml(
      "means hello in Japanese\n",
      await get("/foo/%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF.html"),
    );
  });

  it("served gzipped static file with non english filename", async () => {
    const response = await get("/foo/%E3%81%95%E3%82%88%E3%81%86%E3%81%AA%E3%82%89.html", {
      HTTP_ACCEPT_ENCODING: "gzip",
    });

    await assertGzip("/foo/さようなら.html", response);
    assertEqual("text/html", response.headers["content-type"]);
    assertEqual("accept-encoding", response.headers["vary"]);
    assertEqual("gzip", response.headers["content-encoding"]);
  });

  it("serves static file with exclamation mark in filename", async () => {
    await withStaticFile("/foo/foo!bar.html", async (file) => {
      assertHtml(file, await get("/foo/foo%21bar.html"));
      assertHtml(file, await get("/foo/foo!bar.html"));
    });
  });

  it("serves static file with dollar sign in filename", async () => {
    await withStaticFile("/foo/foo$bar.html", async (file) => {
      assertHtml(file, await get("/foo/foo%24bar.html"));
      assertHtml(file, await get("/foo/foo$bar.html"));
    });
  });

  it("serves static file with ampersand in filename", async () => {
    await withStaticFile("/foo/foo&bar.html", async (file) => {
      assertHtml(file, await get("/foo/foo%26bar.html"));
      assertHtml(file, await get("/foo/foo&bar.html"));
    });
  });

  it("serves static file with apostrophe in filename", async () => {
    await withStaticFile("/foo/foo'bar.html", async (file) => {
      assertHtml(file, await get("/foo/foo%27bar.html"));
      assertHtml(file, await get("/foo/foo'bar.html"));
    });
  });

  it("serves static file with parentheses in filename", async () => {
    await withStaticFile("/foo/foo(bar).html", async (file) => {
      assertHtml(file, await get("/foo/foo%28bar%29.html"));
      assertHtml(file, await get("/foo/foo(bar).html"));
    });
  });

  it("serves static file with plus sign in filename", async () => {
    await withStaticFile("/foo/foo+bar.html", async (file) => {
      assertHtml(file, await get("/foo/foo%2Bbar.html"));
      assertHtml(file, await get("/foo/foo+bar.html"));
    });
  });

  it("serves static file with comma in filename", async () => {
    await withStaticFile("/foo/foo,bar.html", async (file) => {
      assertHtml(file, await get("/foo/foo%2Cbar.html"));
      assertHtml(file, await get("/foo/foo,bar.html"));
    });
  });

  it("serves static file with semi colon in filename", async () => {
    await withStaticFile("/foo/foo;bar.html", async (file) => {
      assertHtml(file, await get("/foo/foo%3Bbar.html"));
      assertHtml(file, await get("/foo/foo;bar.html"));
    });
  });

  it("serves static file with at symbol in filename", async () => {
    await withStaticFile("/foo/foo@bar.html", async (file) => {
      assertHtml(file, await get("/foo/foo%40bar.html"));
      assertHtml(file, await get("/foo/foo@bar.html"));
    });
  });

  it("serves static file with colon", async () => {
    await withStaticFile("/foo/foo:bar.html", async (file) => {
      assertHtml(file, await get("/foo/foo%3Abar.html"));
      assertHtml(file, await get("/foo/foo:bar.html"));
    });
  });

  it("serves static file with asterisk", async () => {
    await withStaticFile("/foo/foo*bar.html", async (file) => {
      assertHtml(file, await get("/foo/foo%2Abar.html"));
      assertHtml(file, await get("/foo/foo*bar.html"));
    });
  });

  it("serves gzip files when header set", async () => {
    const fileName = "/gzip/application-a71b3024f80aea3181c09774ca17e712.js";
    let response = await get(fileName, { HTTP_ACCEPT_ENCODING: "gzip" });
    await assertGzip(fileName, response);
    assertEqual(JAVASCRIPT_MIME_TYPE, response.headers["content-type"]);
    assertEqual("accept-encoding", response.headers["vary"]);
    assertEqual("gzip", response.headers["content-encoding"]);

    response = await get(fileName, { HTTP_ACCEPT_ENCODING: "Gzip" });
    await assertGzip(fileName, response);

    response = await get(fileName, { HTTP_ACCEPT_ENCODING: "GZIP" });
    await assertGzip(fileName, response);

    response = await get(fileName, { HTTP_ACCEPT_ENCODING: "compress;q=0.5, gzip;q=1.0" });
    await assertGzip(fileName, response);

    response = await get(fileName, { HTTP_ACCEPT_ENCODING: "" });
    assertNotEqual("gzip", response.headers["content-encoding"]);
  });

  it("serves gzip files when svg", async () => {
    const fileName = "/gzip/logo-bcb6d75d927347158af5.svg";
    const response = await get(fileName, { HTTP_ACCEPT_ENCODING: "gzip" });
    await assertGzip(fileName, response);
    assertEqual("image/svg+xml", response.getHeader("Content-Type"));
    assertEqual("accept-encoding", response.getHeader("Vary"));
    assertEqual("gzip", response.getHeader("Content-Encoding"));
  });

  it("set vary when origin compressed but client cant accept", async () => {
    const fileName = "/gzip/application-a71b3024f80aea3181c09774ca17e712.js";
    const response = await get(fileName, { HTTP_ACCEPT_ENCODING: "None" });
    assertEqual("accept-encoding", response.headers["vary"]);
  });

  it("serves brotli files when header set", async () => {
    const fileName = "/gzip/application-a71b3024f80aea3181c09774ca17e712.js";
    let response = await get(fileName, { HTTP_ACCEPT_ENCODING: "br" });
    assertEqual(JAVASCRIPT_MIME_TYPE, response.headers["content-type"]);
    assertEqual("accept-encoding", response.headers["vary"]);
    assertEqual("br", response.headers["content-encoding"]);

    response = await get(fileName, { HTTP_ACCEPT_ENCODING: "gzip" });
    assertNotEqual("br", response.headers["content-encoding"]);
  });

  it("serves brotli files before gzip files", async () => {
    const fileName = "/gzip/application-a71b3024f80aea3181c09774ca17e712.js";
    const response = await get(fileName, { HTTP_ACCEPT_ENCODING: "gzip, deflate, sdch, br" });
    assertEqual(JAVASCRIPT_MIME_TYPE, response.headers["content-type"]);
    assertEqual("accept-encoding", response.headers["vary"]);
    assertEqual("br", response.headers["content-encoding"]);
  });

  it("does not modify path info", async () => {
    const fileName = "/gzip/application-a71b3024f80aea3181c09774ca17e712.js";
    const env = MockRequest.envFor(fileName, {
      PATH_INFO: fileName,
      HTTP_ACCEPT_ENCODING: "gzip",
      REQUEST_METHOD: "POST",
    });
    await app(env);
    assertEqual(fileName, env["PATH_INFO"]);
  });

  it("only set one content type", async () => {
    const fileName = "/gzip/foo.zoo";
    const gzipEnv = MockRequest.envFor(fileName, {
      PATH_INFO: fileName,
      HTTP_ACCEPT_ENCODING: "gzip",
      REQUEST_METHOD: "GET",
    });
    const response = await app(gzipEnv);

    const env = MockRequest.envFor(fileName, { PATH_INFO: fileName, REQUEST_METHOD: "GET" });
    const defaultResponse = await app(env);

    const slice = (h: Record<string, unknown>) =>
      ["Content-Type", "content-type"].filter((k) => Object.hasOwn(h, k));
    assertEqual(1, slice(response[1]).length);
    assertEqual(1, slice(defaultResponse[1]).length);
  });

  it("serves gzip with proper content type fallback", async () => {
    const fileName = "/gzip/foo.zoo";
    const response = await get(fileName, { HTTP_ACCEPT_ENCODING: "gzip" });
    await assertGzip(fileName, response);

    const defaultResponse = await get(fileName);
    assertEqual(defaultResponse.headers["content-type"], response.headers["content-type"]);
  });

  it("serves gzip files with not modified", async () => {
    const fileName = "/gzip/application-a71b3024f80aea3181c09774ca17e712.js";
    const lastModified = (await stat(`${root}${fileName}.gz`)).mtime;
    const response = await get(fileName, {
      HTTP_ACCEPT_ENCODING: "gzip",
      HTTP_IF_MODIFIED_SINCE: lastModified.toUTCString(),
    });
    assertEqual(304, response.status);
    assertNil(response.headers["content-type"]);
    assertNil(response.headers["content-encoding"]);
    assertNil(response.headers["vary"]);
  });

  it("serves files with headers", async () => {
    const headers = {
      "access-control-allow-origin": "http://rubyonrails.org",
      "cache-control": "public, max-age=60",
      "x-custom-header": "I'm a teapot",
    };

    app = buildApp(DummyApp, root, { headers });

    const response = await get("/foo/bar.html");

    assertEqual("http://rubyonrails.org", response.headers["access-control-allow-origin"]);
    assertEqual("public, max-age=60", response.headers["cache-control"]);
    assertEqual("I'm a teapot", response.headers["x-custom-header"]);
  });

  it("ignores unknown http methods", async () => {
    const response = await new MockRequest(app).request("BAD_METHOD", "/foo/bar.html");
    assertEqual(200, response.status);
  });

  it("custom handler called when file is outside root", async () => {
    const filename = "shared.html.tse";
    expect((await stat(`${root}/../${filename}`)).isFile()).toBe(true);
    const env = MockRequest.envFor("", {
      REQUEST_METHOD: "GET",
      REQUEST_PATH: `/..%2F${filename}`,
      PATH_INFO: `/..%2F${filename}`,
      REQUEST_URI: `/..%2F${filename}`,
    });

    const dummyResponse = await DummyApp(null);
    const appResponse = await app(env);

    assertEqual(dummyResponse[0], appResponse[0]);
    assertEqual(dummyResponse[1], appResponse[1]);
    const chunks: unknown[] = [];
    for await (const chunk of appResponse[2]) chunks.push(chunk);
    assertEqual(dummyResponse[2], chunks);
  });

  it("non default static index", async () => {
    app = buildApp(DummyApp, root, { index: "other-index" });
    assertHtml("/other-index.html", await get("/other-index.html"));
    assertHtml("/other-index.html", await get("/other-index"));
    assertHtml("/other-index.html", await get("/"));
    assertHtml("/other-index.html", await get(""));
    assertHtml("/foo/other-index.html", await get("/foo/other-index.html"));
    assertHtml("/foo/other-index.html", await get("/foo/other-index"));
    assertHtml("/foo/other-index.html", await get("/foo/"));
    assertHtml("/foo/other-index.html", await get("/foo"));
  });

  function buildApp(
    app: RackApp,
    path: string,
    { index = "index", headers = {} }: { index?: string; headers?: Record<string, string> } = {},
  ): RackApp {
    const lint = new Lint(new Static(new Lint(app) as never, path, { index, headers }) as never);
    return (env) => lint.call(env);
  }

  async function assertGzip(fileName: string, response: MockResponse): Promise<void> {
    const expected = await readFile(`${FIXTURE_LOAD_PATH}/${publicPath}${fileName}`, "utf8");
    const actual = Gzip.decompress(response.body);
    assertEqual(expected, actual);
  }

  function assertHtml(body: string, response: MockResponse): void {
    assertEqual(body, response.body);
    assertEqual("text/html", response.headers["content-type"]);
    assertNil(response.headers["vary"]);
  }

  function get(path: string, headers: Record<string, string> = {}): Promise<MockResponse> {
    return new MockRequest(app).request("GET", path, headers);
  }

  async function withStaticFile(
    file: string,
    block: (file: string) => Promise<void>,
  ): Promise<void> {
    const path = `${FIXTURE_LOAD_PATH}/${publicPath}${file}`;
    try {
      await writeFile(path, file);
      await block(file);
    } finally {
      await unlink(path).catch(() => {});
    }
  }
}

describe("StaticTest", () => {
  staticTest("public");
});

describe("StaticEncodingTest", () => {
  staticTest("公共");
});
