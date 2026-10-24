import { ActiveSupportJSON, isBlank } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { MockRequest } from "@blazetrails/rack";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "../test-helpers/test-helper.js";
import { TestServer } from "../test-helpers/stubs/test-server.js";
import type { Base as ServerBase } from "../server/base.js";
import { Base } from "./base.js";

class Connection extends Base {
  connected?: boolean;

  override get websocket() {
    return super.websocket;
  }

  override get messageBuffer() {
    return super.messageBuffer;
  }

  connect(): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  override sendAsync(method: string, ...args: unknown[]): unknown {
    return (this as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
  }
}

describe("ActionCable::Connection::BaseTest", () => {
  let tc: TestCase;
  let server: TestServer;

  beforeEach(() => {
    tc = new TestCase("base");
    server = new TestServer();
    server.config.allowedRequestOrigins = ["http://rubyonrails.com"];
  });

  function openConnection(): Connection {
    const env = MockRequest.envFor("/test", {
      HTTP_CONNECTION: "upgrade",
      HTTP_UPGRADE: "websocket",
      HTTP_HOST: "localhost",
      HTTP_ORIGIN: "http://rubyonrails.com",
    });

    return new Connection(server as unknown as ServerBase, env);
  }

  it("making a connection with invalid headers", async () => {
    await tc.runInEventmachine(() => {
      const connection = new Base(server as unknown as ServerBase, MockRequest.envFor("/test"));
      const response = connection.process() as unknown[];
      expect(response[0]).toBe(404);
    });
  });

  it("websocket connection", async () => {
    await tc.runInEventmachine(async () => {
      const connection = openConnection();
      connection.process();

      expect(connection.websocket.isPossible()).toBeRubyTruthy();

      await tc.waitForAsync();
      expect(connection.websocket.isAlive()).toBeTruthy();
    });
  });

  it("rack response", async () => {
    await tc.runInEventmachine(() => {
      const connection = openConnection();
      const response = connection.process();

      expect(response).toEqual([-1, {}, []]);
    });
  });

  it("on connection open", async () => {
    await tc.runInEventmachine(async () => {
      const connection = openConnection();

      await tc.assertCalledWith(
        connection.websocket,
        "transmit",
        [ActiveSupportJSON.encode({ type: "welcome" })],
        {},
        async () => {
          await tc.assertCalled(connection.messageBuffer, "processBang", null, {}, async () => {
            connection.process();
            await tc.waitForAsync();
          });
        },
      );

      expect(server.connections).toEqual([connection]);
      expect(connection.connected).toBeTruthy();
    });
  });

  it("on connection close", async () => {
    await tc.runInEventmachine(async () => {
      const connection = openConnection();
      connection.process();

      await (connection as unknown as { handleOpen(): Promise<unknown> }).handleOpen();
      expect(connection.connected).toBeTruthy();

      await tc.assertCalled(connection.subscriptions, "unsubscribeFromAll", null, {}, async () => {
        await (connection as unknown as { handleClose(): Promise<unknown> }).handleClose();
      });

      expect(connection.connected).toBeFalsy();
      expect(server.connections).toEqual([]);
    });
  });

  it("connection statistics", async () => {
    await tc.runInEventmachine(() => {
      const connection = openConnection();
      connection.process();

      const statistics = connection.statistics;

      expect(isBlank(statistics.identifier)).toBeTruthy();
      expect(statistics.startedAt).toBeInstanceOf(Time);
      expect(statistics.subscriptions).toEqual([]);
    });
  });

  it("explicitly closing a connection", async () => {
    await tc.runInEventmachine(async () => {
      const connection = openConnection();
      connection.process();

      await tc.assertCalled(connection.websocket, "close", null, {}, () => {
        connection.close({ reason: "testing" });
      });
    });
  });

  it("rejecting a connection causes a 404", async () => {
    await tc.runInEventmachine(() => {
      class CallMeMaybe {
        call(..._args: unknown[]): never {
          throw new RuntimeError("Do not call me!");
        }
      }

      const env = MockRequest.envFor("/test", {
        HTTP_CONNECTION: "upgrade",
        HTTP_UPGRADE: "websocket",
        HTTP_HOST: "localhost",
        HTTP_ORIGIN: "http://rubyonrails.org",
        "rack.hijack": new CallMeMaybe(),
      });

      const connection = new Base(server as unknown as ServerBase, env);
      const response = connection.process() as unknown[];
      expect(response[0]).toBe(404);
    });
  });
});
