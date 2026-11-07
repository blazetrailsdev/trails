import { MockRequest } from "@blazetrails/rack";
import { rbFSend } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { TestCase } from "../support/test-helper.js";
import { TestServer } from "../support/stubs/test-server.js";
import { Base } from "../../lib/connection/base.js";

class Connection extends Base {
  declare currentToken: string;

  connect(): void {
    this.currentToken = "random-string";
  }

  override sendAsync(method: string, ...args: unknown[]): unknown {
    return rbFSend(this, method, ...args);
  }
}
(Connection as unknown as { identifiedBy(...ids: string[]): void }).identifiedBy("currentToken");

describe("ActionCable::Connection::StringIdentifierTest", () => {
  const t = new TestCase("string identifier");
  let connection: Connection;

  async function openConnection(): Promise<void> {
    const server = new TestServer();
    const env = MockRequest.envFor("/test", {
      HTTP_HOST: "localhost",
      HTTP_CONNECTION: "upgrade",
      HTTP_UPGRADE: "websocket",
    });
    connection = new Connection(server as never, env);

    connection.process();
    await connection.onOpen();
  }

  it("connection identifier", async () => {
    await t.runInEventmachine(async () => {
      await openConnection();

      expect(connection.connectionIdentifier).toBe("random-string");
    });
  });
});
