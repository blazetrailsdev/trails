import { stub } from "@blazetrails/activesupport/testing/method-call-assertions";
import { MockRequest } from "@blazetrails/rack";
import { EOFError, Errno, type TCPSocket } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "../support/test-helper.js";
import { socketPair } from "../support/socket-pair.js";
import { TestServer } from "../support/stubs/test-server.js";
import type { Base as ServerBase } from "../../lib/server/base.js";
import { Base } from "../../lib/connection/base.js";
import type { ClientSocket } from "../../lib/connection/client-socket.js";

class Connection extends Base {
  declare connected: boolean;
  errors: string[] = [];

  connect(): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  override sendAsync(method: string, ...args: unknown[]): unknown {
    return (this as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
  }

  override onError(message: string): unknown {
    return this.errors.push(message);
  }
}

describe("ActionCable::Connection::StreamTest", () => {
  const tc = new TestCase("stream");
  let server: TestServer;

  beforeEach(() => {
    server = new TestServer();
    server.config.allowedRequestOrigins = ["http://rubyonrails.com"];
  });

  for (const [name, closedException] of Object.entries({
    EOFError: EOFError,
    "Errno::ECONNRESET": Errno.ECONNRESET,
  })) {
    it(`closes socket on ${name}`, async () => {
      await tc.runInEventmachine(async () => {
        const [rackHijackIo] = socketPair();
        const connection = await openConnection(rackHijackIo);

        const client = (connection as unknown as { websocket: { websocket: ClientSocket } })
          .websocket.websocket;
        stub(
          rackHijackIo,
          "writeNonblock",
          () => {
            throw new closedException("foo");
          },
          [],
          () => {
            tc.assertCalled(client, "clientGone", null, {}, () => {
              client.write("boo");
            });
          },
        );
        expect(connection.errors).toEqual([]);
      });
    });
  }

  async function openConnection(io: TCPSocket): Promise<Connection> {
    const env = MockRequest.envFor("/test", {
      HTTP_CONNECTION: "upgrade",
      HTTP_UPGRADE: "websocket",
      HTTP_HOST: "localhost",
      HTTP_ORIGIN: "http://rubyonrails.com",
    });
    env["rack.hijack"] = () => (env["rack.hijack_io"] = io);

    const connection = new Connection(server as unknown as ServerBase, env);
    connection.process();
    await (connection as unknown as { handleOpen(): Promise<unknown> }).handleOpen();
    expect(connection.connected).toBeRubyTruthy();
    return connection;
  }
});
