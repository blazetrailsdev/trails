import { it, expect } from "vitest";
import { Dir, File, FileUtils, StringIO } from "@blazetrails/ruby-compat";
import { Sendfile } from "./sendfile.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";
import type { MockResponse } from "./mock-response.js";

function sendfileBody(filename = "rack_sendfile") {
  FileUtils.touch(File.join(Dir.tmpdir(), filename));
  const res: any = ["Hello World"];
  res.toPath = () => File.join(Dir.tmpdir(), filename);
  return res;
}

function simpleApp(body: any = sendfileBody()) {
  return (_env: Record<string, any>) => [200, { "content-type": "text/plain" }, body];
}

function sendfileApp(body: any, mappings: [string, string][] = []) {
  return new Lint(new Sendfile(simpleApp(body), null, mappings));
}

async function request(
  headers: Record<string, any> = {},
  body: any = sendfileBody(),
  mappings: [string, string][] = [],
  block: (response: MockResponse) => void,
) {
  block(await new MockRequest(sendfileApp(body, mappings)).get("/", headers));
}

function openFile(path: string) {
  return File.open(path, "wb+");
}

it("does nothing when no x-sendfile-type header present", async () => {
  await request(undefined, undefined, undefined, (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body).toBe("Hello World");
    expect(Object.keys(response.headers)).not.toContain("x-sendfile");
  });
});

it("does nothing and logs to rack.errors when incorrect x-sendfile-type header present", async () => {
  const io = new StringIO();
  await request(
    { HTTP_X_SENDFILE_TYPE: "X-Banana", "rack.errors": io },
    undefined,
    undefined,
    (response) => {
      expect(response.isOk).toBeTruthy();
      expect(response.body).toBe("Hello World");
      expect(Object.keys(response.headers)).not.toContain("x-sendfile");

      io.rewind();
      expect(io.read()).toBe('Unknown x-sendfile variation: "X-Banana"\n');
    },
  );
});

it("sets x-sendfile response header and discards body", async () => {
  await request({ HTTP_X_SENDFILE_TYPE: "x-sendfile" }, undefined, undefined, (response) => {
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
  await request({ HTTP_X_SENDFILE_TYPE: "x-sendfile" }, body, undefined, (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body.length === 0).toBeTruthy();
    expect(response.headers["content-length"]).toBe("0");
    expect(response.headers["x-sendfile"]).toBe(File.join(Dir.tmpdir(), "rack_sendfile"));
  });
  expect(closed).toBe(true);
});

it("sets x-lighttpd-send-file response header and discards body", async () => {
  await request(
    { HTTP_X_SENDFILE_TYPE: "x-lighttpd-send-file" },
    undefined,
    undefined,
    (response) => {
      expect(response.isOk).toBeTruthy();
      expect(response.body.length === 0).toBeTruthy();
      expect(response.headers["content-length"]).toBe("0");
      expect(response.headers["x-lighttpd-send-file"]).toBe(
        File.join(Dir.tmpdir(), "rack_sendfile"),
      );
    },
  );
});

it("sets x-accel-redirect response header and discards body", async () => {
  const headers = {
    HTTP_X_SENDFILE_TYPE: "x-accel-redirect",
    HTTP_X_ACCEL_MAPPING: `${Dir.tmpdir()}/=/foo/bar/`,
  };
  await request(headers, undefined, undefined, (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body.length === 0).toBeTruthy();
    expect(response.headers["content-length"]).toBe("0");
    expect(response.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");
  });
});

it("sets x-accel-redirect response header to percent-encoded path", async () => {
  const headers = {
    HTTP_X_SENDFILE_TYPE: "x-accel-redirect",
    HTTP_X_ACCEL_MAPPING: `${Dir.tmpdir()}/=/foo/bar%/`,
  };
  await request(headers, sendfileBody("file_with_%_?_symbol"), undefined, (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body.length === 0).toBeTruthy();
    expect(response.headers["content-length"]).toBe("0");
    expect(response.headers["x-accel-redirect"]).toBe("/foo/bar%25/file_with_%25_%3F_symbol");
  });
});

it("writes to rack.error when no x-accel-mapping is specified", async () => {
  await request({ HTTP_X_SENDFILE_TYPE: "x-accel-redirect" }, undefined, undefined, (response) => {
    expect(response.isOk).toBeTruthy();
    expect(response.body).toBe("Hello World");
    expect(Object.keys(response.headers)).not.toContain("x-accel-redirect");
    expect(response.errors).toContain("x-accel-mapping");
  });
});

it("does nothing when body does not respond to #to_path", async () => {
  await request(
    { HTTP_X_SENDFILE_TYPE: "x-sendfile" },
    ["Not a file..."],
    undefined,
    (response) => {
      expect(response.body).toBe("Not a file...");
      expect(Object.keys(response.headers)).not.toContain("x-sendfile");
    },
  );
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

    await request({ HTTP_X_SENDFILE_TYPE: "x-accel-redirect" }, firstBody, mappings, (response) => {
      expect(response.isOk).toBeTruthy();
      expect(response.body.length === 0).toBeTruthy();
      expect(response.headers["content-length"]).toBe("0");
      expect(response.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");
    });

    await request(
      { HTTP_X_SENDFILE_TYPE: "x-accel-redirect" },
      secondBody,
      mappings,
      (response) => {
        expect(response.isOk).toBeTruthy();
        expect(response.body.length === 0).toBeTruthy();
        expect(response.headers["content-length"]).toBe("0");
        expect(response.headers["x-accel-redirect"]).toBe("/wibble/rack_sendfile");
      },
    );
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

    const headers = {
      HTTP_X_SENDFILE_TYPE: "x-accel-redirect",
      HTTP_X_ACCEL_MAPPING: `${dir1}/=/foo/bar/, ${dir2}/=/wibble/`,
    };

    await request(headers, firstBody, undefined, (response) => {
      expect(response.isOk).toBeTruthy();
      expect(response.body.length === 0).toBeTruthy();
      expect(response.headers["content-length"]).toBe("0");
      expect(response.headers["x-accel-redirect"]).toBe("/foo/bar/rack_sendfile");
    });

    await request(headers, secondBody, undefined, (response) => {
      expect(response.isOk).toBeTruthy();
      expect(response.body.length === 0).toBeTruthy();
      expect(response.headers["content-length"]).toBe("0");
      expect(response.headers["x-accel-redirect"]).toBe("/wibble/rack_sendfile");
    });

    await request(headers, thirdBody, undefined, (response) => {
      expect(response.isOk).toBeTruthy();
      expect(response.body.length === 0).toBeTruthy();
      expect(response.headers["content-length"]).toBe("0");
      expect(response.headers["x-accel-redirect"]).toBe(`${dir3}/rack_sendfile`);
    });
  } finally {
    FileUtils.rmRf(dir1);
    FileUtils.rmRf(dir2);
  }
});
