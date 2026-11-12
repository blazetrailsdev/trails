import { describe, it, expect } from "vitest";
import { adapterType } from "../support/test-adapter.js";
import { fixtures } from "../support/use-fixtures.js";
import { Person } from "../models/person.js";

describe("CustomLockingTest", () => {
  const { self, people } = fixtures(["people"]);
  it.skipIf(adapterType !== "mysql")("custom lock", async () => {
    expect(Person.lock("LOCK IN SHARE MODE").toSql()).toMatch("SHARE MODE");
    await self().assertQueriesMatch(/LOCK IN SHARE MODE/, {}, async () => {
      await Person.all().lock("LOCK IN SHARE MODE").find(people("michael").id);
    });
  });
});
