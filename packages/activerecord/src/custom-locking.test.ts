import { describe, it, expect } from "vitest";
import { adapterType } from "./test-adapter.js";
import { fixtures } from "./test-fixtures.js";
import { Person } from "./test-helpers/models/person.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";

describe("CustomLockingTest", () => {
  const { people } = fixtures(["people"]);
  it.skipIf(adapterType !== "mysql")("custom lock", async () => {
    expect(Person.lock("LOCK IN SHARE MODE").toSql()).toMatch("SHARE MODE");
    await assertQueriesMatch(/LOCK IN SHARE MODE/, undefined, false, async () => {
      await Person.all().lock("LOCK IN SHARE MODE").find(people("michael").id);
    });
  });
});
