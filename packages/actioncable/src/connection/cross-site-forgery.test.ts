import { MockRequest } from "@blazetrails/rack";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "../test-helpers/test-helper.js";
import { TestServer } from "../test-helpers/stubs/test-server.js";
import type { Base as ServerBase } from "../server/base.js";
import { Base } from "./base.js";

const HOST = "rubyonrails.com";

class Connection extends Base {
  override sendAsync(method: string, ...args: unknown[]): unknown {
    return (this as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
  }
}

describe("ActionCable::Connection::CrossSiteForgeryTest", () => {
  let tc: TestCase;
  let server: TestServer;

  beforeEach(() => {
    tc = new TestCase("cross_site_forgery");
    server = new TestServer();
    server.config.allowedRequestOrigins = ["http://rubyonrails.com"];
    server.config.allowSameOriginAsHost = false;
  });

  afterEach(() => {
    server.config.disableRequestForgeryProtection = false;
    server.config.allowedRequestOrigins = [];
    server.config.allowSameOriginAsHost = true;
  });

  it("disable forgery protection", async () => {
    server.config.disableRequestForgeryProtection = true;
    await assertOriginAllowed("http://rubyonrails.com");
    await assertOriginAllowed("http://hax.com");
  });

  it("explicitly specified a single allowed origin", async () => {
    server.config.allowedRequestOrigins = "http://hax.com";
    await assertOriginNotAllowed("http://rubyonrails.com");
    await assertOriginAllowed("http://hax.com");
  });

  it("explicitly specified multiple allowed origins", async () => {
    server.config.allowedRequestOrigins = ["http://rubyonrails.com", "http://www.rubyonrails.com"];
    await assertOriginAllowed("http://rubyonrails.com");
    await assertOriginAllowed("http://www.rubyonrails.com");
    await assertOriginNotAllowed("http://hax.com");
  });

  it("explicitly specified a single regexp allowed origin", async () => {
    server.config.allowedRequestOrigins = /.*ha.*/;
    await assertOriginNotAllowed("http://rubyonrails.com");
    await assertOriginAllowed("http://hax.com");
  });

  it("explicitly specified multiple regexp allowed origins", async () => {
    server.config.allowedRequestOrigins = [/http:\/\/ruby.*/, /.*rai.s.*com/, "string"];
    await assertOriginAllowed("http://rubyonrails.com");
    await assertOriginAllowed("http://www.rubyonrails.com");
    await assertOriginNotAllowed("http://hax.com");
    await assertOriginNotAllowed("http://rails.co.uk");
  });

  it("allow same origin as host", async () => {
    server.config.allowSameOriginAsHost = true;
    await assertOriginAllowed(`http://${HOST}`);
    await assertOriginNotAllowed("http://hax.com");
    await assertOriginNotAllowed("http://rails.co.uk");
  });

  async function assertOriginAllowed(origin: string): Promise<void> {
    const response = await connectWithOrigin(origin);
    expect(response[0]).toBe(-1);
  }

  async function assertOriginNotAllowed(origin: string): Promise<void> {
    const response = await connectWithOrigin(origin);
    expect(response[0]).toBe(404);
  }

  async function connectWithOrigin(origin: string): Promise<unknown[]> {
    let response: unknown[] | null = null;

    await tc.runInEventmachine(() => {
      response = new Connection(
        server as unknown as ServerBase,
        envForOrigin(origin),
      ).process() as unknown[];
    });

    return response!;
  }

  function envForOrigin(origin: string): Record<string, unknown> {
    return MockRequest.envFor("/test", {
      HTTP_CONNECTION: "upgrade",
      HTTP_UPGRADE: "websocket",
      SERVER_NAME: HOST,
      HTTP_HOST: HOST,
      HTTP_ORIGIN: origin,
    });
  }
});
