import { it, expect, describe, vi } from "vitest";
import { IO } from "@blazetrails/ruby-compat";
import { Connection, pgConnection } from "./connection.js";

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

describe("pgConnection transaction_status and status", () => {
  function protocol() {
    const listeners: Record<string, ((message: { status?: string }) => void)[]> = {};
    return {
      on(event: string, listener: (message: { status?: string }) => void) {
        (listeners[event] ??= []).push(listener);
      },
      emit(event: string, message: { status?: string } = {}) {
        for (const listener of listeners[event] ?? []) listener(message);
      },
    };
  }

  it("follows ReadyForQuery, an error inside a transaction, and an in-flight query", () => {
    const connection = protocol();
    const client = pgConnection({ connection, _activeQuery: null as unknown });
    expect(client.transactionStatus()).toBe(0);
    connection.emit("readyForQuery", { status: "T" });
    expect(client.transactionStatus()).toBe(2);
    connection.emit("errorMessage");
    expect(client.transactionStatus()).toBe(3);
    connection.emit("readyForQuery", { status: "I" });
    expect(client.transactionStatus()).toBe(0);
    client._activeQuery = {};
    expect(client.transactionStatus()).toBe(1);
  });

  it("listens once however often the client is wrapped", () => {
    const connection = protocol();
    const on = vi.spyOn(connection, "on");
    pgConnection(pgConnection({ connection }));
    expect(on).toHaveBeenCalledTimes(2);
  });

  it("is CONNECTION_BAD once the client is ending", () => {
    expect(pgConnection({}).status()).toBe(0);
    expect(pgConnection({ _ending: true }).status()).toBe(1);
  });
});

describe("PG::Connection.escape_bytea", () => {
  it("renders the hex format, on the class and on a connection", () => {
    expect(Connection.escapeBytea(Buffer.from("hi"))).toBe("\\x6869");
    expect(pgConnection({}).escapeBytea("hi")).toBe("\\x6869");
    expect(Connection.unescapeBytea(Connection.escapeBytea("a\\\u0000"))).toEqual(
      Buffer.from([0x61, 0x5c, 0x00]),
    );
  });
});
