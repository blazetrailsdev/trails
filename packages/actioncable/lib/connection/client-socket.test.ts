import { stub } from "@blazetrails/activesupport";
import { MockRequest } from "@blazetrails/rack";
import { Concurrent, RuntimeError, rbObjIvarGet, type TCPSocket } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "../test-helpers/test-helper.js";
import { socketPair } from "../test-helpers/socket-pair.js";
import { TestServer } from "../test-helpers/stubs/test-server.js";
import type { Base as ServerBase } from "../server/base.js";
import { Base } from "./base.js";
import type { ClientSocket } from "./client-socket.js";
import type { Stream } from "./stream.js";

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

describe("ActionCable::Connection::ClientSocketTest", () => {
  const tc = new TestCase("client socket");
  let server: TestServer;

  beforeEach(() => {
    server = new TestServer();
    server.config.allowedRequestOrigins = ["http://rubyonrails.com"];
  });

  it("delegate socket errors to on_error handler", async () => {
    await tc.runInEventmachine(async () => {
      const connection = await openConnection();

      const client = websocketOf(connection);
      stub(
        rbObjIvarGet(client, "@stream") as Stream,
        "write",
        () => {
          throw new RuntimeError("foo");
        },
        [],
        () => {
          tc.assertNotCalled(client, "clientGone", null, () => {
            client.write("boo");
          });
        },
      );
      expect(connection.errors).toEqual(["foo"]);
    });
  });

  it("closes hijacked i/o socket at shutdown", async () => {
    await tc.runInEventmachine(async () => {
      const connection = await openConnection();

      const client = websocketOf(connection);
      const event = new Concurrent.Event();
      (
        rbObjIvarGet(rbObjIvarGet(client, "@stream") as object, "@rack_hijack_io") as TCPSocket
      ).close = () => {
        event.set();
        return null;
      };
      connection.close({ reason: "testing" });
      await event.wait();
    });
  });

  function websocketOf(connection: Connection): ClientSocket {
    return (connection as unknown as { websocket: { websocket: ClientSocket } }).websocket
      .websocket;
  }

  async function openConnection(): Promise<Connection> {
    const env = MockRequest.envFor("/test", {
      HTTP_CONNECTION: "upgrade",
      HTTP_UPGRADE: "websocket",
      HTTP_HOST: "localhost",
      HTTP_ORIGIN: "http://rubyonrails.com",
    });
    const [io, clientIo] = socketPair();
    env["rack.hijack"] = () => (env["rack.hijack_io"] = io);

    const connection = new Connection(server as unknown as ServerBase, env);
    connection.process();
    let response = "";
    const timeout = setTimeout(() => clientIo.close(), 1000);
    while (!response.includes("\r\n\r\n")) {
      const chunk = await clientIo.readBlocking(1);
      if (chunk == null) throw new RuntimeError("execution expired");
      response += new TextDecoder().decode(chunk as Uint8Array);
    }
    clearTimeout(timeout);
    await (connection as unknown as { handleOpen(): Promise<unknown> }).handleOpen();
    expect(connection.connected).toBeRubyTruthy();
    return connection;
  }
});
