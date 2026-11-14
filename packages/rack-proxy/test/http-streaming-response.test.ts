import { createServer as createNetServer, type Server as NetServer } from "node:net";
import { gunzipSync } from "node:zlib";
import { EOFError, IOError, Net, StringIO, Thread } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";

import { HttpStreamingResponse } from "../lib/index.js";
import { GZIP_PLAINTEXT, startServer, type TestServer } from "./support/proxy-test-server.js";

type NetHTTP = InstanceType<typeof Net.HTTP>;

const decoder = new TextDecoder();
const BREAK = Symbol("break");

function sessionOf(response: HttpStreamingResponse): NetHTTP | null {
  return (response as unknown as { _session: NetHTTP | null })._session;
}

async function rawBackend(chunks: string[]): Promise<[NetServer, number]> {
  const server = createNetServer((client) => {
    let head = "";
    client.on("data", (d) => {
      head += String(d);
      if (!head.includes("\r\n\r\n")) return;
      for (const c of chunks) client.write(c);
      client.end();
    });
    client.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return [server, (server.address() as { port: number }).port];
}

describe("HttpStreamingResponseTest", () => {
  let server: TestServer;
  let response: HttpStreamingResponse;

  beforeEach(async () => {
    let port: number;
    [server, port] = await startServer();
    const req = new Net.HTTP.Get("/");
    response = new HttpStreamingResponse(req, "127.0.0.1", port);
    response.useSsl = false;
  });

  afterEach(async () => {
    await server?.shutdown();
  });

  it("streaming", async () => {
    expect(await response.status()).toBe(200);
    expect(await response.status()).toBe(200);

    const headers = await response.headers();

    expect(headers.size > 0).toBeTruthy();

    expect((headers.get("content-type") as unknown as string[])[0].toLowerCase()).toMatch(
      /text\/html/,
    );
    expect(headers.get("content-type")).toEqual(headers.get("CoNtEnT-TyPe"));

    const chunks: unknown[] = [];
    await response.body.each((chunk) => {
      chunks.push(chunk);
    });

    expect(chunks.length > 0).toBeTruthy();
    for (const chunk of chunks) {
      expect(chunk instanceof Uint8Array).toBeTruthy();
    }
  });

  it("to s", async () => {
    const bodyString = await response.body.toS();
    expect(bodyString.length > 0).toBeTruthy();
    const contentLength = (await response.headers()).get("Content-Length") as unknown as
      | string[]
      | null;
    expect(contentLength == null ? bodyString.length : Number(contentLength[0])).toBe(
      bodyString.length,
    );
  });

  it("to s called twice", async () => {
    const body = response.body;
    expect(await body.toS()).toEqual(await body.toS());
  });

  it("body responds to close", () => {
    expect(typeof response.body.close === "function").toBeTruthy();
  });

  it("close without reading opens no connection", async () => {
    const req = new Net.HTTP.Get("/");
    const response = new HttpStreamingResponse(req, "127.0.0.1", server.port);
    response.useSsl = false;
    await expect(response.close()).resolves.not.toThrow();
    expect(sessionOf(response)).toBeNull();
  });

  it("close releases connection after reading", async () => {
    await response.body.each(() => {});
    const session = sessionOf(response);
    expect(session).not.toBeNull();
    expect(!session!.isStarted()).toBeTruthy();
    await expect(response.close()).resolves.not.toThrow();
  });

  it("close after reading headers releases connection", async () => {
    expect(await response.status()).toBe(200);
    await expect(response.close()).resolves.not.toThrow();

    const session = sessionOf(response);
    expect(session).not.toBeNull();
    expect(!session!.isStarted()).toBeTruthy();

    const chunks: Uint8Array[] = [];
    await response.body.each((chunk) => chunks.push(chunk));
    expect(chunks).toBeEmpty();
  });

  it("early break mid stream closes connection", async () => {
    let yielded = 0;
    await response.body
      .each(() => {
        yielded += 1;
        throw BREAK;
      })
      .catch((e: unknown) => {
        if (e !== BREAK) throw e;
      });

    expect(yielded).toBe(1);
    const session = sessionOf(response);
    expect(session).not.toBeNull();
    expect(!session!.isStarted()).toBeTruthy();
    await expect(response.close()).resolves.not.toThrow();
  });

  it("code after close raises without dialing", async () => {
    const req = new Net.HTTP.Get("/");
    const response = new HttpStreamingResponse(req, "127.0.0.1", server.port);
    response.useSsl = false;

    await response.close();
    await expect(response.status()).rejects.toThrow(IOError);
    expect(sessionOf(response)).toBeNull();
  });

  it("204 releases connection at code", async () => {
    const req = new Net.HTTP.Get("/no-content");
    const response = new HttpStreamingResponse(req, "127.0.0.1", server.port);
    response.useSsl = false;

    expect(await response.status()).toBe(204);
    const session = sessionOf(response);
    expect(session).not.toBeNull();
    expect(!session!.isStarted()).toBeTruthy();
    expect((await response.headers()).size > 0).toBeTruthy();
  });

  it("gzip body passes through verbatim without configure block", async () => {
    const req = new Net.HTTP.Get("/gzip");
    const response = new HttpStreamingResponse(req, "127.0.0.1", server.port);
    response.useSsl = false;

    expect(await response.status()).toBe(200);
    const body = new StringIO<Uint8Array>(new Uint8Array(0));
    await response.body.each((chunk) => body.append(chunk));
    expect(Array.from(body.string().slice(0, 2))).toEqual([0x1f, 0x8b]);
    const inflated = gunzipSync(body.string());
    expect(decoder.decode(inflated)).toBe(GZIP_PLAINTEXT);
  });

  it("configure block cannot reenable retries", async () => {
    const req = new Net.HTTP.Get("/");
    const response = new HttpStreamingResponse(req, "127.0.0.1", server.port, (http) => {
      http.maxRetries = 2;
    });

    expect(await response.status()).toBe(200);
    expect(sessionOf(response)!.maxRetries).toBe(0);
  });

  it("close from another thread releases connection", async () => {
    expect(await response.status()).toBe(200);

    await new Thread(() => response.close()).join();

    const session = sessionOf(response);
    expect(session).not.toBeNull();
    expect(!session!.isStarted()).toBeTruthy();

    const chunks: Uint8Array[] = [];
    await response.body.each((chunk) => chunks.push(chunk));
    expect(chunks).toBeEmpty();
  });

  it("http10 eof delimited body streams fully", async () => {
    const [raw, port] = await rawBackend([
      "HTTP/1.0 200 OK\r\nContent-Type: text/plain\r\n\r\n",
      "eof-delimited body",
    ]);
    try {
      const req = new Net.HTTP.Get("/");
      const response = new HttpStreamingResponse(req, "127.0.0.1", port);
      response.useSsl = false;

      expect(await response.status()).toBe(200);
      let body = "";
      await response.body.each((chunk) => (body += decoder.decode(chunk)));
      expect(body).toBe("eof-delimited body");

      expect(!sessionOf(response)!.isStarted()).toBeTruthy();
    } finally {
      raw.close();
    }
  });

  it("head request yields no body", async () => {
    const req = new Net.HTTP.Head("/");
    const response = new HttpStreamingResponse(req, "127.0.0.1", server.port);
    response.useSsl = false;

    expect(await response.status()).toBe(200);
    const chunks: Uint8Array[] = [];
    await response.body.each((chunk) => chunks.push(chunk));
    expect(chunks).toBeEmpty();

    expect(!sessionOf(response)!.isStarted()).toBeTruthy();
  });

  it("streaming session never retries", async () => {
    await response.status();
    expect(sessionOf(response)!.maxRetries).toBe(0);
  });

  it("midstream backend failure raises logs and closes", async () => {
    const [raw, port] = await rawBackend([
      "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nTransfer-Encoding: chunked\r\n\r\n",
      "5\r\nhello\r\n",
    ]);
    try {
      const req = new Net.HTTP.Get("/");
      const response = new HttpStreamingResponse(req, "127.0.0.1", port);
      response.useSsl = false;
      const sink = new StringIO();
      response.logger = sink;

      expect(await response.status()).toBe(200);
      const chunks: string[] = [];
      await expect(
        response.body.each((chunk) => chunks.push(decoder.decode(chunk))),
      ).rejects.toThrow(EOFError);
      expect(chunks).toEqual(["hello"]);
      expect(sink.string()).toMatch(/streaming backend read failed/);

      expect(!sessionOf(response)!.isStarted()).toBeTruthy();
    } finally {
      raw.close();
    }
  });
});
