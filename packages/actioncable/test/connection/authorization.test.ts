import { ActiveSupportJSON } from "@blazetrails/activesupport";
import { MockRequest } from "@blazetrails/rack";
import { describe, it } from "vitest";
import { TestCase } from "../support/test-helper.js";
import { TestServer } from "../support/stubs/test-server.js";
import type { Base as ServerBase } from "../../lib/server/base.js";
import { Base } from "../../lib/connection/base.js";
import type { WebSocket } from "../../lib/connection/web-socket.js";

class Connection extends Base {
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
        (connection as unknown as { websocket: WebSocket }).websocket,
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
          await tc.assertCalled(
            (connection as unknown as { websocket: WebSocket }).websocket,
            "close",
            null,
            {},
            async () => {
              connection.process();
              await tc.waitForAsync();
            },
          );
        },
      );
    });
  });
});
