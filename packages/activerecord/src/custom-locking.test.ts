/**
 * Mirrors: activerecord/test/cases/custom_locking_test.rb
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { adapterType } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Person } from "./test-helpers/models/person.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";

describe("CustomLockingTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  const { people } = useHandlerFixtures(["people"], { schema: canonicalSchema });
  beforeAll(async () => {
    await defineSchema({ people: canonicalSchema.people }, { dropExisting: true });
  });

  it.skipIf(adapterType !== "mysql")("custom lock", async () => {
    expect(Person.lock("LOCK IN SHARE MODE").toSql()).toMatch("SHARE MODE");
    await assertQueriesMatch(/LOCK IN SHARE MODE/, undefined, false, async () => {
      await Person.all().lock("LOCK IN SHARE MODE").find(people("michael").id);
    });
  });
});
