import { it, expect, describe, vi } from "vitest";
import { mysql2Client } from "./mysql2-client.js";

describe("mysql2Client", () => {
  it("automatic_close = false unrefs and strips listeners, and never closes the socket", () => {
    const stream = { unref: vi.fn(), removeAllListeners: vi.fn(), end: vi.fn(), destroy: vi.fn() };
    const client = mysql2Client({ connection: { stream } });
    expect(client.automaticClose).toBe(true);
    client.automaticClose = false;
    expect(client.automaticClose).toBe(false);
    expect(stream.removeAllListeners).toHaveBeenCalledOnce();
    expect(stream.unref).toHaveBeenCalledOnce();
    expect(stream.end).not.toHaveBeenCalled();
    expect(stream.destroy).not.toHaveBeenCalled();
  });

  it("automatic_close = true leaves the socket alone", () => {
    const stream = { unref: vi.fn(), removeAllListeners: vi.fn() };
    const client = mysql2Client({ connection: { stream } });
    client.automaticClose = true;
    expect(stream.unref).not.toHaveBeenCalled();
  });

  it("answers for a client with no socket", () => {
    const client = mysql2Client({});
    expect(() => (client.automaticClose = false)).not.toThrow();
  });
});
