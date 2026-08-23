import { it, expect, describe, vi } from "vitest";
import { abandonRawSocket } from "./abandon-raw-socket.js";

describe("abandonRawSocket", () => {
  it("unrefs and strips listeners on a node-postgres style socket", () => {
    const socket = { unref: vi.fn(), removeAllListeners: vi.fn() };
    // node-postgres exposes the net socket at client.connection.stream.
    abandonRawSocket({ connection: { stream: socket } });
    expect(socket.removeAllListeners).toHaveBeenCalledOnce();
    expect(socket.unref).toHaveBeenCalledOnce();
  });

  it("unrefs and strips listeners on a node-mysql2 style socket", () => {
    const socket = { unref: vi.fn(), removeAllListeners: vi.fn() };
    // node-mysql2's core connection exposes the socket at .stream.
    abandonRawSocket({ stream: socket });
    expect(socket.removeAllListeners).toHaveBeenCalledOnce();
    expect(socket.unref).toHaveBeenCalledOnce();
  });

  it("never closes the socket", () => {
    const socket = {
      unref: vi.fn(),
      removeAllListeners: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    };
    abandonRawSocket({ stream: socket });
    expect(socket.end).not.toHaveBeenCalled();
    expect(socket.destroy).not.toHaveBeenCalled();
  });

  it("no-ops on null/undefined or a handle with no socket", () => {
    expect(() => abandonRawSocket(null)).not.toThrow();
    expect(() => abandonRawSocket(undefined)).not.toThrow();
    expect(() => abandonRawSocket({})).not.toThrow();
  });

  it("swallows errors thrown by a partially torn-down socket", () => {
    const socket = {
      removeAllListeners: () => {
        throw new Error("already destroyed");
      },
      unref: vi.fn(),
    };
    expect(() => abandonRawSocket({ stream: socket })).not.toThrow();
  });
});
