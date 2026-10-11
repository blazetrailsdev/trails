import pg from "pg";
import { it, expect, describe, vi } from "vitest";
import { IO } from "@blazetrails/ruby-compat";
import { escapeBytea, pgConnection, unescapeBytea } from "./connection.js";
import { PG } from "./pg.js";
import { cancelAnyRunningQuery } from "../connection-adapters/postgresql/database-statements.js";

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

  it("is CONNECTION_BAD once the client is ending", () => {
    expect(pgConnection({}).status()).toBe(0);
    expect(pgConnection({ _ending: true }).status()).toBe(1);
  });
});

describe("PG::Connection.escape_bytea", () => {
  it("renders the hex format unescape_bytea reads back", () => {
    expect(escapeBytea(Buffer.from("hi"))).toBe("\\x6869");
    expect(unescapeBytea(escapeBytea("a\\\u0000"))).toEqual(Buffer.from([0x61, 0x5c, 0x00]));
  });
});

describe("PG::Connection#cancel and #block", () => {
  function client(outcome: "end" | "error") {
    const sent: unknown[][] = [];
    class Protocol {
      private listeners: Record<string, (arg?: unknown) => void> = {};
      on(event: string, listener: (arg?: unknown) => void) {
        this.listeners[event] = listener;
      }
      once(event: string, listener: () => void) {
        this.listeners[event] = listener;
      }
      connect(...args: unknown[]) {
        sent.push(args);
        if (outcome === "error") this.listeners.error(new Error("ECONNREFUSED"));
        else this.listeners.connect();
      }
      cancel(...args: unknown[]) {
        sent.push(args);
        this.listeners.end();
      }
    }
    const pgClient = {
      connection: new Protocol(),
      processID: 7,
      secretKey: 9,
      host: "db",
      port: 5432,
    };
    return { sent, client: pgConnection(pgClient) };
  }

  it("answers nil once the postmaster closes the cancel connection", async () => {
    const { sent, client: conn } = client("end");
    expect(await conn.cancel()).toBeNull();
    expect(sent).toEqual([
      [5432, "db"],
      [7, 9],
    ]);
  });

  it("answers the error's string when the cancel connection fails", async () => {
    expect(await client("error").client.cancel()).toBe("Error: ECONNREFUSED");
  });

  it("block answers true with no command in flight, and false once the timeout passes", async () => {
    expect(await pgConnection({ _activeQuery: null }).block()).toBe(true);
    const connection = { on: vi.fn(), off: vi.fn() };
    expect(await pgConnection({ _activeQuery: {}, connection }).block(0.001)).toBe(false);
    expect(connection.off).toHaveBeenCalledTimes(5);

    const listeners: (() => void)[] = [];
    const live = {
      on: (_event: string, listener: () => void) => listeners.push(listener),
      off: vi.fn(),
    };
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const blocked = pgConnection({ _activeQuery: {}, connection: live }).block(30);
    listeners.at(-1)!();
    expect(await blocked).toBe(true);
    expect(clear).toHaveBeenCalledOnce();
    clear.mockRestore();
  });

  it("async_cancel is cancel", async () => {
    expect(await client("end").client.asyncCancel()).toBeNull();
  });
});

