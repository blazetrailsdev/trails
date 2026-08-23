/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/prepared_statements_disabled_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertNot } from "@blazetrails/activesupport";
import "../../index.js";
import { describeIfPg } from "./test-helper.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";
import { fixtures } from "../../test-fixtures.js";
import { Developer } from "../../test-helpers/models/developer.js";
import { Computer } from "../../test-helpers/models/computer.js";
import { developerFixtureData } from "../../test-helpers/fixtures/developers.js";

registerModel(Computer);

describeIfPg("PostgreSQLAdapter", () => {
  describe("PreparedStatementsDisabledTest", () => {
    // Rails `fixtures :developers`. Seeded through the inline `[Model, data]` map.
    // The canonical `developers` table (and the `computers_developers` join table
    // the `sharedComputers` label materializes) come from the template clone.
    const { developers } = fixtures({ developers: [Developer, developerFixtureData] });

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

    it("select query works even when prepared statements are disabled", async () => {
      assertNot(ps(Developer.connection).preparedStatements);

      const david = developers("david");

      const last = await Developer.where({ name: "David" }).last();
      expect(last?.id).toBe(david.id);
      expect(await Developer.count()).toBeGreaterThan(0);
    });
  });
});
