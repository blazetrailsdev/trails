/**
 * Mirrors Rails
 * activerecord/test/cases/adapters/abstract_mysql_adapter/count_deleted_rows_with_lock_test.rb
 */
import { describe, it, expect } from "vitest";
import { withExecutionContext } from "../../connection-adapters/abstract/connection-pool/execution-context.js";
import { describeIfMysqlAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Bulb } from "../../test-helpers/models/bulb.js";
import { Author } from "../../test-helpers/models/author.js";
// Rails' `require "models/car"` (count_deleted_rows_with_lock_test.rb:7) — Bulb
// `belongs_to :car`, so the constant has to be loaded before Bulb.createBang.
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
      await Bulb.createBang({ name: "Jimmy", color: "blue" });

      // Rails' `Thread.new` (count_deleted_rows_with_lock_test.rb:14-20).
      // `withExecutionContext` is the trails analogue: it sets the id the pool
      // keys leases on (connection_pool.rb:711 `connection_lease`), which plain
      // `IsolatedExecutionState.run` leaves unset. Both sides still land on the
      // one fixture-pinned connection, exactly as they do in Rails — this class
      // keeps transactional tests on (unlike NestedDeadlockTest), and Rails
      // shares the pinned connection across threads via `lock_thread`. Sharing
      // it is the point: the two statements contend on the same connection.
      const deleteThread = withExecutionContext(async () => Bulb.unscoped().deleteAll());
      const createThread = withExecutionContext(async () => Author.createBang({ name: "Tommy" }));

      const [deleteValue] = await Promise.all([deleteThread, createThread]);

      expect(deleteValue).toBe(1);
    });
  });
});
