import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertNot } from "@blazetrails/activesupport";
import { Base } from "../index.js";
import type { AbstractAdapter } from "./abstract-adapter.js";

describe("StandaloneConnectionTest", () => {
  let connection: AbstractAdapter;

  beforeEach(async () => {
    const dbConfig = Base.connectionDbConfig();
    await dbConfig.loadAdapter();
    connection = dbConfig.newConnection() as AbstractAdapter;
  });

  afterEach(async () => {
    await connection.disconnectBang();
  });

  it("can query", async () => {
    const result = await connection.selectAll("SELECT 1");
    expect(result.rows).toEqual([[1]]);
  });

  it.skip("async fallback", () => {});

  it("can throw away", async () => {
    connection.throwAwayBang();
    assertNot(await connection.active());
  });

  it("can close", async () => {
    await connection.close();
    assertNot(await connection.active());
  });
});
