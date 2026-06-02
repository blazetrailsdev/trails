import { beforeAll, describe, expect, it } from "vitest";
import "./index.js";
import { Base } from "./base.js";
import { StatementInvalid } from "./errors.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { setupSecondPool } from "./test-helpers/setup-second-pool.js";
import { isSqliteRun } from "./test-helpers/sqlite-template.js";
import { ARUnit2Model } from "./test-helpers/models/arunit2-model.js";
import { Course } from "./test-helpers/models/course.js";
import { College } from "./test-helpers/models/college.js";
import { Entrant } from "./test-helpers/models/entrant.js";
import { Bird } from "./test-helpers/models/bird.js";

// Rails runs MultipleDbTest against two real databases (arunit / arunit2). We
// reproduce the split with a second in-memory SQLite pool on ARUnit2Model. The
// PG/MySQL suites don't provision a second named database, so gate to SQLite.
describe.skipIf(!isSqliteRun())("MultipleDbTest", () => {
  // Rails sets `self.use_transactional_tests = false`; setupHandlerSuite pins
  // the schema/fixtures across the file (skips the global per-test reset).
  setupHandlerSuite();
  beforeAll(async () => {
    await setupSecondPool();
  });

  it("connected", () => {
    expect(Entrant.leaseConnection()).toBeTruthy();
    expect(Course.leaseConnection()).toBeTruthy();
  });

  it("proper connection", () => {
    expect(Entrant.leaseConnection()).not.toBe(Course.leaseConnection());
    expect(Entrant.leaseConnection()).toBe(Entrant.retrieveConnection());
    expect(Course.leaseConnection()).toBe(Course.retrieveConnection());
    expect(Base.leaseConnection()).toBe(Entrant.leaseConnection());
  });

  it("swapping the connection", () => {
    const oldSpecName = Course.connectionSpecificationName;
    Course.connectionSpecificationName = "Base";
    try {
      expect(Entrant.leaseConnection()).toBe(Course.leaseConnection());
    } finally {
      Course.connectionSpecificationName = oldSpecName;
    }
  });

  it("find", async () => {
    const c1 = await Course.find(1);
    expect(c1.name).toBe("Ruby Development");
    const c2 = await Course.find(2);
    expect(c2.name).toBe("Java Development");
    const e1 = await Entrant.find(1);
    expect(e1.name).toBe("Ruby Developer");
    const e2 = await Entrant.find(2);
    expect(e2.name).toBe("Ruby Guru");
    const e3 = await Entrant.find(3);
    expect(e3.name).toBe("Java Lover");
  });

  const entrantsOf = (course: InstanceType<typeof Course>) =>
    (course as unknown as { entrants: { count(): Promise<number> } }).entrants;

  it("associations", async () => {
    const c1 = await Course.find(1);
    expect(await entrantsOf(c1).count()).toBe(2);
    const e1 = await Entrant.find(1);
    const e1Course = (await e1.association("course").loadTarget()) as InstanceType<typeof Course>;
    expect(e1Course.id).toBe(c1.id);
    const c2 = await Course.find(2);
    expect(await entrantsOf(c2).count()).toBe(1);
    const e3 = await Entrant.find(3);
    const e3Course = (await e3.association("course").loadTarget()) as InstanceType<typeof Course>;
    expect(e3Course.id).toBe(c2.id);
  });

  it("course connection should survive reloads", async () => {
    // Rails removes the Course constant and `load`s models/course.rb again, then
    // re-checks the connection. ESM can't hot-reload a module, so a re-import
    // returns the same cached `Course` class — this asserts the connection still
    // resolves through ARUnit2Model rather than a literal reload.
    expect(Course.leaseConnection()).toBeTruthy();
    const reloaded = (await import("./test-helpers/models/course.js")).Course;
    expect(reloaded.leaseConnection()).toBeTruthy();
  });

  it("transactions across databases", async () => {
    const c1 = await Course.find(1);
    const e1 = await Entrant.find(1);

    try {
      await Course.transaction(async () => {
        await Entrant.transaction(async () => {
          c1.name = "Typo";
          e1.name = "Typo";
          await c1.save();
          await e1.save();
          throw new Error("No I messed up.");
        });
      });
    } catch {
      // Yup caught it
    }

    expect(c1.name).toBe("Typo");
    expect(e1.name).toBe("Typo");

    expect((await Course.find(1)).name).toBe("Ruby Development");
    expect((await Entrant.find(1)).name).toBe("Ruby Developer");
  });

  it("connection", () => {
    expect(Entrant.leaseConnection()).toBe(Bird.leaseConnection());
    expect(Entrant.leaseConnection()).not.toBe(Course.leaseConnection());
  });

  // Rails guards these two with `unless in_memory_db?` (multiple_db_test.rb): its
  // in-memory harness can't give arunit2 a genuinely separate pool, so College
  // would resolve to Base's connection. setupSecondPool establishes an explicitly
  // independent arunit2 pool (its own `:memory:` DB), so the assertions hold and we
  // run them. This differs from the primary-class pair, which stay skipped because
  // `connects_to(arunit/arunit)` is *expected* to share Base's connection — which
  // independent in-memory DBs can't do.
  it("count on custom connection", async () => {
    expect(ARUnit2Model.leaseConnection()).toBe(College.leaseConnection());
    expect(Base.leaseConnection()).not.toBe(College.leaseConnection());
    expect(await College.count()).toBe(1);
  });

  it("associations should work when model has no connection", async () => {
    const college = (await College.first()) as unknown as {
      courses: { first(): Promise<unknown> };
    };
    await expect(college.courses.first()).resolves.not.toThrow();
  });

  it("exception contains connection pool", async () => {
    let error: StatementInvalid | undefined;
    try {
      await Course.where({ wrong_column: "wrong" }).firstBang();
    } catch (e) {
      error = e as StatementInvalid;
    }
    expect(error).toBeInstanceOf(StatementInvalid);
    expect(error!.connectionPool).toBe((Course.leaseConnection() as { pool: unknown }).pool);
  });

  it("exception contains correct pool", async () => {
    const courseConn = Course.leaseConnection() as { pool: unknown; execute(sql: string): unknown };
    const entrantConn = Entrant.leaseConnection() as {
      pool: unknown;
      execute(sql: string): unknown;
    };

    expect(courseConn).not.toBe(entrantConn);

    let courseError: StatementInvalid | undefined;
    try {
      await courseConn.execute("SELECT * FROM entrants");
    } catch (e) {
      courseError = e as StatementInvalid;
    }
    expect(courseError!.connectionPool).toBe(courseConn.pool);

    let entrantError: StatementInvalid | undefined;
    try {
      await entrantConn.execute("SELECT * FROM courses");
    } catch (e) {
      entrantError = e as StatementInvalid;
    }
    expect(entrantError!.connectionPool).toBe(entrantConn.pool);
  });
});
