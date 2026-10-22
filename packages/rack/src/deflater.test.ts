import { it, expect } from "vitest";
import { File, StringIO, Zlib } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import { Deflater } from "./deflater.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";

type Options = Record<string, any>;

function binary(bytes: Uint8Array): string {
  return bytes.reduce((str, byte) => str + String.fromCharCode(byte), "");
}

async function buildResponse(
  status: number,
  body: any,
  acceptEncoding: string,
  options: Options = {},
): Promise<[number, Record<string, any>, any]> {
  if (typeof body === "string") body = [body];
  const app = (_env: Record<string, any>) => {
    const res: [number, Record<string, any>, any] = [status, options.responseHeaders || {}, body];
    if (res[0] !== 304) res[1]["content-type"] = "text/plain";
    return res;
  };

  const request = MockRequest.envFor("", {
    ...(options.requestHeaders || {}),
    HTTP_ACCEPT_ENCODING: acceptEncoding,
  });
  const deflater = new Lint(new Deflater(app, options.deflaterOptions || {}));

  return deflater.call(request);
}

async function verify(
  expectedStatus: number,
  expectedBody: any,
  acceptEncoding: string | Record<string, string | null>,
  options: Options = {},
  block?: (status: number, headers: Record<string, any>, body: any) => unknown,
): Promise<void> {
  let expectedEncoding: string | null;
  if (typeof acceptEncoding === "object") {
    [acceptEncoding, expectedEncoding] = Object.entries(acceptEncoding)[0];
  } else {
    expectedEncoding = acceptEncoding;
  }

  const start = Math.floor(Date.now() / 1000);

  const [status, headers, body] = await buildResponse(
    options.appStatus || expectedStatus,
    options.appBody || expectedBody,
    acceptEncoding,
    options,
  );

  expect(status).toBe(expectedStatus);

  if (!options.skipBodyVerify) {
    let bodyText = "";
    await body.each(
      (part: string | Uint8Array) => (bodyText += typeof part === "string" ? part : binary(part)),
    );
    const bytes = Uint8Array.from(bodyText, (c) => c.charCodeAt(0));

    let deflatedBody: string;
    switch (expectedEncoding) {
      case "deflate": {
        const inflater = new Zlib.Inflate(-Zlib.MAX_WBITS);
        deflatedBody = binary(inflater.inflate(bytes)) + binary(inflater.finish());
        break;
      }
      case "gzip": {
        const io = new StringIO(bytes);
        const gz = new Zlib.GzipReader(io);
        const mtime = gz.mtime;
        const lastMod = headers["last-modified"];
        if (lastMod) {
          expect(Time.httpdate(lastMod).toI()).toBe(mtime);
        } else {
          expect(mtime).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
          expect(mtime).toBeGreaterThanOrEqual(start - 1);
        }
        const tmp = await gz.read();
        await gz.close();
        deflatedBody = tmp;
        break;
      }
      default:
        deflatedBody = bodyText;
    }

    expect(deflatedBody).toBe(expectedBody);
  }

  if (block) await block(status, headers, body);
  if (typeof body.close === "function") body.close();
}

function autoInflater() {
  return new Zlib.Inflate(32 + Zlib.MAX_WBITS);
}

function deflateOrGzip() {
  return { "deflate, gzip": "gzip" };
}

it("be able to deflate bodies that respond to each", async () => {
  const appBody = { each: (block: (part: string) => unknown) => [block("foo"), block("bar")] };

  await verify(200, "foobar", deflateOrGzip(), { appBody }, (_status, headers) => {
    expect(headers).toEqual({
      "content-encoding": "gzip",
      vary: "Accept-Encoding",
      "content-type": "text/plain",
    });
  });
});

