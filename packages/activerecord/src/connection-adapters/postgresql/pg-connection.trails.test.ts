import { it, expect, describe, vi } from "vitest";
import { IO } from "@blazetrails/ruby-compat";
import { pgConnection } from "./pg-connection.js";

describe("pgConnection socket_io", () => {
  it("reopen unrefs and strips listeners, and never closes the socket", () => {
    const stream = { unref: vi.fn(), removeAllListeners: vi.fn(), end: vi.fn(), destroy: vi.fn() };
    pgConnection({ connection: { stream } }).socketIo()?.reopen(IO.NULL);
    expect(stream.removeAllListeners).toHaveBeenCalledOnce();
    expect(stream.unref).toHaveBeenCalledOnce();
    expect(stream.end).not.toHaveBeenCalled();
    expect(stream.destroy).not.toHaveBeenCalled();
  });

  it("is nil for a client with no socket", () => {
    expect(pgConnection({}).socketIo()).toBeNull();
  });
});
