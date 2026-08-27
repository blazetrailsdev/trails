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
    const { developers } = fixtures({ developers: [Developer, developerFixtureData] });

    const ps = (a: unknown) => a as { preparedStatements: boolean };

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
