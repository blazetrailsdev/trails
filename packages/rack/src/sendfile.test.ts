import { it, expect } from "vitest";
import { Sendfile } from "./sendfile.js";
import { MockRequest } from "./mock-request.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const tmpdir = os.tmpdir();

function sendfileBody(filename = "rack_sendfile") {
  const filepath = path.join(tmpdir, filename);
  fs.writeFileSync(filepath, "");
  const body: any = ["Hello World"];
  body.toPath = () => filepath;
  return body;
}

function simpleApp(body: any = sendfileBody()) {
  return async () => [200, { "content-type": "text/plain" }, body] as any;
}

function sendfileApp(body: any, mappings: [string, string][] = []) {
  return new Sendfile(simpleApp(body), null, mappings);
}

it("does nothing when no x-sendfile-type header present", async () => {
  const res = await new MockRequest((env) => sendfileApp(sendfileBody()).call(env)).get("/");
  expect(res.status).toBe(200);
  expect(res.body).toBe("Hello World");
  expect(res.headers["x-sendfile"]).toBeUndefined();
});

it("does nothing and logs to rack.errors when incorrect x-sendfile-type header present", async () => {
  const body = sendfileBody();
  const app = sendfileApp(body);
  const res = await new MockRequest((env) => app.call(env)).get("/", {
    HTTP_X_SENDFILE_TYPE: "X-Banana",
  });
  expect(res.status).toBe(200);
  expect(res.body).toBe("Hello World");
  expect(res.headers["x-sendfile"]).toBeUndefined();
  expect(res.errors).toContain('Unknown x-sendfile variation: "X-Banana"');
});

it("sets x-sendfile response header and discards body", async () => {
  const body = sendfileBody();
  const app = sendfileApp(body);
  const res = await new MockRequest((env) => app.call(env)).get("/", {
    HTTP_X_SENDFILE_TYPE: "x-sendfile",
  });
  expect(res.status).toBe(200);
  expect(res.body).toBe("");
  expect(res.headers["content-length"]).toBe("0");
  expect(res.headers["x-sendfile"]).toBe(path.join(tmpdir, "rack_sendfile"));
});

it("closes body when x-sendfile used", async () => {
  const body = sendfileBody();
  let closed = false;
  body.close = () => {
    closed = true;
  };
  const app = sendfileApp(body);
  const res = await new MockRequest((env) => app.call(env)).get("/", {
    HTTP_X_SENDFILE_TYPE: "x-sendfile",
  });
  expect(res.status).toBe(200);
  expect(res.body).toBe("");
  expect(res.headers["x-sendfile"]).toBe(path.join(tmpdir, "rack_sendfile"));
  expect(closed).toBe(true);
});

it("sets x-lighttpd-send-file response header and discards body", async () => {
  const body = sendfileBody();
  const app = sendfileApp(body);
  const res = await new MockRequest((env) => app.call(env)).get("/", {
    HTTP_X_SENDFILE_TYPE: "x-lighttpd-send-file",
  });
  expect(res.status).toBe(200);
  expect(res.body).toBe("");
  expect(res.headers["content-length"]).toBe("0");
  expect(res.headers["x-lighttpd-send-file"]).toBe(path.join(tmpdir, "rack_sendfile"));
});

