import { it, expect } from "vitest";
import { Deflater } from "./deflater.js";
import { MockRequest } from "./mock-request.js";

function makeApp(
  body: any,
  status = 200,
  headers: Record<string, string> = { "content-type": "text/plain" },
) {
  return async (_env: any) => [status, { ...headers }, body] as [number, Record<string, any>, any];
}

function deflaterApp(
  body: any,
  opts: any = {},
  status = 200,
  headers: Record<string, string> = { "content-type": "text/plain" },
) {
  return new Deflater(makeApp(body, status, headers), opts);
}

async function getDeflated(app: any, encoding = "deflate, gzip") {
  return new MockRequest((env) => app.call(env)).get("/", { HTTP_ACCEPT_ENCODING: encoding });
}

it("be able to deflate bodies that respond to each", async () => {
  const body = {
    each(cb: any) {
      cb("Hello World");
    },
  };
  const app = deflaterApp(body);
  const res = await getDeflated(app);
  expect(res.status).toBe(200);
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("should not update vary response header if it includes * or accept-encoding", async () => {
  const app = new Deflater(makeApp(["test"], 200, { "content-type": "text/plain", vary: "*" }));
  const res = await getDeflated(app, "gzip");
  expect(res.headers["vary"]).toBe("*");
});

it("be able to deflate bodies that respond to each and contain empty chunks", async () => {
  const body = {
    each(cb: any) {
      cb("");
      cb("Hello");
      cb("");
    },
  };
  const app = deflaterApp(body);
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("flush deflated chunks to the client as they become ready", async () => {
  const app = deflaterApp(["chunk1", "chunk2"]);
  const res = await getDeflated(app);
  expect(res.status).toBe(200);
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("does not raise when a client aborts reading", async () => {
  const app = deflaterApp(["test"]);
  const res = await getDeflated(app);
  expect(res.status).toBe(200);
});

it("be able to deflate String bodies", async () => {
  const app = deflaterApp(["Hello World"]);
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("be able to gzip bodies that respond to each", async () => {
  const body = {
    each(cb: any) {
      cb("Hello World");
    },
  };
  const app = deflaterApp(body);
  const res = await getDeflated(app, "gzip");
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("be able to gzip files", async () => {
  const app = deflaterApp(["file content"]);
  const res = await getDeflated(app, "gzip");
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("flush gzipped chunks to the client as they become ready", async () => {
  const app = deflaterApp(["chunk1", "chunk2"]);
  const res = await getDeflated(app, "gzip");
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("be able to fallback to no deflation", async () => {
  const app = deflaterApp(["Hello world!"]);
  const res = await getDeflated(app, "superzip");
  expect(res.headers["content-encoding"]).toBeUndefined();
  expect(res.headers["vary"]).toBe("Accept-Encoding");
  expect(res.bodyString).toBe("Hello world!");
});

it("be able to skip when there is no response entity body", async () => {
  const app = new Deflater(makeApp([], 204, {}));
  const res = await getDeflated(app);
  expect(res.status).toBe(204);
  expect(res.headers["content-encoding"]).toBeUndefined();
});

it("handle the lack of an acceptable encoding", async () => {
  const notFoundBody1 = "An acceptable encoding for the requested resource / could not be found.";
  const notFoundBody2 =
    "An acceptable encoding for the requested resource /foo/bar could not be found.";

  const res1 = await getDeflated(deflaterApp(["Hello world!"]), "identity;q=0");
  expect(res1.status).toBe(406);
  expect(res1.headers["content-type"]).toBe("text/plain");
  expect(res1.headers["content-length"]).toBe(String(notFoundBody1.length));
  expect(res1.bodyString).toBe(notFoundBody1);

  const res2 = await new MockRequest((env) => deflaterApp(["Hello world!"]).call(env)).get(
    "/foo/bar",
    { HTTP_ACCEPT_ENCODING: "identity;q=0" },
  );
  expect(res2.status).toBe(406);
  expect(res2.bodyString).toBe(notFoundBody2);

  let closed = false;
  const body3 = ["Hello world!"] as any;
  body3.close = () => {
    closed = true;
  };
  const res3 = await getDeflated(deflaterApp(body3), "identity;q=0");
  expect(res3.status).toBe(406);
  res3.body.close?.();
  expect(closed).toBe(true);
});

it("handle gzip response with last-modified header", async () => {
  const app = new Deflater(
    makeApp(["test"], 200, {
      "content-type": "text/plain",
      "last-modified": "Thu, 01 Jan 2025 00:00:00 GMT",
    }),
  );
  const res = await getDeflated(app, "gzip");
  expect(res.headers["content-encoding"]).toBe("gzip");
  expect(res.headers["last-modified"]).toBe("Thu, 01 Jan 2025 00:00:00 GMT");
});

it("do nothing when no-transform cache-control directive present", async () => {
  const app = new Deflater(
    makeApp(["Hello"], 200, { "content-type": "text/plain", "cache-control": "no-transform" }),
  );
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBeUndefined();
  expect(res.bodyString).toBe("Hello");
});

it("do nothing when content-encoding already present", async () => {
  const app = new Deflater(
    makeApp(["Hello"], 200, { "content-type": "text/plain", "content-encoding": "br" }),
  );
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBe("br");
});

it("deflate when content-encoding is identity", async () => {
  const app = new Deflater(
    makeApp(["Hello"], 200, { "content-type": "text/plain", "content-encoding": "identity" }),
  );
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("deflate if content-type matches :include", async () => {
  const app = deflaterApp(["Hello"], { include: ["text/plain"] });
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("deflate if content-type is included it :include", async () => {
  const app = deflaterApp(["Hello"], { include: ["text/plain", "text/html"] });
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("not deflate if content-type is not set but given in :include", async () => {
  const app = new Deflater(makeApp(["Hello"], 200, {}), { include: ["text/plain"] });
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBeUndefined();
});

it("not deflate if content-type do not match :include", async () => {
  const app = deflaterApp(["Hello"], { include: ["text/html"] });
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBeUndefined();
});

it("not deflate if content-length is 0", async () => {
  const app = new Deflater(
    makeApp([""], 200, { "content-type": "text/plain", "content-length": "0" }),
  );
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBeUndefined();
});

it("deflate response if :if lambda evaluates to true", async () => {
  const app = deflaterApp(["Hello"], { if: () => true });
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("not deflate if :if lambda evaluates to false", async () => {
  const app = deflaterApp(["Hello"], { if: () => false });
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBeUndefined();
});

it("check for content-length via :if", async () => {
  const app = deflaterApp(["Hello World"], {
    if: (_env: any, _s: any, headers: any) => {
      const cl = parseInt(headers["content-length"] || "0");
      return cl > 5;
    },
  });
  const res = await getDeflated(app);
  expect(res.status).toBe(200);
});

it("will honor sync: false to avoid unnecessary flushing", async () => {
  const app = deflaterApp(["Hello"], { sync: false });
  const res = await getDeflated(app);
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("will honor sync: false to avoid unnecessary flushing when deflating files", async () => {
  const app = deflaterApp(["file data"], { sync: false });
  const res = await getDeflated(app, "gzip");
  expect(res.headers["content-encoding"]).toBe("gzip");
});

it("does not close the response body prematurely", async () => {
  let closed = false;
  const body = {
    each(cb: any) {
      cb("test");
    },
    close() {
      closed = true;
    },
  };
  const app = deflaterApp(body);
  const [, , out] = await app.call(
    MockRequest.envFor("/", { HTTP_ACCEPT_ENCODING: "deflate, gzip" }),
  );
  await out.each(() => {});
  expect(closed).toBe(false);
  out.close();
  expect(closed).toBe(true);
});