describe("PG::Error#result on every carrier path", () => {
  const terminated = () => new Error("Connection terminated unexpectedly");

  it("rewraps a rejection from async_exec, exec_params, exec_prepared and query", async () => {
    const client = pgConnection({
      _ended: true,
      query: (_config: unknown) => Promise.reject(terminated()),
    });
    const errors = [
      await client.asyncExec("SELECT 1").catch((e: unknown) => e),
      await client.execParams("SELECT $1", [1]).catch((e: unknown) => e),
      await client.execPrepared("a1", [1]).catch((e: unknown) => e),
      await client.query("").catch((e: unknown) => e),
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(PG.ConnectionBad);
      expect((error as PG.Error).message).toBe("Connection terminated unexpectedly\n");
      expect((error as PG.Error).result).toBeNull();
      expect((error as PG.Error).connection).not.toBeNull();
    }
  });

  it("a server error keeps its 08 SQLSTATE in result and is not a ConnectionBad", async () => {
    const server = Object.assign(new pg.DatabaseError("terminating connection", 0, "error"), {
      code: "08006",
    });
    const bare = Object.assign(new Error("socket"), { code: "08006" });
    const client = pgConnection({ query: (error: unknown) => Promise.reject(error) });
    const query = client.query as unknown as (error: Error) => Promise<unknown>;
    const raised = (await query(server).catch((e: unknown) => e)) as PG.Error;
    expect(raised).toBeInstanceOf(PG.ServerError);
    expect(raised).not.toBeInstanceOf(PG.ConnectionBad);
    expect(raised.result!.errorField(PG.PG_DIAG_SQLSTATE)).toBe("08006");
    expect(raised.cause).toBe(server);
    expect(await query(bare).catch((e: unknown) => e)).toBeInstanceOf(PG.UnableToSend);
  });

  it("rewraps the error prepare is handed", async () => {
    const client = pgConnection({
      _queryable: false,
      query: (submittable: { handleError(error: unknown): void }) => {
        submittable.handleError(terminated());
      },
    });
    const error = await client.prepare("a1", "SELECT 1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PG.ConnectionBad);
  });

  it("a finished connection raises the gem's connection is closed", async () => {
    const client = pgConnection({
      _ending: true,
      query: () => Promise.reject(new Error("Client was closed and is not queryable")),
    });
    const error = (await client.asyncExec("SELECT 1").catch((e: unknown) => e)) as PG.Error;
    expect(error).toBeInstanceOf(PG.ConnectionBad);
    expect(error.message).toBe("connection is closed");
  });

  it("rewraps an error raised by a member the client answers", async () => {
    const client = pgConnection({ end: () => Promise.reject(terminated()) });
    await expect(client.end()).rejects.toBeInstanceOf(PG.UnableToSend);
  });
});

describe("PG::Error", () => {
  it("is the class of every error the connection raises, and of no other", async () => {
    const bug = new TypeError("values is not iterable");
    await expect(pgConnection({ query: () => Promise.reject(bug) }).query("")).rejects.toBe(bug);
    expect(bug).not.toBeInstanceOf(PG.Error);
    for (const driver of [
      new pg.DatabaseError("boom", 0, "error"),
      Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
      new AggregateError([], "getaddrinfo EAI_AGAIN db"),
      new Error("Query read timeout"),
      new Error("a message no shape test knew"),
    ]) {
      const error = await pgConnection({ query: () => Promise.reject(driver) })
        .query("")
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PG.Error);
      expect(error).toBeInstanceOf(Error);
    }
    expect(new PG.ConnectionBad()).toBeInstanceOf(PG.Error);
    expect(new PG.ServerError()).not.toBeInstanceOf(PG.ConnectionBad);
    expect(new PG.Error("m").error).toBe("m");
  });

  it("cancel on a closed connection raises PG::ConnectionBad", async () => {
    const error = await pgConnection({})
      .cancel()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PG.ConnectionBad);
    expect(error).toBeInstanceOf(PG.Error);
  });
});

describe("cancel_any_running_query", () => {
  function host(cancel: () => Promise<string | null>) {
    return {
      _rawConnection: { transactionStatus: () => 1, cancel, block: () => Promise.resolve(true) },
    } as unknown as ThisParameterType<typeof cancelAnyRunningQuery>;
  }

  it("rescues PG::Error", async () => {
    await expect(
      cancelAnyRunningQuery.call(host(pgConnection({}).cancel)),
    ).resolves.toBeUndefined();
  });

  it("lets an error the driver did not raise propagate", async () => {
    const error = new TypeError("this._rawConnection.cancel is not a function");
    await expect(cancelAnyRunningQuery.call(host(() => Promise.reject(error)))).rejects.toBe(error);
  });
});
