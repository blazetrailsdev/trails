import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertNot } from "@blazetrails/activesupport/testing/assertions";
import "../../../../lib/index.js";
import { describeIfPg } from "../../../../lib/adapters/postgresql/test-helper.js";
import { Base } from "../../../../lib/base.js";
import { fixtures } from "../../../../lib/test-helpers/use-fixtures.js";
import { Developer } from "../../../models/developer.js";
import { Computer } from "../../../models/computer.js";
import { developerFixtureData } from "../../../fixtures/developers.js";

constSet(TopLevel, "Computer", Computer);

describeIfPg("PostgreSQLAdapter", () => {
  describe("PreparedStatementsDisabledTest", () => {
    const { developers } = fixtures({ developers: [Developer, developerFixtureData] });

    const ps = (a: unknown) => a as { preparedStatements: boolean };

    let originalPreparedStatements: boolean;
    beforeEach(async () => {
      originalPreparedStatements = ps(await Base.leaseConnection()).preparedStatements;
      ps(await Base.leaseConnection()).preparedStatements = false;
    });
    afterEach(async () => {
      ps(await Base.leaseConnection()).preparedStatements = originalPreparedStatements;
    });

    it("select query works even when prepared statements are disabled", async () => {
      assertNot(ps(await Developer.leaseConnection()).preparedStatements);

      const david = developers("david");

      const last = await Developer.where({ name: "David" }).last();
      expect(last?.id).toBe(david.id);
      expect(await Developer.count()).toBeGreaterThan(0);
    });
  });
});
