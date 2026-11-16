import { MockRequest } from "@blazetrails/rack";
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";

import { Proxy } from "../lib/index.js";

async function rawBackend(reply: string): Promise<string> {
  const server = createServer((c) => c.once("data", () => c.end(reply)));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.unref();
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

describe("Rack::Proxy (trails)", () => {
  it("keeps a header whose name is an Object.prototype member", () => {
    const headers = Proxy.extractHttpRequestHeaders({
      HTTP_CONSTRUCTOR: "a",
      HTTP___PROTO__: "b",
      HTTP_CONNECTION: "close",
    });
    expect(headers.get("Constructor")).toBe("a");
    expect(headers.hasKey("Connection")).toBe(false);
  });

  it("drops trailing empty fields when titleizing, as Ruby's split does", () => {
    const proxyClass = Proxy as unknown as { reconstructHeaderName(name: string): string };
    expect(proxyClass.reconstructHeaderName("HTTP_FOO_")).toBe("Foo");
  });

  it("answers 400 for a non-numeric Content-Length", async () => {
    const proxy = new Proxy({ backend: await rawBackend(""), streaming: false });
    const env = MockRequest.envFor("/", { ":method": "POST", ":input": "a" });
    env["CONTENT_LENGTH"] = "1x";
    expect((await proxy.call(env))[0]).toBe(400);
  });

  it("answers 502 for a backend sending both Transfer-Encoding and Content-Length", async () => {
    const backend = await rawBackend(
      "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Length: 3\r\n\r\n0\r\n\r\n",
    );
    const proxy = new Proxy({ backend, streaming: false });
    expect((await proxy.call(MockRequest.envFor("/")))[0]).toBe(502);
  });
});
