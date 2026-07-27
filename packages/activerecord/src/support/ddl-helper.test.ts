import { describe, expect, it, vi } from "vitest";
import { withExampleTable } from "./ddl-helper.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

function recordingConnection() {
  const calls: string[] = [];
  const connection = {
    execute: vi.fn(async (sql: string) => {
      calls.push(sql);
    }),
    dropTable: vi.fn(async (name: string) => {
      calls.push(`DROP ${name}`);
    }),
  } as unknown as DatabaseAdapter;
  return { connection, calls };
}

describe("DdlHelper#with_example_table", () => {
  it("creates the table, yields, and drops it", async () => {
    const { connection, calls } = recordingConnection();

    await withExampleTable(connection, "ex", "id int", () => {
      calls.push("yielded");
    });

    expect(calls).toEqual(["CREATE TABLE ex(id int)", "yielded", "DROP ex"]);
  });

  it("drops the table in the ensure even when the block raises", async () => {
    const { connection, calls } = recordingConnection();

    await expect(
      withExampleTable(connection, "ex", "id int", () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(calls).toEqual(["CREATE TABLE ex(id int)", "DROP ex"]);
  });

  it("defaults the definition to nil", async () => {
    const { connection, calls } = recordingConnection();

    await withExampleTable(connection, "ex", () => {});

    expect(calls[0]).toBe("CREATE TABLE ex()");
  });

  it("returns the block's value", async () => {
    const { connection } = recordingConnection();

    await expect(withExampleTable(connection, "ex", null, () => 42)).resolves.toBe(42);
  });
});
