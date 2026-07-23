import { beforeAll, describe, expect, it } from "vitest";
import { IsolatedExecutionState } from "@blazetrails/activesupport";
import "./index.js";
import { Base } from "./base.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { setupSecondPool } from "./test-helpers/setup-second-pool.js";
import { isSqliteRun } from "./test-helpers/sqlite-template.js";
import { Course } from "./test-helpers/models/course.js";
import { Entrant } from "./test-helpers/models/entrant.js";

function event(): { set: () => void; wait: Promise<void> } {
  let set!: () => void;
  const wait = new Promise<void>((resolve) => {
    set = resolve;
  });
  return { set, wait };
}

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

    // eslint-disable-next-line vitest/no-conditional-in-test
    if ((await Base.leaseConnection()).preparedStatements) {
      const t1 = IsolatedExecutionState.run(async () => {
        await courseConn.unpreparedStatement(async () => {
          inside.set();
          await preventing.wait;
          expect(courseConn.preparedStatements).toBe(false);
          expect(entrantConn.preparedStatements).toBe(true);
          finished.set();
        });
      });

      const t2 = IsolatedExecutionState.run(async () => {
        await entrantConn.unpreparedStatement(async () => {
          await inside.wait;
          expect(courseConn.preparedStatements).toBe(true);
          expect(entrantConn.preparedStatements).toBe(false);
          preventing.set();
          await finished.wait;
        });
      });

      await t1;
      await t2;
    } else {
      expect(courseConn.preparedStatements).toBe(false);
      expect(entrantConn.preparedStatements).toBe(false);
    }
  });
});
