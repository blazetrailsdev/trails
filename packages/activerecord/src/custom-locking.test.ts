/**
 * Mirrors: activerecord/test/cases/custom_locking_test.rb
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { adapterType } from "./test-adapter.js";
import { Base } from "./base.js";
import { rebuildCanonicalTables } from "./support/canonical-schema.js";
import { fixtures } from "./test-fixtures.js";
import { Person } from "./test-helpers/models/person.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";

describe("CustomLockingTest", () => {
  const { people } = fixtures(["people"]);
  beforeAll(async () => {
    await rebuildCanonicalTables(Base.connection, ["people"]);
  });

  it.skipIf(adapterType !== "mysql")("custom lock", async () => {
    expect(Person.lock("LOCK IN SHARE MODE").toSql()).toMatch("SHARE MODE");
    await assertQueriesMatch(/LOCK IN SHARE MODE/, undefined, false, async () => {
      await Person.all().lock("LOCK IN SHARE MODE").find(people("michael").id);
    });
  });
});
