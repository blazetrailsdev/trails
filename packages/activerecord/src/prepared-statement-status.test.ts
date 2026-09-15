import { Thread } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import "./index.js";
import { Base } from "./base.js";
import { fixtures } from "./test-fixtures.js";
import { withSecondPool } from "./support/setup-second-pool.js";
import { Course } from "./test-helpers/models/course.js";
import { Entrant } from "./test-helpers/models/entrant.js";

function event(): { set: () => void; wait: Promise<void> } {
  let set!: () => void;
  const wait = new Promise<void>((resolve) => {
    set = resolve;
  });
  return { set, wait };
}

describe("PreparedStatementStatusTest", () => {
  fixtures({}, { useTransactionalTests: false });
  withSecondPool();

  it("prepared statement status is thread and instance specific", async () => {
    const courseConn = await Course.leaseConnection();
    const entrantConn = await Entrant.leaseConnection();

    const inside = event();
    const preventing = event();
    const finished = event();

    expect(courseConn).not.toBe(entrantConn);

    // eslint-disable-next-line blazetrails/no-conditional-in-test
    if ((await Base.leaseConnection()).preparedStatements) {
      const t1 = new Thread(async () => {
        await courseConn.unpreparedStatement(async () => {
          inside.set();
          await preventing.wait;
          expect(courseConn.preparedStatements).toBe(false);
          expect(entrantConn.preparedStatements).toBe(true);
          finished.set();
        });
      }).value();

      const t2 = new Thread(async () => {
        await entrantConn.unpreparedStatement(async () => {
          await inside.wait;
          expect(courseConn.preparedStatements).toBe(true);
          expect(entrantConn.preparedStatements).toBe(false);
          preventing.set();
          await finished.wait;
        });
      }).value();

      await t1;
      await t2;
    } else {
      expect(courseConn.preparedStatements).toBe(false);
      expect(entrantConn.preparedStatements).toBe(false);
    }
  });
});
