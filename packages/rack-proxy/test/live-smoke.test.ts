import { env as ENV } from "@blazetrails/ruby-compat";
import { MockRequest, MockResponse, type Headers } from "@blazetrails/rack";
import { beforeEach, describe, expect, it } from "vitest";

import { Proxy } from "../lib/index.js";

type Env = Record<string, unknown>;

describe("LiveSmokeTest", () => {
  class HostProxy extends Proxy {
    host: string | null = null;

    override rewriteEnv(env: Env): Env {
      env["HTTP_HOST"] = this.host ?? "example.com";
      return env;
    }
  }

  let _app: HostProxy | null = null;
  const app = () => (_app ??= new HostProxy({ streaming: false, allowDynamicBackend: true }));
  let lastResponse: MockResponse;

  async function get(path: string): Promise<void> {
    const [status, headers, body] = (await app().call(MockRequest.envFor(path))) as unknown as [
      number,
      Headers,
      unknown,
    ];
    const chunks: string[] = [];
    const push = (c: string | Uint8Array) =>
      chunks.push(typeof c === "string" ? c : new TextDecoder().decode(c));
    if (Array.isArray(body)) body.forEach(push);
    else await (body as { each(b: typeof push): Promise<void> }).each(push);
    lastResponse = new MockResponse(
      status,
      "toA" in headers ? Object.fromEntries(headers.toA()) : headers,
      [chunks.join("")],
    );
  }

  beforeEach((ctx) => {
    _app = null;
    if (!ENV["LIVE"]) ctx.skip("set LIVE=1 to run network smoke tests");
  });

  it("proxies to real http host", async () => {
    app().host = "example.com";
    await get("/");
    expect(lastResponse.isOk).toBeTruthy();
    expect(lastResponse.body).toMatch(/Example Domain/);
  });

  it("default verify peer accepts valid public cert", async () => {
    app().host = "example.com";
    await get("https://example.com/");
    expect(
      lastResponse.isOk,
      "default VERIFY_PEER should accept a valid publicly-trusted cert",
    ).toBeTruthy();
  });
});
