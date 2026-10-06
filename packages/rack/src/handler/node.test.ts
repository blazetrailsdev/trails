import { describe, it, expect } from "vitest";
import { connect, type Socket } from "node:net";
import type { HttpRequest, HttpResponse, HttpSocket, StringIO } from "@blazetrails/ruby-compat";
import { bodyFromString } from "../index.js";
import type { RackApp, RackBody, RackEnv } from "../index.js";
import { RACK_ERRORS, RACK_HIJACK, RACK_INPUT, RACK_IS_HIJACK } from "../constants.js";
import { Lint } from "../lint.js";
import { Node } from "./node.js";

async function serving(app: RackApp, body: (url: string) => Promise<void>): Promise<void> {
  const server = await Node.run(app, { Port: 0, Host: "127.0.0.1" });
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  try {
    await body(`http://127.0.0.1:${port}`);
  } finally {
    await Node.shutdown();
  }
}

async function envFor(path: string, init?: RequestInit): Promise<RackEnv> {
  let env: RackEnv = {};
  await serving(
    async (e) => {
      env = e;
      return [200, {}, bodyFromString("")];
    },
    async (url) => void (await fetch(`${url}${path}`, init)),
  );
  return env;
}

async function mockReq(req: Partial<HttpRequest>): Promise<HttpRequest> {
  const listeners: Record<string, ((...args: never[]) => void)[]> = {};
  const built = {
    method: "GET",
    url: "/",
    httpVersion: "1.1",
    headers: { host: "localhost:3000" },
    socket: { remoteAddress: "127.0.0.1" },
    on(event: string, listener: (...args: never[]) => void) {
      (listeners[event] ??= []).push(listener);
      return built;
    },
    destroy() {},
    ...req,
  } as unknown as HttpRequest;
  setTimeout(() => {
    for (const listener of listeners["end"] ?? []) (listener as () => void)();
  }, 0);
  return built;
}

async function metaVars(req: Partial<HttpRequest>): Promise<RackEnv> {
  const app: RackApp = async () => [200, {}, bodyFromString("")];
  return new Node(app).metaVars(await mockReq(req));
}

