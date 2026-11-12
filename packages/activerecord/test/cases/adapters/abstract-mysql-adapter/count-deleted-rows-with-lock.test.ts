import { describe, it, expect } from "vitest";
import { Thread, constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describeIfMysqlAdapter } from "../../../../lib/adapters/abstract-mysql-adapter/test-helper.js";
import { fixtures } from "../../../../lib/test-helpers/use-fixtures.js";
import { Bulb } from "../../../models/bulb.js";
import { Author } from "../../../models/author.js";
import { Car } from "../../../models/car.js";

constSet(TopLevel, "Bulb", Bulb);
constSet(TopLevel, "Author", Author);
constSet(TopLevel, "Car", Car);

describeIfMysqlAdapter("Mysql2Adapter", () => {
  describe("CountDeletedRowsWithLockTest", () => {
    fixtures([]);

    it("delete and create in different threads synchronize correctly", async () => {
      await Bulb.unscoped().deleteAll();
      await Bulb.createBang({ name: "Jimmy", color: "blue" });

      const deleteThread = new Thread(async () => Bulb.unscoped().deleteAll()).value();
      const createThread = new Thread(async () => Author.createBang({ name: "Tommy" })).value();

      const [deleteValue] = await Promise.all([deleteThread, createThread]);

      expect(deleteValue).toBe(1);
    });
  });
});
