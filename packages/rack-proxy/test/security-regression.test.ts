import { Lint, MockRequest, type Headers } from "@blazetrails/rack";
import { EOFError, StringIO, Timeout } from "@blazetrails/ruby-compat";
import type { Socket } from "node:net";
import { describe, expect, it } from "vitest";

import { Proxy } from "../lib/index.js";
import { startServer, withRawBackend } from "./support/proxy-test-server.js";

type Triplet = [number, Headers, unknown];

class DeadlineExceeded extends Error {}

class NonRewindableInput extends StringIO {
  declare rewind: never;
  constructor(string: string) {
    super(string);
    Object.defineProperty(this, "rewind", { value: undefined });
  }
}

const call = async (proxy: { call(env: unknown): unknown }, env: unknown) =>
  (await proxy.call(env)) as Triplet;

async function consume(body: unknown): Promise<string> {
  const result: Uint8Array[] = [];
  const b = body as { each(f: (c: string | Uint8Array) => unknown): unknown; close?(): unknown };
  try {
    const push = (chunk: string | Uint8Array) =>
      result.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    if (Array.isArray(body)) body.forEach(push);
    else await b.each(push);
    return Buffer.concat(result).toString("latin1");
  } finally {
    if (typeof b.close === "function") await b.close();
  }
}

function readAll(socket: Socket): Promise<string> {
  const chunks: Buffer[] = [];
  socket.on("data", (c: Buffer) => chunks.push(c));
  socket.resume();
  return new Promise((resolve) =>
    socket.on("close", () => resolve(Buffer.concat(chunks).toString("latin1"))),
  );
}

async function withResponse(
  wire: string,
  options: Record<string, unknown>,
  block: (proxy: Proxy) => Promise<void>,
): Promise<void> {
  await withRawBackend(
    (socket) => socket.end(wire),
    (backend) => block(new Proxy({ backend, ...options })),
  );
}