describe("Rack::Handler::Node", () => {
  it("builds a Rack env from a basic GET request", async () => {
    const env = await envFor("/users?page=2");

    expect(env.REQUEST_METHOD).toBe("GET");
    expect(env.PATH_INFO).toBe("/users");
    expect(env.QUERY_STRING).toBe("page=2");
    expect(env.HTTP_HOST).toBe(env.SERVER_NAME + ":" + env.SERVER_PORT);
    expect(env["rack.url_scheme"]).toBe("http");
    expect(env.GATEWAY_INTERFACE).toBe("CGI/1.1");
    expect(env.SCRIPT_NAME).toBe("");
    expect(env.REQUEST_URI).toBe(`http://${env.HTTP_HOST as string}/users?page=2`);
    expect(env.REQUEST_PATH).toBe("/users");
    expect(env.SERVER_PROTOCOL).toBe("HTTP/1.1");
    expect(env.REMOTE_ADDR).toBe("127.0.0.1");
    expect(env.REMOTE_HOST).toBe("127.0.0.1");
    expect(env).not.toHaveProperty("REMOTE_USER");
  });

  it("reads request body", async () => {
    const env = await envFor("/users", { method: "POST", body: '{"name":"dean"}' });

    expect(env.REQUEST_METHOD).toBe("POST");
    const input = env["rack.input"] as StringIO;
    expect(typeof input.read).toBe("function");
    expect(input.read()).toBe('{"name":"dean"}');
  });

  it("reads a binary request body byte-identically", async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89,
    ]);
    const env = await envFor("/upload", {
      method: "POST",
      body: png,
      headers: { "content-type": "application/octet-stream" },
    });

    const input = env["rack.input"] as StringIO;
    expect(input.size()).toBe(png.length);
    const read = input.read();
    expect(Array.from(read, (c) => c.charCodeAt(0))).toEqual(Array.from(png));
  });

  it("maps content-type and content-length to CGI keys", async () => {
    const env = await envFor("/", {
      method: "POST",
      body: "a=1",
      headers: { "content-type": "application/json" },
    });

    expect(env.CONTENT_TYPE).toBe("application/json");
    expect(env.CONTENT_LENGTH).toBe("3");
    expect(env).not.toHaveProperty("HTTP_CONTENT_TYPE");
    expect(env).not.toHaveProperty("HTTP_CONTENT_LENGTH");
  });

  it("maps other headers to HTTP_ prefixed keys", async () => {
    const env = await envFor("/", { headers: { "x-request-id": "abc-123", accept: "text/html" } });

    expect(env.HTTP_X_REQUEST_ID).toBe("abc-123");
    expect(env.HTTP_ACCEPT).toBe("text/html");
  });

  it("normalizes array header values to comma-separated strings", async () => {
    const env = await metaVars({ headers: { host: "x", "set-cookie": ["a=1", "b=2"] } });

    expect(env.HTTP_SET_COOKIE).toBe("a=1, b=2");
  });

  it("skips undefined header values", async () => {
    const env = await metaVars({ headers: { host: "x", "x-undefined": undefined } });

    expect(env).not.toHaveProperty("HTTP_X_UNDEFINED");
  });

  it("sets rack.url_scheme to https for TLS sockets", async () => {
    const env = await metaVars({ socket: { remoteAddress: "127.0.0.1", encrypted: true } });

    expect(env.HTTPS).toBe("on");
    expect(env.REQUEST_URI).toBe("https://localhost:3000/");
  });

  it("collapses leading slashes rather than reading an authority", async () => {
    const env = await metaVars({ url: "//evil.example/x" });

    expect(env.REQUEST_URI).toBe("http://localhost:3000/evil.example/x");
    expect(env.PATH_INFO).toBe("/evil.example/x");
  });

  it("skips rack. headers and keeps set-cookie repeatable", async () => {
    const headers = {
      "rack.protocol": "websocket",
      "set-cookie": ["a=1", "b=2"],
      vary: ["accept", "origin"],
    } as unknown as Record<string, string>;

    await serving(
      async () => [200, headers, bodyFromString("")],
      async (url) => {
        const response = await fetch(url);

        expect(response.headers.get("rack.protocol")).toBeNull();
        expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
        expect(response.headers.get("vary")).toBe("accept, origin");
      },
    );
  });

  it("keeps the raw path request_uri carries", async () => {
    const env = await envFor("/a%20b/c");

    expect(env.PATH_INFO).toBe("/a%20b/c");
    expect(env.REQUEST_PATH).toBe("/a%20b/c");
    expect(env.REQUEST_URI).toBe(`http://${env.HTTP_HOST as string}/a%20b/c`);
  });

  it("closes the body when the response cannot be written", async () => {
    let closed = false;
    const body = {
      async *[Symbol.asyncIterator]() {
        yield "never";
      },
      async return() {
        closed = true;
        return { done: true as const, value: undefined };
      },
    };
    const app: RackApp = async () => [200, {}, body as unknown as RackBody];
    const boom = new Error("headers already sent");
    const res = {
      writeHead() {
        throw boom;
      },
      write() {},
      end() {},
    };

    await expect(
      new Node(app).service(await mockReq({}), res as unknown as HttpResponse),
    ).rejects.toThrow(boom);
    expect(closed).toBe(true);
  });

  it("streams a multi-chunk body", async () => {
    const app: RackApp = async () => [
      201,
      { "content-type": "text/plain" },
      (async function* () {
        yield "one";
        yield "two";
      })(),
    ];

    await serving(app, async (url) => {
      const response = await fetch(url);

      expect(response.status).toBe(201);
      expect(response.headers.get("content-type")).toBe("text/plain");
      expect(await response.text()).toBe("onetwo");
    });
  });

  describe("upgrade requests", () => {
    it("offers the app a callable rack.hijack that Rack::Lint accepts", async () => {
      let env: RackEnv = {};
      let lintError: unknown = null;
      const linted = new Lint(async (e) => {
        env = { ...e };
        return [200, { "content-type": "text/plain", "content-length": "0" }, bodyFromString("")];
      });
      await serving(
        async (e) => {
          try {
            return await linted.call({ ...e, [RACK_ERRORS]: lintableErrors });
          } catch (error) {
            lintError = error;
            return [500, {}, bodyFromString("")];
          }
        },
        async (url) => void (await upgradeRequest(url, "/cable")),
      );

      expect(lintError).toBeNull();
      expect(env[RACK_IS_HIJACK]).toBe(true);
      expect(typeof env[RACK_HIJACK]).toBe("function");
      expect((env[RACK_INPUT] as StringIO).read()).toBe("");
      expect(env.PATH_INFO).toBe("/cable");
      expect(env.HTTP_UPGRADE).toBe("websocket");
      expect(lintError).toBeNull();
    });

    it("hands over the socket and writes nothing itself", async () => {
      const reply = await new Promise<string>((resolve, reject) => {
        serving(
          async (env) => {
            const io = (env[RACK_HIJACK] as () => HttpSocket)();
            io.on("data", (chunk) => {
              io.write(`echo:${Buffer.from(chunk).toString()}`);
              io.end();
            });
            return [-1, {}, bodyFromString("")];
          },
          async (url) => {
            const { text } = await upgradeRequest(url, "/cable", "after-handshake");
            resolve(text);
          },
        ).catch(reject);
      });

      expect(reply).toBe("echo:after-handshake");
    });

    it("delivers bytes pipelined with the handshake to the hijacked socket", async () => {
      const reply = await new Promise<string>((resolve, reject) => {
        serving(
          async (env) => {
            const io = (env[RACK_HIJACK] as () => HttpSocket)();
            io.on("data", (chunk) => {
              io.write(`head:${Buffer.from(chunk).toString()}`);
              io.end();
            });
            return [-1, {}, bodyFromString("")];
          },
          async (url) => {
            const { text } = await upgradeRequest(url, "/cable", "", "first-frame");
            resolve(text);
          },
        ).catch(reject);
      });

      expect(reply).toBe("head:first-frame");
    });

    it("answers an upgrade the app does not hijack and closes the socket", async () => {
      let text = "";
      let closed = false;
      await serving(
        async () => [404, { "content-type": "text/plain" }, bodyFromString("Page not found")],
        async (url) => {
          ({ text, closed } = await upgradeRequest(url, "/cable"));
        },
      );

      expect(text.startsWith("HTTP/1.1 404 Not Found\r\n")).toBe(true);
      expect(text).toContain("content-type: text/plain\r\n");
      expect(text).toContain("connection: close\r\n");
      expect(text.endsWith("\r\n\r\nPage not found")).toBe(true);
      expect(closed).toBe(true);
    });

    it("writes the status and headers, then hands the stream to a rack.hijack response header", async () => {
      let bodyRead = false;
      const ignored: RackBody = {
        async *[Symbol.asyncIterator]() {
          bodyRead = true;
          yield "never written";
        },
      };
      let text = "";
      await serving(
        async () => [
          200,
          {
            "content-type": "text/event-stream",
            "rack.hijack": ((stream: HttpSocket) => {
              stream.write("data: one\n\n");
              stream.end();
            }) as unknown as string,
          },
          ignored,
        ],
        async (url) => {
          ({ text } = await upgradeRequest(url, "/stream"));
        },
      );

      expect(text.startsWith("HTTP/1.1 200 OK\r\n")).toBe(true);
      expect(text).toContain("content-type: text/event-stream\r\n");
      expect(text).not.toContain("rack.hijack");
      expect(text.endsWith("\r\n\r\ndata: one\n\n")).toBe(true);
      expect(bodyRead).toBe(false);
    });

    it("keeps the app's own connection header on an upgrade it answers", async () => {
      let text = "";
      await serving(
        async () => [101, { connection: "Upgrade", upgrade: "websocket" }, bodyFromString("")],
        async (url) => {
          ({ text } = await upgradeRequest(url, "/cable"));
        },
      );

      expect(text.startsWith("HTTP/1.1 101 Switching Protocols\r\n")).toBe(true);
      expect(text).toContain("connection: Upgrade\r\n");
      expect(text).not.toContain("connection: close");
    });

    it("answers 500 and closes the socket when the app raises before hijacking", async () => {
      let text = "";
      let closed = false;
      await serving(
        async () => {
          throw new Error("boom");
        },
        async (url) => {
          ({ text, closed } = await upgradeRequest(url, "/cable"));
        },
      );

      expect(text.startsWith("HTTP/1.1 500 Internal Server Error\r\n")).toBe(true);
      expect(closed).toBe(true);
    });

    it("destroys the socket, without a second head, when the body raises mid-response", async () => {
      let text = "";
      let closed = false;
      await serving(
        async () => [
          200,
          {},
          {
            async *[Symbol.asyncIterator]() {
              yield "first";
              throw new Error("boom");
            },
          },
        ],
        async (url) => {
          ({ text, closed } = await upgradeRequest(url, "/cable"));
        },
      );

      expect(text.match(/HTTP\/1\.1/g)).toHaveLength(1);
      expect(text).not.toContain("500");
      expect(closed).toBe(true);
    });

    it("reports an error raised after a hijack and leaves the socket to the app", async () => {
      const rejections: unknown[] = [];
      const onRejection = (reason: unknown): void => void rejections.push(reason);
      process.on("unhandledRejection", onRejection);
      let text = "";
      try {
        await serving(
          async (env) => {
            const io = (env[RACK_HIJACK] as () => HttpSocket)();
            setTimeout(() => {
              io.write("still mine");
              io.end();
            }, 30);
            throw new Error("after hijack");
          },
          async (url) => {
            ({ text } = await upgradeRequest(url, "/cable"));
          },
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
      } finally {
        process.off("unhandledRejection", onRejection);
      }

      expect(text).toBe("still mine");
      expect(rejections).toEqual([]);
    });

    it("stops writing the response once the app hijacks from inside the body", async () => {
      let text = "";
      await serving(
        async (env) => [
          200,
          {},
          {
            async *[Symbol.asyncIterator]() {
              yield "first";
              const io = (env[RACK_HIJACK] as () => HttpSocket)();
              io.end();
              yield "second";
            },
          },
        ],
        async (url) => {
          ({ text } = await upgradeRequest(url, "/cable"));
        },
      );

      expect(text.endsWith("first")).toBe(true);
      expect(text).not.toContain("second");
    });

    it("leaves rack.hijack? false and rack.hijack unset on an ordinary request", async () => {
      const env = await envFor("/users");

      expect(env[RACK_IS_HIJACK]).toBe(false);
      expect(env[RACK_HIJACK]).toBeUndefined();
    });

    it("closes a socket it still owns on shutdown, and waits for the app to close one it hijacked", async () => {
      let hijackedIo: HttpSocket | null = null;
      const server = await Node.run(
        async (env) => {
          if (env.PATH_INFO === "/taken") {
            hijackedIo = (env[RACK_HIJACK] as () => HttpSocket)();
            return [-1, {}, bodyFromString("")];
          }
          await new Promise(() => {});
          return [200, {}, bodyFromString("")];
        },
        { Port: 0, Host: "127.0.0.1" },
      );
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      const taken = await openUpgrade(port, "/taken");
      const pending = await openUpgrade(port, "/pending");
      const pendingClosed = new Promise<void>((resolve) => pending.on("close", () => resolve()));
      await new Promise((resolve) => setTimeout(resolve, 50));

      let stopped = false;
      const shutdown = Node.shutdown().then(() => {
        stopped = true;
      });
      await pendingClosed;
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(pending.destroyed).toBe(true);
      expect(taken.destroyed).toBe(false);
      expect(stopped).toBe(false);

      hijackedIo!.destroy();
      await shutdown;
      expect(stopped).toBe(true);
    });
  });
});

const lintableErrors = { puts() {}, write() {}, flush() {} };

function openUpgrade(port: number, path: string, pipelined = ""): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
          `Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n${pipelined}`,
      );
      resolve(socket);
    });
    socket.on("error", reject);
  });
}

async function upgradeRequest(
  url: string,
  path: string,
  afterHandshake = "",
  pipelined = "",
): Promise<{ text: string; closed: boolean }> {
  const socket = await openUpgrade(Number(new URL(url).port), path, pipelined);
  if (afterHandshake !== "") {
    await new Promise((resolve) => setTimeout(resolve, 50));
    socket.write(afterHandshake);
  }
  return new Promise((resolve) => {
    let text = "";
    socket.on("data", (chunk) => {
      text += chunk.toString();
    });
    socket.on("close", () => resolve({ text, closed: true }));
  });
}
