import pg from "pg";
import { rbClassNewInstance } from "@blazetrails/ruby-compat";
import { vi } from "vitest";
import { Connection } from "@blazetrails/pg";

{
  const spy = vi.spyOn(pg, "Client").mockImplementation(function () {
    return { connect: async () => {}, end: async () => {} };
  } as never);
  try {
    await Connection.new({}, () => null);
  } finally {
    spy.mockRestore();
  }
}

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
