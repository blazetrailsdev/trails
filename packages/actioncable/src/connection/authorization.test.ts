import { ActiveSupportJSON } from "@blazetrails/activesupport";
import { MockRequest } from "@blazetrails/rack";
import { describe, it } from "vitest";
import { TestCase } from "../test-helpers/test-helper.js";
import { TestServer } from "../test-helpers/stubs/test-server.js";
import type { Base as ServerBase } from "../server/base.js";
import { Base } from "./base.js";

class Connection extends Base {
  override get websocket() {
    return super.websocket;
  }

  connect(): void {
    this.rejectUnauthorizedConnection();
  }

  override sendAsync(method: string, ...args: unknown[]): unknown {
    return (this as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
  }
}

describe("ActionCable::Connection::AuthorizationTest", () => {
  const tc = new TestCase("authorization");

  it("unauthorized connection", async () => {
    await tc.runInEventmachine(async () => {
      const server = new TestServer();
      server.config.allowedRequestOrigins = ["http://rubyonrails.com"];

      const env = MockRequest.envFor("/test", {
        HTTP_CONNECTION: "upgrade",
        HTTP_UPGRADE: "websocket",
        HTTP_HOST: "localhost",
        HTTP_ORIGIN: "http://rubyonrails.com",
      });

      const connection = new Connection(server as unknown as ServerBase, env);

      await tc.assertCalledWith(
        connection.websocket,
        "transmit",
        [
          ActiveSupportJSON.encode({
            type: "disconnect",
            reason: "unauthorized",
            reconnect: false,
          }),
        ],
        {},
        async () => {
          await tc.assertCalled(connection.websocket, "close", null, {}, async () => {
            connection.process();
            await tc.waitForAsync();
          });
        },
      );
    });
  });
});
