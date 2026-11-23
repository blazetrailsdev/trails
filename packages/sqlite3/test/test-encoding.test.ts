import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Encoding } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

describe("TestEncoding", () => {
  let db: InstanceType<typeof SQLite3.Database>;
  let create: string;

  beforeEach(async () => {
    db = new SQLite3.Database(":memory:", { engine });
    create = "create table ex(id int, data string)";
    await db.execute(create);
  });

  afterEach(async () => {
    await db.close();
  });

  it("change encoding", async () => {
    const db = new SQLite3.Database(":memory:", { engine });
    expect(await db.encoding()).toBe(Encoding.find("UTF-8"));

    await db.execute("PRAGMA encoding='UTF-16le'");
    expect(await db.encoding()).toBe(Encoding.find("UTF-16le"));
  });

  it("encoding", async () => {
    expect(await db.encoding()).toBe(Encoding.find("UTF-8"));
  });
});
