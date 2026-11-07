import { describe, it, expect } from "vitest";
import { Dir, File, FileUtils, StringIO } from "@blazetrails/ruby-compat";
import { Sendfile } from "./sendfile.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";
import type { MockResponse } from "./mock-response.js";
import { escapePath } from "./utils.js";

function sendfileBody(filename = "rack_sendfile") {
  FileUtils.touch(File.join(Dir.tmpdir(), filename));
  const res: any = ["Hello World"];
  res.toPath = () => File.join(Dir.tmpdir(), filename);
  return res;
}

function simpleApp(body: any = sendfileBody()) {
  return (_env: Record<string, any>) => [200, { "content-type": "text/plain" }, body];
}

function sendfileApp(
  body: any,
  mappings: [string, string][] = [],
  variation: string | null = null,
) {
  return new Lint(new Sendfile(simpleApp(body), variation, mappings));
}

async function request(
  headers: Record<string, any> = {},
  body: any = sendfileBody(),
  mappings: [string, string][] = [],
  variation: string | null = null,
  block: (response: MockResponse) => void,
) {
  block(await new MockRequest(sendfileApp(body, mappings, variation)).get("/", headers));
}

function openFile(path: string) {
  return File.open(path, "wb+");
}

it("does nothing when no x-sendfile-type header present", async () => {
  await request(undefined, undefined, undefined, undefined, (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body).toBe("Hello World");
    expect(Object.keys(response.headers)).not.toContain("x-sendfile");
  });
});

it("does nothing and logs to rack.errors when incorrect x-sendfile-type header present", async () => {
  const io = new StringIO();
  await request({ "rack.errors": io }, sendfileBody(), [], "X-Banana", (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body).toBe("Hello World");
    expect(Object.keys(response.headers)).not.toContain("x-sendfile");

    io.rewind();
    expect(io.read()).toBe('Unknown x-sendfile variation: "X-Banana"\n');
  });
});

it("sets x-sendfile response header and discards body", async () => {
  await request({}, sendfileBody(), [], "X-Sendfile", (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body.length === 0).toBeTruthy();
    expect(response.headers["content-length"]).toBe("0");
    expect(response.headers["x-sendfile"]).toBe(File.join(Dir.tmpdir(), "rack_sendfile"));
  });
});

it("closes body when x-sendfile used", async () => {
  const body = sendfileBody();
  let closed = false;
  body.close = () => {
    closed = true;
  };
  await request({}, body, [], "X-Sendfile", (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body.length === 0).toBeTruthy();
    expect(response.headers["content-length"]).toBe("0");
    expect(response.headers["x-sendfile"]).toBe(File.join(Dir.tmpdir(), "rack_sendfile"));
  });
  expect(closed).toBe(true);
});

it("sets x-lighttpd-send-file response header and discards body", async () => {
  await request({}, sendfileBody(), [], "X-Lighttpd-Send-File", (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body.length === 0).toBeTruthy();
    expect(response.headers["content-length"]).toBe("0");
    expect(response.headers["x-lighttpd-send-file"]).toBe(File.join(Dir.tmpdir(), "rack_sendfile"));
  });
});

it("sets x-accel-redirect response header and discards body", async () => {
  const headers = {
    HTTP_X_ACCEL_MAPPING: `${Dir.tmpdir()}/=/foo/bar/`,
  };
  await request(headers, sendfileBody(), [], "X-Accel-Redirect", (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body.length === 0).toBeTruthy();
    expect(response.headers["content-length"]).toBe("0");
    expect(response.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");
  });
});

it("does not do a regexp substitution on the internal path", async () => {
  let tmpdir = Dir.tmpdir();
  tmpdir = tmpdir.slice(0, 1) + ".*" + tmpdir.slice(3);
  const headers = {
    HTTP_X_ACCEL_MAPPING: `${tmpdir}/=/foo/bar/`,
  };
  const body = sendfileBody();
  const expected = escapePath(File.expandPath(body.toPath())).replaceAll("?", "%3F");
  await request(headers, body, [], "X-Accel-Redirect", (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body.length === 0).toBeTruthy();
    expect(response.headers["content-length"]).toBe("0");
    expect(response.headers["x-accel-redirect"]).toBe(expected);
  });
});

