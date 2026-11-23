import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

describe("IntegrationPendingTestCase", () => {
  let db: InstanceType<typeof SQLite3.Database>;

  beforeEach(async () => {
    db = new SQLite3.Database("test.db", { engine });
    await db.transaction(null, async () => {
      await db.execute("create table foo ( a integer primary key, b text )");
      await db.execute("insert into foo ( b ) values ( 'foo' )");
      await db.execute("insert into foo ( b ) values ( 'bar' )");
      await db.execute("insert into foo ( b ) values ( 'baz' )");
    });
  });

  afterEach(async () => {
    await db.close();
    File.delete("test.db");
  });

  it("busy handler impatient", async () => {
    let handlerCallCount = 0;

    const db2 = new SQLite3.Database("test.db", { engine });
    await db2.executeBatch2("begin exclusive transaction");

    db.busyHandler(() => {
      handlerCallCount += 1;
      return false;
    });

    await expect(db.execute("insert into foo (b) values ( 'from 2' )")).rejects.toThrow(
      SQLite3.BusyException,
    );
    expect(handlerCallCount).toBe(1);

    await db2.executeBatch2("commit transaction");
    await db2.close();
  });

  it("busy handler outwait", async () => {
    let handlerCallCount = 0;

    const db2 = new SQLite3.Database("test.db", { engine });
    await db2.executeBatch2("begin exclusive transaction");

    db.busyHandler(() => {
      handlerCallCount += 1;
      db2.executeBatch2("commit transaction") as unknown[];
      return true;
    });

    await expect(db.execute("insert into foo (b) values ( 'from 2' )")).resolves.not.toThrow();
    expect(handlerCallCount).toBe(1);

    await db2.close();
  });
});
