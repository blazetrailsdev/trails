import { assertCalled, assertNotCalled } from "@blazetrails/activesupport";
import { MockRequest } from "@blazetrails/rack";
import { describe, expect, it } from "vitest";
import { TestCase } from "../test-helpers/test-helper.js";
import { SuccessAdapter } from "../test-helpers/stubs/test-adapter.js";
import { TestServer } from "../test-helpers/stubs/test-server.js";
import { User } from "../test-helpers/stubs/user.js";
import { Base } from "./base.js";

class Connection extends Base {
  declare currentUser: User;

  declare processInternalMessage: (message: Record<string, unknown>) => void;

  connect(): void {
    this.currentUser = new User("lifo");
  }
}
(Connection as unknown as { identifiedBy(...ids: string[]): void }).identifiedBy("currentUser");

describe("ActionCable::Connection::IdentifierTest", () => {
  const t = new TestCase("identifier");
  let connection: Connection;

  async function openConnection(server: TestServer | null = null): Promise<void> {
    server ||= new TestServer();

    const env = MockRequest.envFor("/test", {
      HTTP_HOST: "localhost",
      HTTP_CONNECTION: "upgrade",
      HTTP_UPGRADE: "websocket",
    });
    connection = new Connection(server as never, env);

    connection.process();
    await (connection as unknown as { handleOpen(): Promise<unknown> }).handleOpen();
  }

  async function closeConnection(): Promise<void> {
    await (connection as unknown as { handleClose(): Promise<unknown> }).handleClose();
  }

  it("connection identifier", async () => {
    await t.runInEventmachine(async () => {
      await openConnection();
      expect(connection.connectionIdentifier).toBe("User#lifo");
    });
  });

  it("should subscribe to internal channel on open and unsubscribe on close", async () => {
    await t.runInEventmachine(async () => {
      const server = new TestServer();

      await openConnection(server);
      await closeConnection();
      await t.waitForAsync();

      for (const method of ["subscribe", "unsubscribe"]) {
        const pubsubCall = (SuccessAdapter as unknown as Record<string, Record<string, unknown>>)[
          `${method}Called`
        ];

        expect(pubsubCall["channel"]).toBe("action_cable/User#lifo");
        expect(pubsubCall["callback"]).toBeInstanceOf(Function);
      }
    });
  });

  it("processing disconnect message", async () => {
    await t.runInEventmachine(async () => {
      await openConnection();

      await assertCalled(
        (connection as unknown as { websocket: { close(): unknown } }).websocket,
        "close",
        null,
        {},
        () => {
          connection.processInternalMessage({ type: "disconnect" });
        },
      );
    });
  });

  it("processing invalid message", async () => {
    await t.runInEventmachine(async () => {
      await openConnection();

      await assertNotCalled(
        (connection as unknown as { websocket: { close(): unknown } }).websocket,
        "close",
        null,
        () => {
          connection.processInternalMessage({ type: "unknown" });
        },
      );
    });
  });
});