it("should not update vary response header if it includes * or accept-encoding", async () => {
  await verify(
    200,
    "foobar",
    deflateOrGzip(),
    { responseHeaders: { vary: "Accept-Encoding" } },
    (_status, headers) => {
      expect(headers["vary"]).toBe("Accept-Encoding");
    },
  );
  await verify(
    200,
    "foobar",
    deflateOrGzip(),
    { responseHeaders: { vary: "*" } },
    (_status, headers) => {
      expect(headers["vary"]).toBe("*");
    },
  );
  await verify(
    200,
    "foobar",
    deflateOrGzip(),
    { responseHeaders: { vary: "Do-Not-Accept-Encoding" } },
    (_status, headers) => {
      expect(headers["vary"]).toBe("Do-Not-Accept-Encoding,Accept-Encoding");
    },
  );
});

it("be able to deflate bodies that respond to each and contain empty chunks", async () => {
  const appBody = { each: (b: (part: string) => unknown) => [b("foo"), b(""), b("bar")] };

  await verify(200, "foobar", deflateOrGzip(), { appBody }, (_status, headers) => {
    expect(headers).toEqual({
      "content-encoding": "gzip",
      vary: "Accept-Encoding",
      "content-type": "text/plain",
    });
  });
});

it("flush deflated chunks to the client as they become ready", async () => {
  const appBody = { each: (block: (part: string) => unknown) => [block("foo"), block("bar")] };

  await verify(
    200,
    appBody,
    deflateOrGzip(),
    { skipBodyVerify: true },
    async (_status, headers, body) => {
      expect(headers).toEqual({
        "content-encoding": "gzip",
        vary: "Accept-Encoding",
        "content-type": "text/plain",
      });

      const buf: string[] = [];
      const inflater = autoInflater();
      await body.each((part: Uint8Array) => buf.push(binary(inflater.inflate(part))));
      buf.push(binary(inflater.finish()));

      expect(buf.filter((part) => part.length !== 0).join("")).toBe("foobar");
    },
  );
});

it("does not raise when a client aborts reading", async () => {
  const appBody = { each: (block: (part: string) => unknown) => [block("foo"), block("bar")] };
  const opts = { skipBodyVerify: true };
  await verify(200, appBody, "gzip", opts, async (_status, headers, body) => {
    expect(headers).toEqual({
      "content-encoding": "gzip",
      vary: "Accept-Encoding",
      "content-type": "text/plain",
    });

    const buf: string[] = [];
    const inflater = autoInflater();
    const FakeDisconnect = class extends Error {};
    await expect(
      body.each((part: Uint8Array) => {
        const tmp = inflater.inflate(part);
        if (tmp.length > 0) buf.push(binary(tmp));
        throw new FakeDisconnect();
      }),
      "not Zlib::DataError not raised",
    ).rejects.toThrow(FakeDisconnect);
    inflater.finish();
    expect(buf).toEqual(["foo"]);
  });
});

it("be able to deflate String bodies", async () => {
  await verify(200, "Hello world!", deflateOrGzip(), {}, (_status, headers) => {
    expect(headers).toEqual({
      "content-encoding": "gzip",
      vary: "Accept-Encoding",
      "content-type": "text/plain",
    });
  });
});

it("be able to gzip bodies that respond to each", async () => {
  const appBody = { each: (block: (part: string) => unknown) => [block("foo"), block("bar")] };

  await verify(200, "foobar", "gzip", { appBody }, (_status, headers) => {
    expect(headers).toEqual({
      "content-encoding": "gzip",
      vary: "Accept-Encoding",
      "content-type": "text/plain",
    });
  });
});

it("be able to gzip files", async () => {
  await verify(
    200,
    binary(File.binread(__filename)),
    "gzip",
    { appBody: File.open(__filename) },
    (_status, headers) => {
      expect(headers).toEqual({
        "content-encoding": "gzip",
        vary: "Accept-Encoding",
        "content-type": "text/plain",
      });
    },
  );
});

