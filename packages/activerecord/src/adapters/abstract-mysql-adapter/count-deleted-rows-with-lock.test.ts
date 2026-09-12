import { describe, it, expect } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import { describeIfMysqlAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Bulb } from "../../test-helpers/models/bulb.js";
import { Author } from "../../test-helpers/models/author.js";
import { Car } from "../../test-helpers/models/car.js";
import { registerModel } from "../../associations.js";

registerModel([Bulb, Author, Car]);

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
