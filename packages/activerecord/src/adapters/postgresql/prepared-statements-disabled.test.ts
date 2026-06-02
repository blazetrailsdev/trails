/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/prepared_statements_disabled_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../../index.js";
import { describeIfPg } from "./test-helper.js";
import { Base } from "../../base.js";
import { useHandlerFixtures } from "../../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../../test-helpers/test-schema.js";
import { Developer } from "../../test-helpers/models/developer.js";
import { developerFixtureData } from "../../test-helpers/fixtures/developers.js";

describeIfPg("PostgreSQLAdapter", () => {
  describe("PreparedStatementsDisabledTest", () => {
    // Rails `fixtures :developers`. The `developers` set isn't in the shared
    // registry yet (its HABTM `shared_computers` ref blocks the by-name path),
    // so seed it through the inline `[Model, data]` map. `schema` recreates the
    // canonical `developers` table so the shared Developer model resolves
    // regardless of any bespoke schema a sibling file left in the worker DB.
    const { developers } = useHandlerFixtures(
      { developers: [Developer, developerFixtureData] },
      { schema: canonicalSchema },
    );

    // `preparedStatements` lives on AbstractAdapter but isn't on the
    // `DatabaseAdapter` interface that `connection` is typed as.
    const ps = (a: unknown) => a as { preparedStatements: boolean };

    // Mirrors Rails' setup/teardown swap to the
    // `arunit_without_prepared_statements` connection: disable prepared
    // statements on the handler connection for the duration of each test.
    let originalPreparedStatements: boolean;
    beforeEach(() => {
      originalPreparedStatements = ps(Base.connection).preparedStatements;
      ps(Base.connection).preparedStatements = false;
    });
    afterEach(() => {
      ps(Base.connection).preparedStatements = originalPreparedStatements;
    });

    it("prepared statements disabled", () => {
      expect(ps(Developer.connection).preparedStatements).toBe(false);
    });

    it("select query works even when prepared statements are disabled", async () => {
      expect(ps(Developer.connection).preparedStatements).toBe(false);

      const david = developers("david");

      const last = await Developer.where({ name: "David" }).last(); // With Binds
      expect(last?.id).toBe(david.id);
      expect(await Developer.count()).toBeGreaterThan(0); // Without Binds
    });
  });
});
