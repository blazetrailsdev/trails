import { describe, it, expect } from "vitest";
import { Base } from "./base.js";
import { fixtures } from "./test-fixtures.js";

async function returnTheInsertedId(method: "insert" | "create"): Promise<unknown> {
  const connection = await Base.leaseConnection();
  return connection[method]("INSERT INTO accounts (firm_id,credit_limit) VALUES (42,5000)");
}

describe("DatabaseStatementsTest", () => {
  fixtures({});

  it("insert should return the inserted id", async () => {
    expect(await returnTheInsertedId("insert")).not.toBeNull();
  });
  it("create should return the inserted id", async () => {
    expect(await returnTheInsertedId("create")).not.toBeNull();
  });
});
