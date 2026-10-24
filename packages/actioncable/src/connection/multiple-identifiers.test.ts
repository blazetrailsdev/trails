import { MockRequest } from "@blazetrails/rack";
import { describe, expect, it } from "vitest";
import { TestCase } from "../test-helpers/test-helper.js";
import { Room } from "../test-helpers/stubs/room.js";
import { TestServer } from "../test-helpers/stubs/test-server.js";
import { User } from "../test-helpers/stubs/user.js";
import { Base } from "./base.js";

class Connection extends Base {
  declare currentUser: User;
  declare currentRoom: Room;

  connect(): void {
    this.currentUser = new User("lifo");
    this.currentRoom = new Room("my", "room");
  }
}
(Connection as unknown as { identifiedBy(...ids: string[]): void }).identifiedBy(
  "currentUser",
  "currentRoom",
);

describe("ActionCable::Connection::MultipleIdentifiersTest", () => {
  const t = new TestCase("multiple identifiers");
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
    await (connection as unknown as { handleOpen(): Promise<unknown> }).handleOpen();
  }

  it("multiple connection identifiers", async () => {
    await t.runInEventmachine(async () => {
      await openConnection();

      expect(connection.connectionIdentifier).toBe("Room#my-room:User#lifo");
    });
  });
});
