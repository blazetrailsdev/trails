import { Set } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import "./index.js";
import { RemoteConnections } from "./remote-connections.js";

function recordingServer() {
  const broadcasts: [string, unknown][] = [];
  return {
    broadcasts,
    connectionIdentifiers: new Set(["currentUser"]),
    broadcast(broadcasting: string, message: unknown) {
      broadcasts.push([broadcasting, message]);
      return Promise.resolve(null);
    },
  };
}

describe("ActionCable::RemoteConnections", () => {
  it("disconnects through the internal channel", async () => {
    const server = recordingServer();
    const remote = new RemoteConnections(server);
    expect(remote.server).toBe(server);
    await remote.where({ currentUser: "1", other: "x" }).disconnect();
    expect(server.broadcasts).toEqual([
      ["action_cable/1", { type: "disconnect", reconnect: true }],
    ]);
  });

  it("passes reconnect: false", async () => {
    const server = recordingServer();
    await new RemoteConnections(server)
      .where({ currentUser: "1" })
      .disconnect({ reconnect: false });
    expect(server.broadcasts).toEqual([
      ["action_cable/1", { type: "disconnect", reconnect: false }],
    ]);
  });

  it("raises InvalidIdentifiersError when a server identifier is missing", () => {
    const server = recordingServer();
    expect(() => new RemoteConnections(server).where({ other: "x" })).toThrow(
      RemoteConnections.RemoteConnection.InvalidIdentifiersError,
    );
  });
});
