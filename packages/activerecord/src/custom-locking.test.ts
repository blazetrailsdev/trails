import { describe, it, expect } from "vitest";
import { adapterType } from "./test-adapter.js";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Person } from "./test-helpers/models/person.js";

describe("CustomLockingTest", () => {
  const { self, people } = fixtures(["people"]);
  it.skipIf(adapterType !== "mysql")("custom lock", async () => {
    expect(Person.lock("LOCK IN SHARE MODE").toSql()).toMatch("SHARE MODE");
    await self().assertQueriesMatch(/LOCK IN SHARE MODE/, {}, async () => {
      await Person.all().lock("LOCK IN SHARE MODE").find(people("michael").id);
    });
  });
});
