import { beforeAll, describe, expect, it } from "vitest";
import "./index.js";
import { Base } from "./base.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { setupSecondPool } from "./test-helpers/setup-second-pool.js";
import { isSqliteRun } from "./test-helpers/sqlite-template.js";
import { Course } from "./test-helpers/models/course.js";
import { Entrant } from "./test-helpers/models/entrant.js";

// Ruby's Concurrent::Event: a one-shot latch with `set` / `wait`.
function event(): { set: () => void; wait: Promise<void> } {
  let set!: () => void;
  const wait = new Promise<void>((resolve) => {
    set = resolve;
  });
  return { set, wait };
}

// Rails runs this test against two real databases (arunit / arunit2) so
// Course and Entrant lease connections from distinct pools. Like
// MultipleDbTest, we reproduce the split with `setupSecondPool`, which only
// self-provisions on the sqlite run — hence the gate.
describe.skipIf(!isSqliteRun())("PreparedStatementStatusTest", () => {
  fixtures({}, { useTransactionalTests: false });
  beforeAll(async () => {
    await setupSecondPool();
  });

  it("prepared statement status is thread and instance specific", async () => {
    const courseConn = await Course.leaseConnection();
    const entrantConn = await Entrant.leaseConnection();

    const inside = event();
    const preventing = event();
    const finished = event();

    expect(courseConn).not.toBe(entrantConn);

    // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors Rails' inline `if ActiveRecord::Base.lease_connection.prepared_statements` branch
    if ((await Base.leaseConnection()).preparedStatements) {
      // Rails interleaves two Threads and relies on `unprepared_statement`
      // tracking the disabled set per *thread*: each thread sees the other
      // connection still prepared even while that connection sits inside its
      // own `unprepared_statement` block. Single-threaded JS has no
      // thread-local state — trails' `unpreparedStatement` flips the instance
      // flag — so the thread-specific half collapses: while both blocks are
      // live, both flags read false. We keep Rails' event-driven interleave
      // and assert the *instance*-specific half: each connection's block
      // never touches the other instance, and each flag is restored on exit
      // of its own block regardless of the other block still being live.
      const t1 = (async () => {
        await courseConn.unpreparedStatement(async () => {
          inside.set();
          await preventing.wait;
          expect(courseConn.preparedStatements).toBe(false);
          expect(entrantConn.preparedStatements).toBe(false);
        });
        // courseConn's exit restores its own flag; entrantConn is still
        // inside its block and stays off — instance isolation both ways.
        expect(courseConn.preparedStatements).toBe(true);
        expect(entrantConn.preparedStatements).toBe(false);
        finished.set();
      })();

      const t2 = (async () => {
        await inside.wait;
        await entrantConn.unpreparedStatement(async () => {
          expect(courseConn.preparedStatements).toBe(false);
          expect(entrantConn.preparedStatements).toBe(false);
          preventing.set();
          await finished.wait;
          expect(courseConn.preparedStatements).toBe(true);
          expect(entrantConn.preparedStatements).toBe(false);
        });
        expect(entrantConn.preparedStatements).toBe(true);
      })();

      await t1;
      await t2;
    } else {
      expect(courseConn.preparedStatements).toBe(false);
      expect(entrantConn.preparedStatements).toBe(false);
    }
  });
});
