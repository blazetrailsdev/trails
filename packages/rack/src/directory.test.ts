import { it, expect, beforeEach } from "vitest";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import * as fs from "fs";
import { Directory } from "./directory.js";
import { MockRequest, type RackApp } from "./mock-request.js";
import { Lint } from "./lint.js";
import { Builder } from "./builder.js";
import { escape, escapeHtml, escapePath } from "./utils.js";

const DOCROOT = File.expandPath(File.join(__dirname, "..", "test"));
const FILE_CATCH: RackApp = () => [
  200,
  { "content-type": "text/plain", "content-length": "7" },
  ["passed!"],
];

let app: Lint;

beforeEach(() => {
  app = new Lint(new Directory(DOCROOT, FILE_CATCH));
});

async function withTmpdir(block: (dir: string) => Promise<void>): Promise<void> {
  const dir = Dir.mktmpdir();
  try {
    await block(dir);
  } finally {
    FileUtils.rmRf(dir);
  }
}

it("serves directories with + in the name", async () => {
  await withTmpdir(async (dir) => {
    const plusDir = "foo+bar";
    const fullDir = File.join(dir, plusDir);
    FileUtils.mkdirP(fullDir);
    FileUtils.touch(File.join(fullDir, "omg.txt"));
    const app = new Directory(dir, FILE_CATCH);
    const env = MockRequest.envFor(`/${plusDir}/`);
    const [status, , body] = await app.call(env);

    expect(status).toBe(200);

    let str = "";
    body.each((x: string) => (str += x));
    expect(str).toMatch("foo+bar");
  });
});

it("serve root directory index", async () => {
  const res = await new MockRequest(new Lint(app)).get("/");

  expect(res.isOk).toBeTruthy();
  expect(res.body).toContain("<html><head>");
  expect(res.body).toContain("href='cgi");
});

it("serve directory indices", async () => {
  const res = await new MockRequest(new Lint(app)).get("/cgi/");

  expect(res.isOk).toBeTruthy();
  expect(res.body).toContain("<html><head>");
  expect(res.body).toContain("rackup_stub.rb");
});

it("return 404 for pipes", async () => {
  const res = await new MockRequest(new Lint(app)).get("/cgi/fifo");

  expect(res.status).toBe(404);
});

it("serve directory indices with bad symlinks", async () => {
  try {
    await fs.promises.symlink("foo", File.join(DOCROOT, "cgi", "foo"));
    const res = await new MockRequest(new Lint(app)).get("/cgi/");

    expect(res.isOk).toBeTruthy();
    expect(res.body).toMatch(/<html><head>/);
  } finally {
    File.delete(File.join(DOCROOT, "cgi", "foo"));
  }
});

it("return 404 for unreadable directories", async () => {
  try {
    File.write(File.join(DOCROOT, "cgi", "unreadable"), "");
    File.chmod(0, File.join(DOCROOT, "cgi", "unreadable"));
    const res = await new MockRequest(new Lint(app)).get("/cgi/unreadable");

    expect(res.status).toBe(404);
  } finally {
    File.delete(File.join(DOCROOT, "cgi", "unreadable"));
  }
});

it("pass to app if file found", async () => {
  const res = await new MockRequest(new Lint(app)).get("/cgi/test");

  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/passed!/);
});

it("serve uri with URL encoded filenames", async () => {
  let res = await new MockRequest(new Lint(app)).get("/%63%67%69/");

  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/<html><head>/);

  res = await new MockRequest(new Lint(app)).get("/cgi/%74%65%73%74");

  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(/passed!/);
});

it("serve uri with URL encoded null byte (%00) in filenames", async () => {
  const res = await new MockRequest(new Lint(app)).get("/cgi/test%00");

  expect(res.isBadRequest).toBeTruthy();
});

it("allow directory traversal inside root directory", async () => {
  let res = await new MockRequest(new Lint(app)).get("/cgi/../rackup");

  expect(res.isOk).toBeTruthy();

  res = await new MockRequest(new Lint(app)).get("/cgi/%2E%2E/rackup");

  expect(res.isOk).toBeTruthy();
});

it("not allow directory traversal", async () => {
  let res = await new MockRequest(new Lint(app)).get("/cgi/../../lib");

  expect(res.isForbidden).toBeTruthy();

  res = await new MockRequest(new Lint(app)).get("/cgi/%2E%2E/%2E%2E/lib");

  expect(res.isForbidden).toBeTruthy();
});

it("not allow dir globs", async () => {
  await withTmpdir(async (dir) => {
    const weirds = "uploads/.?/.?";
    const fullDir = File.join(dir, weirds);
    FileUtils.mkdirP(fullDir);
    FileUtils.touch(File.join(dir, "secret.txt"));
    const app = new Directory(File.join(dir, "uploads"));
    const res = await new MockRequest(app).get("/.%3F");
    expect(res.body).not.toMatch("secret.txt");
  });
});

it("404 if it can't find the file", async () => {
  const res = await new MockRequest(new Lint(app)).get("/cgi/blubb");

  expect(res.isNotFound).toBeTruthy();
});

it("uri escape path parts", async () => {
  const mr = new MockRequest(new Lint(app));

  let res = await mr.get("/cgi/test%2bdirectory");

  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(new RegExp(escapeHtml("/cgi/test\\+directory/test\\+file")));

  res = await mr.get("/cgi/test%2bdirectory/test%2bfile");
  expect(res.isOk).toBeTruthy();
});

it("correctly escape script name with spaces", async () => {
  await withTmpdir(async (dir) => {
    const spaceDir = "foo bar";
    const fullDir = File.join(dir, spaceDir);
    FileUtils.mkdirP(fullDir);
    FileUtils.touch(File.join(fullDir, "omg omg.txt"));
    const app = new Directory(dir, FILE_CATCH);
    const env = MockRequest.envFor(escapePath(`/${spaceDir}/`));
    const [status, , body] = await app.call(env);

    expect(status).toBe(200);

    let str = "";
    body.each((x: string) => (str += x));
    expect(str).toMatch(escapeHtml("/foo%20bar/omg%20omg.txt"));
  });
});

it("correctly escape script name with '", async () => {
  await withTmpdir(async (dir) => {
    const quoteDir = "foo'bar";
    const fullDir = File.join(dir, quoteDir);
    FileUtils.mkdirP(fullDir);
    FileUtils.touch(File.join(fullDir, "omg'omg.txt"));
    const app = new Directory(dir, FILE_CATCH);
    const env = MockRequest.envFor(escape(`/${quoteDir}/`));
    const [status, , body] = await app.call(env);

    expect(status).toBe(200);

    let str = "";
    body.each((x: string) => (str += x));
    expect(str).toMatch(escapeHtml("/foo'bar/omg'omg.txt"));
  });
});

it("correctly escape script name", async () => {
  const _app = app;
  const app2 = new Builder(null, {}, (b) => {
    b.map("/script-path", (b) => {
      b.run(_app);
    });
  });

  const mr = new MockRequest(new Lint(app2));

  let res = await mr.get("/script-path/cgi/test%2bdirectory");

  expect(res.isOk).toBeTruthy();
  expect(res.body).toMatch(new RegExp(escapeHtml("/script-path/cgi/test\\+directory/test\\+file")));

  res = await mr.get("/script-path/cgi/test+directory/test+file");
  expect(res.isOk).toBeTruthy();
});

it("return error when file not found for head request", async () => {
  const res = await new MockRequest(new Lint(app)).head("/cgi/missing");

  expect(res.isNotFound).toBeTruthy();
  expect(res.body.length === 0).toBeTruthy();
});
