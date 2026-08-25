/**
 * Mirrors Rails
 * activerecord/test/cases/adapters/abstract_mysql_adapter/count_deleted_rows_with_lock_test.rb
 */
import { describe, it, expect } from "vitest";
import { IsolatedExecutionState } from "@blazetrails/activesupport";
import { describeIfMysqlAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Bulb } from "../../test-helpers/models/bulb.js";
import { Author } from "../../test-helpers/models/author.js";
// Rails' `require "models/car"` (count_deleted_rows_with_lock_test.rb:7) — Bulb
// `belongs_to :car`, so the constant has to be loaded before Bulb.create.
import { Car } from "../../test-helpers/models/car.js";
import { registerModel } from "../../associations.js";

// Rails' `require "models/..."` (count_deleted_rows_with_lock_test.rb:4-7) makes
// each constant resolvable; the trails equivalent is registering them.
registerModel([Bulb, Author, Car]);

describeIfMysqlAdapter("Mysql2Adapter", () => {
  describe("CountDeletedRowsWithLockTest", () => {
    fixtures([]);

    it("delete and create in different threads synchronize correctly", async () => {
      await Bulb.unscoped().deleteAll();
      await Bulb.create({ name: "Jimmy", color: "blue" });

      // Rails' `Thread.new` (count_deleted_rows_with_lock_test.rb:14-20).
      // `IsolatedExecutionState.run` is the trails analogue: it opens a fresh
      // execution context, which is what the connection pool leases per
      // (connection_pool.rb:711 `connection_lease`).
      const deleteThread = IsolatedExecutionState.run(async () => Bulb.unscoped().deleteAll());
      const createThread = IsolatedExecutionState.run(async () => Author.create({ name: "Tommy" }));

      const [deleteValue] = await Promise.all([deleteThread, createThread]);

      expect(deleteValue).toBe(1);
    });
  });
});
