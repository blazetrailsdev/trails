import { describe, expect, it, vi } from "vitest";
import "../index.js";
import { Base as ServerBase } from "../server/base.js";
import { Configuration } from "../server/configuration.js";
import { socketPair } from "../test-helpers/socket-pair.js";
import { StreamEventLoop } from "./stream-event-loop.js";
import { Base } from "./base.js";

const noop = () => {};
const [io] = socketPair();

function env(): Record<string, unknown> {
  return {
    REQUEST_METHOD: "GET",
    PATH_INFO: "/cable",
    HTTP_HOST: "localhost",
    HTTP_ORIGIN: "http://localhost",
    HTTP_CONNECTION: "upgrade",
    HTTP_UPGRADE: "websocket",
    HTTP_SEC_WEBSOCKET_KEY: "dGhlIHNhbXBsZSBub25jZQ==",
    HTTP_SEC_WEBSOCKET_VERSION: "13",
    HTTP_SEC_WEBSOCKET_PROTOCOL: "actioncable-v1-json",
    "rack.hijack": () => io,
  };
}

function server(): ServerBase {
  const config = new Configuration();
  config.logger = { info: noop, error: noop, debug: noop };
  const s = new ServerBase({ config });
  (s as unknown as { _eventLoop: StreamEventLoop })._eventLoop = new StreamEventLoop();
  return s;
}

class Connection extends Base {
  transmitted: unknown[] = [];
  connected = false;
  override transmit(message: unknown): boolean {
    this.transmitted.push(message);
    return true;
  }
  override sendAsync(method: string, ...args: unknown[]): unknown {
    return (this as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
  }
}

describe("ActionCable::Connection::Base", () => {
  it("finishes an async connect before the welcome message", async () => {
    class AsyncConnection extends Connection {
      async connect(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 5));
        this.connected = true;
        this.transmitted.push("connected");
      }
    }
    const s = server();
    const connection = new AsyncConnection(s, env());
    connection.process();
    await vi.waitFor(() => expect(connection.transmitted.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(connection.transmitted).toEqual(["connected", { type: "welcome" }]);
    expect(connection.protocol).toBe("actioncable-v1-json");
    expect(s.connections).toEqual([connection]);
  });

  it("leaves an unauthorized connection out of server.connections", async () => {
    class RejectedConnection extends Connection {
      connect(): void {
        this.rejectUnauthorizedConnection();
      }
    }
    const s = server();
    const connection = new RejectedConnection(s, env());
    connection.process();
    await vi.waitFor(() => expect(connection.transmitted.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(connection.transmitted).toEqual([
      { type: "disconnect", reason: "unauthorized", reconnect: false },
    ]);
    expect(s.connections).toEqual([]);
  });

  it("tags the logger with a lambda log tag's value for the request", () => {
    const s = server();
    s.config.logTags = [(request: { requestMethod: string }) => request.requestMethod, "my_tag"];
    const connection = new Connection(s, env());
    expect(connection.logger.tags).toEqual(["GET", "MyTag"]);
  });
});
