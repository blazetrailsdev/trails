import { describe, it, expect } from "vitest";
import { Sendfile } from "./sendfile.js";
import { MockRequest } from "./mock-request.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

describe("Rack::Sendfile", () => {
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

  function sendfileApp(body: any, mappings: [string, string][] = [], variation?: string | null) {
    return new Sendfile(simpleApp(body), variation, mappings);
  }

  it("does nothing when no x-sendfile-type header present", async () => {
    const res = await new MockRequest((env) => sendfileApp(sendfileBody()).call(env)).get("/");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("Hello World");
    expect(res.headers["x-sendfile"]).toBeUndefined();
  });

  it("does nothing and logs to rack.errors when incorrect x-sendfile-type header present", async () => {
    const body = sendfileBody();
    const app = sendfileApp(body, [], "X-Banana");
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("Hello World");
    expect(res.headers["x-sendfile"]).toBeUndefined();
    expect(res.errors).toContain('Unknown x-sendfile variation: "X-Banana"');
  });

  it("sets x-sendfile response header and discards body", async () => {
    const body = sendfileBody();
    const app = sendfileApp(body, [], "X-Sendfile");
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("");
    expect(res.headers["content-length"]).toBe("0");
    expect(res.headers["x-sendfile"]).toBe(path.join(tmpdir, "rack_sendfile"));
  });

  it("closes body when x-sendfile used", async () => {
    const body = sendfileBody();
    let closed = false;
    body.close = () => { closed = true; };
    const app = sendfileApp(body, [], "X-Sendfile");
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("");
    expect(res.headers["x-sendfile"]).toBe(path.join(tmpdir, "rack_sendfile"));
    expect(closed).toBe(true);
  });

  it("sets x-lighttpd-send-file response header and discards body", async () => {
    const body = sendfileBody();
    const app = sendfileApp(body, [], "X-Lighttpd-Send-File");
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("");
    expect(res.headers["content-length"]).toBe("0");
    expect(res.headers["x-lighttpd-send-file"]).toBe(path.join(tmpdir, "rack_sendfile"));
  });

  it("sets x-accel-redirect response header and discards body", async () => {
    const body = sendfileBody();
    const app = sendfileApp(body, [], "X-Accel-Redirect");
    const res = await new MockRequest((env) => app.call(env)).get("/", {
      HTTP_X_ACCEL_MAPPING: `${tmpdir}/=/foo/bar/`,
    });
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("");
    expect(res.headers["content-length"]).toBe("0");
    expect(res.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");
  });

  it("sets x-accel-redirect response header to percent-encoded path", async () => {
    const body = sendfileBody("file_with_%_?_symbol");
    const app = sendfileApp(body, [], "X-Accel-Redirect");
    const res = await new MockRequest((env) => app.call(env)).get("/", {
      HTTP_X_ACCEL_MAPPING: `${tmpdir}/=/foo/bar%/`,
    });
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("");
    expect(res.headers["content-length"]).toBe("0");
    expect(res.headers["x-accel-redirect"]).toBe("/foo/bar%25/file_with_%25_%3F_symbol");
  });

  it("writes to rack.error when no x-accel-mapping is specified", async () => {
    const body = sendfileBody();
    const app = sendfileApp(body, [], "X-Accel-Redirect");
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("Hello World");
    expect(res.headers["x-accel-redirect"]).toBeUndefined();
    expect(res.errors).toContain("x-accel-mapping");
  });

  it("does nothing when body does not respond to #to_path", async () => {
    const app = sendfileApp(["Not a file..."], [], "X-Sendfile");
    const res = await new MockRequest((env) => app.call(env)).get("/");
    expect(res.bodyString).toBe("Not a file...");
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

      let res = await new MockRequest((env) => sendfileApp(body1, mappings, "X-Accel-Redirect").call(env)).get("/");
      expect(res.status).toBe(200);
      expect(res.bodyString).toBe("");
      expect(res.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");

      res = await new MockRequest((env) => sendfileApp(body2, mappings, "X-Accel-Redirect").call(env)).get("/");
      expect(res.status).toBe(200);
      expect(res.bodyString).toBe("");
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

      const headers = { HTTP_X_ACCEL_MAPPING: `${dir1}/=/foo/bar/, ${dir2}/=/wibble/` };

      let res = await new MockRequest((env) =>
        new Sendfile(simpleApp(body1), "X-Accel-Redirect", []).call(env)
      ).get("/", headers);
      expect(res.status).toBe(200);
      expect(res.bodyString).toBe("");
      expect(res.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");

      res = await new MockRequest((env) =>
        new Sendfile(simpleApp(body2), "X-Accel-Redirect", []).call(env)
      ).get("/", headers);
      expect(res.status).toBe(200);
      expect(res.bodyString).toBe("");
      expect(res.headers["x-accel-redirect"]).toBe("/wibble/rack_sendfile");

      // Third body has no mapping match - falls through to path itself
      res = await new MockRequest((env) =>
        new Sendfile(simpleApp(body3), "X-Accel-Redirect", []).call(env)
      ).get("/", headers);
      expect(res.status).toBe(200);
      expect(res.bodyString).toBe("");
      expect(res.headers["x-accel-redirect"]).toBe(`${dir3}/rack_sendfile`);
    } finally {
      fs.rmSync(dir1, { recursive: true });
      fs.rmSync(dir2, { recursive: true });
      fs.rmSync(dir3, { recursive: true });
    }
  });

  describe("security: information disclosure prevention", () => {
    it("ignores HTTP_X_SENDFILE_TYPE header to prevent attacker-controlled sendfile activation", async () => {
      const body = sendfileBody();
      const app = sendfileApp(body);
      const res = await new MockRequest((env) => app.call(env)).get("/", {
        HTTP_X_SENDFILE_TYPE: "x-sendfile",
      });
      expect(res.status).toBe(200);
      expect(res.bodyString).toBe("Hello World");
      expect(res.headers["x-sendfile"]).toBeUndefined();
    });
  });

  it("ignores HTTP_X_SENDFILE_TYPE header attempting to enable x-accel-redirect", async () => {
    const body = sendfileBody();
    const app = sendfileApp(body);
    const res = await new MockRequest((env) => app.call(env)).get("/", {
      HTTP_X_SENDFILE_TYPE: "x-accel-redirect",
      HTTP_X_ACCEL_MAPPING: `${tmpdir}/=/attacker/path/`,
    });
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("Hello World");
    expect(res.headers["x-accel-redirect"]).toBeUndefined();
  });

  it("ignores HTTP_X_ACCEL_MAPPING when x-accel-redirect is not explicitly enabled", async () => {
    const body = sendfileBody();
    const app = sendfileApp(body);
    const res = await new MockRequest((env) => app.call(env)).get("/", {
      HTTP_X_ACCEL_MAPPING: `${tmpdir}/=/attacker/path/`,
    });
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("Hello World");
    expect(res.headers["x-accel-redirect"]).toBeUndefined();
  });

  it("ignores HTTP_X_ACCEL_MAPPING when application-level mappings are configured", async () => {
    const dir = fs.mkdtempSync(path.join(tmpdir, "rack-test-"));
    try {
      fs.writeFileSync(path.join(dir, "rack_sendfile"), "test");
      const body: any = ["test"];
      body.toPath = () => path.join(dir, "rack_sendfile");

      const appMappings: [string, string][] = [[`${dir}/`, "/app/mapping/"]];
      const app = new Sendfile(simpleApp(body), "X-Accel-Redirect", appMappings);

      const res = await new MockRequest((env) => app.call(env)).get("/", {
        HTTP_X_ACCEL_MAPPING: `${dir}/=/attacker/path/`,
      });
      expect(res.status).toBe(200);
      expect(res.headers["x-accel-redirect"]).toBe("/app/mapping/rack_sendfile");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("allows HTTP_X_ACCEL_MAPPING only when x-accel-redirect explicitly enabled with no app mappings", async () => {
    const dir = fs.mkdtempSync(path.join(tmpdir, "rack-test-"));
    try {
      fs.writeFileSync(path.join(dir, "rack_sendfile"), "test");
      const body: any = ["test"];
      body.toPath = () => path.join(dir, "rack_sendfile");

      const app = new Sendfile(simpleApp(body), "X-Accel-Redirect", []);
      const res = await new MockRequest((env) => app.call(env)).get("/", {
        HTTP_X_ACCEL_MAPPING: `${dir}/=/safe/nginx/mapping/`,
      });
      expect(res.status).toBe(200);
      expect(res.bodyString).toBe("");
      expect(res.headers["x-accel-redirect"]).toBe("/safe/nginx/mapping/rack_sendfile");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("does not allow x-lighttpd-send-file activation via header", async () => {
    const body = sendfileBody();
    const app = sendfileApp(body);
    const res = await new MockRequest((env) => app.call(env)).get("/", {
      HTTP_X_SENDFILE_TYPE: "x-lighttpd-send-file",
    });
    expect(res.status).toBe(200);
    expect(res.bodyString).toBe("Hello World");
    expect(res.headers["x-lighttpd-send-file"]).toBeUndefined();
  });

  it("requires explicit middleware configuration for any sendfile variation", async () => {
    const body = sendfileBody();
    const app = new Sendfile(simpleApp(body));
    const env = MockRequest.envFor("/");
    env["sendfile.type"] = "x-sendfile";
    const [status, headers] = await app.call(env);
    expect(status).toBe(200);
    expect(headers["x-sendfile"]).toBe(path.join(tmpdir, "rack_sendfile"));
    expect(headers["content-length"]).toBe("0");
  });
});

function simpleApp(body: any) {
  return async () => [200, { "content-type": "text/plain" }, body] as any;
}
