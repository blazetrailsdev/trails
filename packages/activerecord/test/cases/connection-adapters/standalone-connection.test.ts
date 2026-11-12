import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertNot } from "@blazetrails/activesupport/testing/assertions";
import { Base } from "../../../lib/index.js";
import type { AbstractAdapter } from "../../../lib/connection-adapters/abstract-adapter.js";

describe("StandaloneConnectionTest", () => {
  let connection: AbstractAdapter;

  beforeEach(async () => {
    const dbConfig = Base.connectionDbConfig();
    dbConfig.validateBang();
    connection = dbConfig.newConnection() as AbstractAdapter;
  });

  afterEach(async () => {
    await connection.disconnectBang();
  });

  it("can query", async () => {
    const result = await connection.selectAll("SELECT 1");
    expect(result.rows).toEqual([[1]]);
  });

  it("async fallback", async () => {
    const result = await connection.selectAll("SELECT 1", null, [], { async: true });
    expect(result.rows).toEqual([[1]]);
  });

  it("can throw away", async () => {
    await connection.throwAwayBang();
    assertNot(await connection.active());
  });

  it("can close", async () => {
    await connection.close();
    assertNot(await connection.active());
  });
});