it("sets x-accel-redirect response header and discards body", async () => {
  const body = sendfileBody();
  const app = sendfileApp(body);
  const res = await new MockRequest((env) => app.call(env)).get("/", {
    HTTP_X_SENDFILE_TYPE: "x-accel-redirect",
    HTTP_X_ACCEL_MAPPING: `${tmpdir}/=/foo/bar/`,
  });
  expect(res.status).toBe(200);
  expect(res.body).toBe("");
  expect(res.headers["content-length"]).toBe("0");
  expect(res.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");
});

it("sets x-accel-redirect response header to percent-encoded path", async () => {
  const body = sendfileBody("file_with_%_?_symbol");
  const app = sendfileApp(body);
  const res = await new MockRequest((env) => app.call(env)).get("/", {
    HTTP_X_SENDFILE_TYPE: "x-accel-redirect",
    HTTP_X_ACCEL_MAPPING: `${tmpdir}/=/foo/bar%/`,
  });
  expect(res.status).toBe(200);
  expect(res.body).toBe("");
  expect(res.headers["content-length"]).toBe("0");
  expect(res.headers["x-accel-redirect"]).toBe("/foo/bar%25/file_with_%25_%3F_symbol");
});

it("writes to rack.error when no x-accel-mapping is specified", async () => {
  const body = sendfileBody();
  const app = sendfileApp(body);
  const res = await new MockRequest((env) => app.call(env)).get("/", {
    HTTP_X_SENDFILE_TYPE: "x-accel-redirect",
  });
  expect(res.status).toBe(200);
  expect(res.body).toBe("Hello World");
  expect(res.headers["x-accel-redirect"]).toBeUndefined();
  expect(res.errors).toContain("x-accel-mapping");
});

it("does nothing when body does not respond to #to_path", async () => {
  const app = sendfileApp(["Not a file..."]);
  const res = await new MockRequest((env) => app.call(env)).get("/", {
    HTTP_X_SENDFILE_TYPE: "x-sendfile",
  });
  expect(res.body).toBe("Not a file...");
  expect(res.headers["x-sendfile"]).toBeUndefined();
});

it("sets x-accel-redirect response header and discards body when initialized with multiple mappings", async () => {
  const dir1 = fs.mkdtempSync(path.join(tmpdir, "rack-test-"));
  const dir2 = fs.mkdtempSync(path.join(tmpdir, "rack-test-"));
  try {
    fs.writeFileSync(path.join(dir1, "rack_sendfile"), "hello world");
    fs.writeFileSync(path.join(dir2, "rack_sendfile"), "goodbye world");

    const body1: any = ["hello world"];
    body1.toPath = () => path.join(dir1, "rack_sendfile");
    const body2: any = ["goodbye world"];
    body2.toPath = () => path.join(dir2, "rack_sendfile");

    const mappings: [string, string][] = [
      [`${dir1}/`, "/foo/bar/"],
      [`${dir2}/`, "/wibble/"],
    ];

    let res = await new MockRequest((env) => sendfileApp(body1, mappings).call(env)).get("/", {
      HTTP_X_SENDFILE_TYPE: "x-accel-redirect",
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe("");
    expect(res.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");

    res = await new MockRequest((env) => sendfileApp(body2, mappings).call(env)).get("/", {
      HTTP_X_SENDFILE_TYPE: "x-accel-redirect",
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe("");
    expect(res.headers["x-accel-redirect"]).toBe("/wibble/rack_sendfile");
  } finally {
    fs.rmSync(dir1, { recursive: true });
    fs.rmSync(dir2, { recursive: true });
  }
});

it("sets x-accel-redirect response header and discards body when initialized with multiple mappings via header", async () => {
  const dir1 = fs.mkdtempSync(path.join(tmpdir, "rack-test-"));
  const dir2 = fs.mkdtempSync(path.join(tmpdir, "rack-test-"));
  const dir3 = fs.mkdtempSync(path.join(tmpdir, "rack-test-"));
  try {
    fs.writeFileSync(path.join(dir1, "rack_sendfile"), "hello world");
    fs.writeFileSync(path.join(dir2, "rack_sendfile"), "goodbye world");
    fs.writeFileSync(path.join(dir3, "rack_sendfile"), "hello again");

    const body1: any = ["hello world"];
    body1.toPath = () => path.join(dir1, "rack_sendfile");

    const body2: any = ["goodbye world"];
    body2.toPath = () => path.join(dir2, "rack_sendfile");

    const body3: any = ["hello again"];
    body3.toPath = () => path.join(dir3, "rack_sendfile");

    const headers = {
      HTTP_X_SENDFILE_TYPE: "x-accel-redirect",
      HTTP_X_ACCEL_MAPPING: `${dir1}/=/foo/bar/, ${dir2}/=/wibble/`,
    };

    let res = await new MockRequest((env) => sendfileApp(body1).call(env)).get("/", headers);
    expect(res.status).toBe(200);
    expect(res.body).toBe("");
    expect(res.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");

    res = await new MockRequest((env) => sendfileApp(body2).call(env)).get("/", headers);
    expect(res.status).toBe(200);
    expect(res.body).toBe("");
    expect(res.headers["x-accel-redirect"]).toBe("/wibble/rack_sendfile");

    res = await new MockRequest((env) => sendfileApp(body3).call(env)).get("/", headers);
    expect(res.status).toBe(200);
    expect(res.body).toBe("");
    expect(res.headers["x-accel-redirect"]).toBe(`${dir3}/rack_sendfile`);
  } finally {
    fs.rmSync(dir1, { recursive: true });
    fs.rmSync(dir2, { recursive: true });
    fs.rmSync(dir3, { recursive: true });
  }
});
