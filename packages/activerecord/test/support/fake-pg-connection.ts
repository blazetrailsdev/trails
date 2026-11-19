import pg from "pg";
import { rbClassNewInstance } from "@blazetrails/ruby-compat";
import { vi } from "vitest";
import { Connection } from "../../lib/pg/connection.js";

export function fakePgConnection(client: object): Connection {
  const spy = vi.spyOn(pg, "Client").mockImplementation(function () {
    return client;
  } as never);
  try {
    return rbClassNewInstance(Connection, {});
  } finally {
    spy.mockRestore();
  }
}