it("flush gzipped chunks to the client as they become ready", async () => {
  const appBody = { each: (block: (part: string) => unknown) => [block("foo"), block("bar")] };

  await verify(200, appBody, "gzip", { skipBodyVerify: true }, async (_status, headers, body) => {
    expect(headers).toEqual({
      "content-encoding": "gzip",
      vary: "Accept-Encoding",
      "content-type": "text/plain",
    });

    const buf: string[] = [];
    const inflater = new Zlib.Inflate(Zlib.MAX_WBITS + 32);
    await body.each((part: Uint8Array) => buf.push(binary(inflater.inflate(part))));
    buf.push(binary(inflater.finish()));

    expect(buf.filter((part) => part.length !== 0).join("")).toBe("foobar");
  });
});

it("be able to fallback to no deflation", async () => {
  await verify(200, "Hello world!", "superzip", {}, (_status, headers) => {
    expect(headers).toEqual({
      vary: "Accept-Encoding",
      "content-type": "text/plain",
    });
  });
});

it("be able to skip when there is no response entity body", async () => {
  await verify(304, "", { gzip: null }, { appBody: [] }, (_status, headers) => {
    expect(headers).toEqual({});
  });
});

it("handle the lack of an acceptable encoding", async () => {
  const appBody = "Hello world!";
  const notFoundBody1 = "An acceptable encoding for the requested resource / could not be found.";
  const notFoundBody2 =
    "An acceptable encoding for the requested resource /foo/bar could not be found.";
  const options1 = {
    appStatus: 200,
    appBody: appBody,
    requestHeaders: {
      PATH_INFO: "/",
    },
  };
  const options2 = {
    appStatus: 200,
    appBody: appBody,
    requestHeaders: {
      PATH_INFO: "/foo/bar",
    },
  };

  const appBody3: any = [appBody];
  let closed = false;
  appBody3.close = () => {
    closed = true;
  };
  const options3 = {
    appStatus: 200,
    appBody: appBody3,
    requestHeaders: {
      PATH_INFO: "/",
    },
  };

  await verify(406, notFoundBody1, "identity;q=0", options1, (_status, headers) => {
    expect(headers).toEqual({
      "content-type": "text/plain",
      "content-length": String(notFoundBody1.length),
    });
  });

  await verify(406, notFoundBody2, "identity;q=0", options2, (_status, headers) => {
    expect(headers).toEqual({
      "content-type": "text/plain",
      "content-length": String(notFoundBody2.length),
    });
  });

  await verify(406, notFoundBody1, "identity;q=0", options3, (_status, headers) => {
    expect(headers).toEqual({
      "content-type": "text/plain",
      "content-length": String(notFoundBody1.length),
    });
  });
  expect(closed).toBe(true);
});

it("handle gzip response with last-modified header", async () => {
  const lastModified = Time.now().httpdate();
  const options = {
    responseHeaders: {
      "content-type": "text/plain",
      "last-modified": lastModified,
    },
  };

  await verify(200, "Hello World!", "gzip", options, (_status, headers) => {
    expect(headers).toEqual({
      "content-encoding": "gzip",
      vary: "Accept-Encoding",
      "last-modified": lastModified,
      "content-type": "text/plain",
    });
  });
});

it("do nothing when no-transform cache-control directive present", async () => {
  const options = {
    responseHeaders: {
      "content-type": "text/plain",
      "cache-control": "no-transform",
    },
  };
  await verify(200, "Hello World!", { gzip: null }, options, (_status, headers) => {
    expect(Object.keys(headers)).not.toContain("content-encoding");
  });
});

it("do nothing when content-encoding already present", async () => {
  const options = {
    responseHeaders: {
      "content-type": "text/plain",
      "content-encoding": "gzip",
    },
  };
  await verify(200, "Hello World!", { gzip: null }, options);
});

it("deflate when content-encoding is identity", async () => {
  const options = {
    responseHeaders: {
      "content-type": "text/plain",
      "content-encoding": "identity",
    },
  };
  await verify(200, "Hello World!", deflateOrGzip(), options);
});

it("deflate if content-type matches :include", async () => {
  const options = {
    responseHeaders: {
      "content-type": "text/plain",
    },
    deflaterOptions: {
      include: ["text/plain"],
    },
  };
  await verify(200, "Hello World!", "gzip", options);
});