it("sets x-accel-redirect response header to percent-encoded path", async () => {
  const headers = {
    HTTP_X_ACCEL_MAPPING: `${Dir.tmpdir()}/=/foo/bar%/`,
  };
  await request(
    headers,
    sendfileBody("file_with_%_?_symbol"),
    [],
    "X-Accel-Redirect",
    (response) => {
      expect(response.isOk).toBeTruthy();
      expect(response.body.length === 0).toBeTruthy();
      expect(response.headers["content-length"]).toBe("0");
      expect(response.headers["x-accel-redirect"]).toBe("/foo/bar%25/file_with_%25_%3F_symbol");
    },
  );
});

it("writes to rack.error when no x-accel-mapping is specified", async () => {
  await request({}, sendfileBody(), [], "X-Accel-Redirect", (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body).toBe("Hello World");
    expect(Object.keys(response.headers)).not.toContain("x-accel-redirect");
    expect(response.errors).toContain("x-accel-mapping");
  });
});

it("does nothing when body does not respond to #to_path", async () => {
  await request({}, ["Not a file..."], [], "X-Sendfile", (response) => {
    expect(response.body).toBe("Not a file...");
    expect(Object.keys(response.headers)).not.toContain("x-sendfile");
  });
});

it("sets x-accel-redirect response header and discards body when initialized with multiple mappings", async () => {
  const dir1 = Dir.mktmpdir();
  const dir2 = Dir.mktmpdir();
  try {
    const firstBody = openFile(File.join(dir1, "rack_sendfile"));
    firstBody.puts("hello world");

    const secondBody = openFile(File.join(dir2, "rack_sendfile"));
    secondBody.puts("goodbye world");

    const mappings: [string, string][] = [
      [`${dir1}/`, "/foo/bar/"],
      [`${dir2}/`, "/wibble/"],
    ];

    await request({}, firstBody, mappings, "X-Accel-Redirect", (response) => {
      expect(response.isOk).toBeTruthy();
      expect(response.body.length === 0).toBeTruthy();
      expect(response.headers["content-length"]).toBe("0");
      expect(response.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");
    });

    await request({}, secondBody, mappings, "X-Accel-Redirect", (response) => {
      expect(response.isOk).toBeTruthy();
      expect(response.body.length === 0).toBeTruthy();
      expect(response.headers["content-length"]).toBe("0");
      expect(response.headers["x-accel-redirect"]).toBe("/wibble/rack_sendfile");
    });
  } finally {
    FileUtils.rmRf(dir1);
    FileUtils.rmRf(dir2);
  }
});

it("sets x-accel-redirect response header and discards body when initialized with multiple mappings via header", async () => {
  const dir1 = Dir.mktmpdir();
  const dir2 = Dir.mktmpdir();
  const dir3 = Dir.mktmpdir();
  try {
    const firstBody = openFile(File.join(dir1, "rack_sendfile"));
    firstBody.puts("hello world");

    const secondBody = openFile(File.join(dir2, "rack_sendfile"));
    secondBody.puts("goodbye world");

    const thirdBody = openFile(File.join(dir3, "rack_sendfile"));
    thirdBody.puts("hello again world");

    let app = new Lint(new Sendfile(simpleApp(firstBody), "X-Accel-Redirect", []));

    const headers = {
      HTTP_X_ACCEL_MAPPING: `${dir1}/=/foo/bar/, ${dir2}/=/wibble/`,
    };

    let response = await new MockRequest(app).get("/", headers);
    expect(response.isOk).toBeTruthy();
    expect(response.body.length === 0).toBeTruthy();
    expect(response.headers["content-length"]).toBe("0");
    expect(response.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");

    app = new Lint(new Sendfile(simpleApp(secondBody), "X-Accel-Redirect", []));
    response = await new MockRequest(app).get("/", headers);
    expect(response.isOk).toBeTruthy();
    expect(response.body.length === 0).toBeTruthy();
    expect(response.headers["content-length"]).toBe("0");
    expect(response.headers["x-accel-redirect"]).toBe("/wibble/rack_sendfile");

    app = new Lint(new Sendfile(simpleApp(thirdBody), "X-Accel-Redirect", []));
    response = await new MockRequest(app).get("/", headers);
    expect(response.isOk).toBeTruthy();
    expect(response.body.length === 0).toBeTruthy();
    expect(response.headers["content-length"]).toBe("0");
    expect(response.headers["x-accel-redirect"]).toBe(`${dir3}/rack_sendfile`);
  } finally {
    FileUtils.rmRf(dir1);
    FileUtils.rmRf(dir2);
    FileUtils.rmRf(dir3);
  }
});

describe("security: information disclosure prevention", () => {
  it("ignores HTTP_X_SENDFILE_TYPE header to prevent attacker-controlled sendfile activation", async () => {
    await request(
      { HTTP_X_SENDFILE_TYPE: "x-sendfile" },
      undefined,
      undefined,
      undefined,
      (response) => {
        expect(response.isOk).toBeTruthy();
        expect(response.body).toBe("Hello World");
        expect(Object.keys(response.headers)).not.toContain("x-sendfile");
      },
    );
  });

  it("ignores HTTP_X_SENDFILE_TYPE header attempting to enable x-accel-redirect", async () => {
    const headers = {
      HTTP_X_SENDFILE_TYPE: "x-accel-redirect",
      HTTP_X_ACCEL_MAPPING: `${Dir.tmpdir()}/=/attacker/path/`,
    };
    await request(headers, undefined, undefined, undefined, (response) => {
      expect(response.isOk).toBeTruthy();
      expect(response.body).toBe("Hello World");
      expect(Object.keys(response.headers)).not.toContain("x-accel-redirect");
    });
  });

  it("ignores HTTP_X_ACCEL_MAPPING when x-accel-redirect is not explicitly enabled", async () => {
    const headers = {
      HTTP_X_ACCEL_MAPPING: `${Dir.tmpdir()}/=/attacker/path/`,
    };
    await request(headers, undefined, undefined, undefined, (response) => {
      expect(response.isOk).toBeTruthy();
      expect(response.body).toBe("Hello World");
      expect(Object.keys(response.headers)).not.toContain("x-accel-redirect");
    });
  });

  it("ignores HTTP_X_ACCEL_MAPPING when application-level mappings are configured", async () => {
    const dir = Dir.mktmpdir();
    try {
      const body = openFile(File.join(dir, "rack_sendfile"));
      body.puts("test");

      const appMappings: [string, string][] = [[`${dir}/`, "/app/mapping/"]];
      const app = new Lint(new Sendfile(simpleApp(body), "X-Accel-Redirect", appMappings));

      const headers = {
        HTTP_X_ACCEL_MAPPING: `${dir}/=/attacker/path/`,
      };

      const response = await new MockRequest(app).get("/", headers);
      expect(response.isOk).toBeTruthy();
      expect(response.body.length === 0).toBeTruthy();
      expect(response.headers["x-accel-redirect"]).toBe("/app/mapping/rack_sendfile");
      expect(response.headers["x-accel-redirect"]).not.toBe("/attacker/path/rack_sendfile");
    } finally {
      FileUtils.rmRf(dir);
    }
  });

  it("allows HTTP_X_ACCEL_MAPPING only when x-accel-redirect explicitly enabled with no app mappings", async () => {
    const dir = Dir.mktmpdir();
    try {
      const body = openFile(File.join(dir, "rack_sendfile"));
      body.puts("test");

      const app = new Lint(new Sendfile(simpleApp(body), "X-Accel-Redirect", []));

      const headers = {
        HTTP_X_ACCEL_MAPPING: `${dir}/=/safe/nginx/mapping/`,
      };

      const response = await new MockRequest(app).get("/", headers);
      expect(response.isOk).toBeTruthy();
      expect(response.body.length === 0).toBeTruthy();
      expect(response.headers["x-accel-redirect"]).toBe("/safe/nginx/mapping/rack_sendfile");
    } finally {
      FileUtils.rmRf(dir);
    }
  });

  it("does not allow x-lighttpd-send-file activation via header", async () => {
    await request(
      { HTTP_X_SENDFILE_TYPE: "x-lighttpd-send-file" },
      undefined,
      undefined,
      undefined,
      (response) => {
        expect(response.isOk).toBeTruthy();
        expect(response.body).toBe("Hello World");
        expect(Object.keys(response.headers)).not.toContain("x-lighttpd-send-file");
      },
    );
  });

  it("requires explicit middleware configuration for any sendfile variation", async () => {
    const body = sendfileBody();
    const app = (_env: Record<string, any>) => [200, { "content-type": "text/plain" }, body] as any;
    const middleware = new Lint(new Sendfile(app));

    const env = MockRequest.envFor("/", { "sendfile.type": "x-sendfile" });
    const [status, headers] = await middleware.call(env);

    expect(status).toBe(200);
    expect(headers["x-sendfile"]).toBe(File.join(Dir.tmpdir(), "rack_sendfile"));
    expect(headers["content-length"]).toBe("0");
  });
});