describe("SecurityRegressionTest", () => {
  it("unknown length upload is reframed without losing the body", async () => {
    const [server, port] = await startServer();
    try {
      const payload = "GET /injected HTTP/1.1\r\nHost: internal\r\n\r\n";
      for (const streaming of [true, false]) {
        for (const encoding of [null, "chunked"]) {
          const proxy = new Proxy({ backend: `http://127.0.0.1:${port}`, streaming });
          const env = MockRequest.envFor("/echo-body", { ":method": "POST" });
          delete env["CONTENT_LENGTH"];
          env["CONTENT_TYPE"] = "text/plain";
          env["HTTP_TRANSFER_ENCODING"] = encoding;
          env["rack.input"] = new NonRewindableInput(payload);
          const [status, , body] = await call(proxy, env);
          expect(status).toBe(200);
          expect(await consume(body), "decoded input must remain the POST body").toBe(payload);
        }
      }
    } finally {
      await server.shutdown();
    }
  });

  it("content length bounds bytes written to backend", async () => {
    for (const streaming of [true, false]) {
      let received!: Promise<string>;
      const handler = (socket: Socket) => {
        received = new Promise((resolve) => {
          const chunks: Buffer[] = [];
          let timer: ReturnType<typeof setTimeout> | undefined;
          socket.on("data", (c: Buffer) => {
            chunks.push(c);
            timer ??= setTimeout(() => {
              resolve(Buffer.concat(chunks).toString("latin1"));
              socket.write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok");
            }, 20);
          });
          socket.resume();
        });
      };
      await withRawBackend(handler, async (backend) => {
        const env = MockRequest.envFor("/", { ":method": "POST" });
        env["CONTENT_LENGTH"] = "5";
        env["CONTENT_TYPE"] = "text/plain";
        env["rack.input"] = new StringIO("helloGET /injected HTTP/1.1\r\nHost: internal\r\n\r\n");
        const proxy = new Proxy({ backend, streaming });
        const [status, , body] = await call(proxy, env);
        expect(status).toBe(200);
        expect(await consume(body)).toBe("ok");
        expect(await received, "bytes after Content-Length must never reach the backend").toBe(
          "hello",
        );
      });
    }
  });

  it("invalid request lengths return 400", async () => {
    for (const streaming of [true, false]) {
      for (const length of ["-1", "5garbage", "5, 6", ""]) {
        const env = MockRequest.envFor("/", { ":method": "POST", ":input": "hello" });
        env["CONTENT_LENGTH"] = length;
        expect((await call(new Proxy({ streaming }), env))[0]).toBe(400);
      }
    }
  });

  it("short request body returns 400 and closes backend", async () => {
    for (const streaming of [true, false]) {
      await withRawBackend(readAll, async (backend) => {
        const env = MockRequest.envFor("/", { ":method": "POST", ":input": "hello" });
        env["CONTENT_LENGTH"] = "10";
        env["CONTENT_TYPE"] = "text/plain";
        const proxy = new Proxy({ backend, streaming });
        expect((await call(proxy, env))[0]).toBe(400);
      });
    }
  });

  it("ambiguous and unsupported response framing returns 502", async () => {
    const fields = [
      "Transfer-Encoding: chunked\r\nContent-Length: 1",
      "Transfer-Encoding: gzip, chunked",
      "Content-Length: 2\r\nContent-Length: 3",
      "Content-Length: 2, 3",
      "Content-Length: 2junk",
      "Content-Length: -1",
    ];
    for (const streaming of [true, false]) {
      for (const headers of fields) {
        await withResponse(
          `HTTP/1.1 200 OK\r\n${headers}\r\n\r\n`,
          { streaming },
          async (proxy) => {
            const [status, , body] = await call(proxy, MockRequest.envFor("/"));
            expect(status, headers).toBe(502);
            expect(await consume(body)).toBe("");
          },
        );
      }
    }
  });

  it("equal duplicate content lengths are normalized", async () => {
    for (const streaming of [true, false]) {
      await withResponse(
        "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Length: 2\r\n\r\nok",
        { streaming },
        async (proxy) => {
          const [status, headers, body] = await call(proxy, MockRequest.envFor("/"));
          expect(status).toBe(200);
          expect(headers.get("Content-Length")).toBe("2");
          expect(await consume(body)).toBe("ok");
        },
      );
    }
  });

  it("response connection tokens are removed across multiple fields", async () => {
    const wire =
      "HTTP/1.1 200 OK\r\nConnection: X-Internal\r\nConnection: close, X-Other\r\n" +
      "X-Internal: secret\r\nX-Other: secret\r\nX-End-To-End: public\r\nContent-Length: 2\r\n\r\nok";
    for (const streaming of [true, false]) {
      await withResponse(wire, { streaming }, async (proxy) => {
        const [, headers, body] = await call(proxy, MockRequest.envFor("/"));
        for (const key of ["Connection", "X-Internal", "X-Other"]) {
          expect(headers.get(key) ?? null).toBeNull();
        }
        expect(headers.get("X-End-To-End")).toBe("public");
        expect(await consume(body)).toBe("ok");
      });
    }
  });

  it("truncated content length response is never successful", async () => {
    for (const streaming of [true, false]) {
      await withResponse(
        "HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nhello",
        { streaming },
        async (proxy) => {
          const [status, , body] = await call(proxy, MockRequest.envFor("/"));

          if (streaming) {
            // eslint-disable-next-line vitest/no-conditional-expect -- mirrors security_regression_test.rb:132
            expect(status).toBe(200);
            // eslint-disable-next-line vitest/no-conditional-expect -- mirrors security_regression_test.rb:133
            await expect(consume(body)).rejects.toThrow(EOFError);
            const session = (body as { _session: { isStarted(): boolean } })._session;
            // eslint-disable-next-line vitest/no-conditional-expect -- mirrors security_regression_test.rb:134
            expect(!session.isStarted()).toBeTruthy();
          } else {
            // eslint-disable-next-line vitest/no-conditional-expect -- mirrors security_regression_test.rb:136
            expect(status).toBe(502);
            // eslint-disable-next-line vitest/no-conditional-expect -- mirrors security_regression_test.rb:137
            expect(await consume(body)).toBe("");
          }
        },
      );
    }
  });

  it("buffered response limit aborts before reading the whole body", async () => {
    for (const prefix of [
      "Content-Length: 100\r\n\r\n",
      "Connection: Content-Length\r\nContent-Length: 100\r\n\r\n",
      "Transfer-Encoding: chunked\r\n\r\nB\r\nhello world\r\n",
    ]) {
      const handler = (socket: Socket) => {
        socket.write(`HTTP/1.1 200 OK\r\n${prefix}`);
        void readAll(socket);
      };
      await withRawBackend(handler, async (backend) => {
        const proxy = new Proxy({ backend, streaming: false, maxResponseLength: 10 });
        await Timeout.timeout(2, DeadlineExceeded, null, async () => {
          expect((await call(proxy, MockRequest.envFor("/")))[0]).toBe(502);
        });
      });
    }
  });

  it("backend failure does not replay request in either mode", async () => {
    for (const streaming of [true, false]) {
      await withRawBackend(
        (socket) => socket.destroy(),
        async (backend) => {
          const proxy = new Proxy({ backend, streaming });
          await Timeout.timeout(2, DeadlineExceeded, null, async () => {
            expect((await call(proxy, MockRequest.envFor("/")))[0]).toBe(502);
          });
        },
      );
    }
  });

  it("rejected streaming response closes backend connection", async () => {
    for (const headers of [
      "Content-Length: 100",
      "Transfer-Encoding: chunked\r\nContent-Length: 1",
    ]) {
      let closed!: Promise<string>;
      const handler = (socket: Socket) => {
        socket.write(`HTTP/1.1 200 OK\r\n${headers}\r\n\r\n`);
        closed = readAll(socket);
      };
      await withRawBackend(handler, async (backend) => {
        const proxy = new Proxy({ backend, maxResponseLength: 10 });
        await Timeout.timeout(2, DeadlineExceeded, null, async () => {
          expect((await call(proxy, MockRequest.envFor("/")))[0]).toBe(502);
          expect(await closed, "rejecting headers must release the suspended stream's socket").toBe(
            "",
          );
        });
      });
    }
  });

  it("head response size limit does not limit representation size", async () => {
    for (const streaming of [true, false]) {
      await withResponse(
        "HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n",
        { streaming, maxResponseLength: 10 },
        async (proxy) => {
          const [status, headers, body] = await call(
            proxy,
            MockRequest.envFor("/", { ":method": "HEAD" }),
          );
          expect(status).toBe(200);
          expect(headers.get("Content-Length")).toBe("100");
          expect(await consume(body)).toBe("");
        },
      );
    }
  });

  it("responses pass rack lint in both modes", async () => {
    for (const streaming of [true, false]) {
      for (const code of [200, 204, 304]) {
        let wire =
          `HTTP/1.1 ${code} Test\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\n` +
          "Content-Type: text/plain\r\nContent-Length: 2\r\n\r\n";
        if (code === 200) wire += "ok";
        await withResponse(wire, { streaming }, async (proxy) => {
          const [status, headers, body] = await call(new Lint(proxy), MockRequest.envFor("/"));
          expect(status).toBe(code);
          expect(await consume(body)).toBe(code === 200 ? "ok" : "");
          const cookies = (headers.get("set-cookie") ?? headers.get("Set-Cookie")) as
            | string
            | string[];
          expect(Array.isArray(cookies) ? cookies : cookies.split("\n")).toEqual(["a=1", "b=2"]);
        });
      }
    }
  });
});