it("deflate if content-type is included it :include", async () => {
  const options = {
    responseHeaders: {
      "content-type": "text/plain; charset=us-ascii",
    },
    deflaterOptions: {
      include: ["text/plain"],
    },
  };
  await verify(200, "Hello World!", "gzip", options);
});

it("not deflate if content-type is not set but given in :include", async () => {
  const options = {
    deflaterOptions: {
      include: ["text/plain"],
    },
  };
  await verify(304, "Hello World!", { gzip: null }, options);
});

it("not deflate if content-type do not match :include", async () => {
  const options = {
    responseHeaders: {
      "content-type": "text/plain",
    },
    deflaterOptions: {
      include: ["text/json"],
    },
  };
  await verify(200, "Hello World!", { gzip: null }, options);
});

it("not deflate if content-length is 0", async () => {
  const options = {
    responseHeaders: {
      "content-length": "0",
    },
  };
  await verify(200, "", { gzip: null }, options);
});

it("deflate response if :if lambda evaluates to true", async () => {
  const options = {
    deflaterOptions: {
      if: () => true,
    },
  };
  await verify(200, "Hello World!", deflateOrGzip(), options);
});

it("not deflate if :if lambda evaluates to false", async () => {
  const options = {
    deflaterOptions: {
      if: () => false,
    },
  };
  await verify(200, "Hello World!", { gzip: null }, options);
});

it("check for content-length via :if", async () => {
  const response = "Hello World!";
  const responseLen = response.length;
  const options = {
    responseHeaders: {
      "content-length": String(responseLen),
    },
    deflaterOptions: {
      if: (_env: any, _status: any, headers: any) =>
        (parseInt(headers["content-length"], 10) || 0) >= responseLen,
    },
  };

  await verify(200, response, "gzip", options);
});

it("will honor sync: false to avoid unnecessary flushing", async () => {
  const appBody = {
    each(block: (part: string) => void) {
      for (let i = 0; i <= 20; i++) block("hello\n");
    },
  };

  const options = {
    deflaterOptions: { sync: false },
    appBody: appBody,
    skipBodyVerify: true,
  };
  await verify(200, appBody, deflateOrGzip(), options, async (_status, headers, body) => {
    expect(headers).toEqual({
      "content-encoding": "gzip",
      vary: "Accept-Encoding",
      "content-type": "text/plain",
    });

    let buf = "";
    let rawBytes = 0;
    const inflater = autoInflater();
    await body.each((part: Uint8Array) => {
      rawBytes += part.length;
      buf += binary(inflater.inflate(part));
    });
    buf += binary(inflater.finish());
    const expected = "hello\n".repeat(21);
    expect(buf).toBe(expected);
    expect(rawBytes).toBeLessThan(expected.length);
  });
});

it("will honor sync: false to avoid unnecessary flushing when deflating files", async () => {
  const content = binary(File.binread(__filename));
  const options = {
    deflaterOptions: { sync: false },
    appBody: File.open(__filename),
    skipBodyVerify: true,
  };
  await verify(200, content, deflateOrGzip(), options, async (_status, headers, body) => {
    expect(headers).toEqual({
      "content-encoding": "gzip",
      vary: "Accept-Encoding",
      "content-type": "text/plain",
    });

    let buf = "";
    let rawBytes = 0;
    const inflater = autoInflater();
    await body.each((part: Uint8Array) => {
      rawBytes += part.length;
      buf += binary(inflater.inflate(part));
    });
    buf += binary(inflater.finish());
    expect(buf).toBe(content);
    expect(rawBytes).toBeLessThan(content.length);
  });
});

it("does not close the response body prematurely", async () => {
  const appBody = new (class {
    closed: boolean | undefined;
    each(block: (part: string) => void) {
      block("foo");
      block("bar");
    }
    close() {
      this.closed = true;
    }
  })();

  await verify(200, "foobar", deflateOrGzip(), { appBody }, () => {
    expect(appBody.closed).toBeUndefined();
  });
});
