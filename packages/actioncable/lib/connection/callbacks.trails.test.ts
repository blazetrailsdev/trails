import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { Callbacks } from "./callbacks.js";

interface ConnectionClass {
  beforeCommand(...methods: unknown[]): void;
  afterCommand(...methods: unknown[]): void;
  aroundCommand(...methods: unknown[]): void;
}

class Connection {
  log: string[] = [];
  declare runCallbacks: (kind: string, block?: () => unknown) => unknown;
}
include(Connection, Callbacks);

class TestConnection extends Connection {}
const klass = TestConnection as unknown as ConnectionClass;
klass.beforeCommand(function (this: Connection) {
  this.log.push("before");
});
klass.afterCommand(function (this: Connection) {
  this.log.push("after");
});
klass.aroundCommand(async function (this: Connection, _record: unknown, block: () => unknown) {
  this.log.push("around:in");
  await block();
  this.log.push("around:out");
});

describe("ActionCable::Connection::Callbacks", () => {
  it("runs before, around and after command callbacks around the command", async () => {
    const connection = new TestConnection();
    await connection.runCallbacks("command", async () => {
      await Promise.resolve();
      connection.log.push("command");
    });
    expect(connection.log).toEqual(["before", "around:in", "command", "around:out", "after"]);
  });
});
