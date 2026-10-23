import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { Identification } from "./identification.js";
import { Authorization } from "./authorization.js";

interface ConnectionClass {
  identifiers: Set<string>;
  identifiedBy(...identifiers: string[]): void;
}

class Connection {
  logged: string[] = [];
  logger = { error: (message: string) => this.logged.push(message) };
}
include(Connection, Identification);
include(Connection, Authorization);

class UserConnection extends Connection {
  declare currentUser: unknown;
  declare currentRoom: unknown;
  declare connectionIdentifier: string;
}
(UserConnection as unknown as ConnectionClass).identifiedBy("currentUser", "currentRoom");

describe("ActionCable::Connection::Identification and Authorization", () => {
  it("keeps a subclass's identifiers out of the parent", () => {
    expect([...(UserConnection as unknown as ConnectionClass).identifiers]).toEqual([
      "currentUser",
      "currentRoom",
    ]);
    expect([...(Connection as unknown as ConnectionClass).identifiers]).toEqual([]);
  });

  it("generates an accessor per identifier", () => {
    const connection = new UserConnection();
    expect(connection.currentUser).toBeNull();
    connection.currentUser = "lifo";
    expect(connection.currentUser).toBe("lifo");
  });

  it("memoizes a connection identifier read before connect", () => {
    const connection = new UserConnection();
    expect(connection.connectionIdentifier).toBe("");
    connection.currentUser = "lifo";
    expect(connection.connectionIdentifier).toBe("");
  });

  it("sorts and joins the identifiers, through to_gid_param where answered", () => {
    const connection = new UserConnection();
    connection.currentUser = { toGidParam: () => "Z2lkOi8vdXNlci8x" };
    connection.currentRoom = "abc";
    expect(connection.connectionIdentifier).toBe("Z2lkOi8vdXNlci8x:abc");
  });

  it("logs and raises on an unauthorized connection", () => {
    const connection = new UserConnection() as UserConnection & typeof Authorization;
    expect(() => connection.rejectUnauthorizedConnection()).toThrow(
      Authorization.UnauthorizedError,
    );
    expect(connection.logged).toEqual(["An unauthorized connection attempt was rejected"]);
  });
});
