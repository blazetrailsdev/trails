import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { Connections } from "./connections.js";

interface Conn {
  beat(): void;
  statistics: unknown;
}

function host() {
  const timers: Array<[number, () => unknown]> = [];
  class Host {
    eventLoop = {
      timer: (interval: number, block: () => unknown) => {
        timers.push([interval, block]);
        return { interval };
      },
      post: (_task: null, block: () => unknown) => block(),
    };
  }
  include(Host, Connections);
  const h = new Host() as unknown as {
    connections: Conn[];
    addConnection(c: Conn): Conn[];
    removeConnection(c: Conn): Conn | null;
    setupHeartbeatTimer(): unknown;
    openConnectionsStatistics: unknown[];
  };
  return { h, timers };
}

describe("ActionCable::Server::Connections", () => {
  it("removes every matching connection", () => {
    const { h } = host();
    const c = { beat() {}, statistics: 1 };
    expect(h.addConnection(c)).toEqual([c]);
    h.addConnection(c);
    expect(h.removeConnection(c)).toBe(c);
    expect(h.connections).toEqual([]);
    expect(h.removeConnection(c)).toBeNull();
  });

  it("memoizes the heartbeat timer and beats every connection", () => {
    const { h, timers } = host();
    let beats = 0;
    h.addConnection({ beat: () => beats++, statistics: null });
    h.addConnection({ beat: () => beats++, statistics: null });
    const timer = h.setupHeartbeatTimer();
    expect(h.setupHeartbeatTimer()).toBe(timer);
    expect(timers).toHaveLength(1);
    expect(timers[0][0]).toBe(3);
    timers[0][1]();
    expect(beats).toBe(2);
  });

  it("maps open connections to their statistics", () => {
    const { h } = host();
    h.addConnection({ beat() {}, statistics: { id: 1 } });
    h.addConnection({ beat() {}, statistics: { id: 2 } });
    expect(h.openConnectionsStatistics).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
