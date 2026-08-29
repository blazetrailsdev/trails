import { describe, expect, it } from "vitest";
import "./index.js";
import { Base } from "./base.js";
import { StatementInvalid } from "./errors.js";
import { fixtures } from "./test-fixtures.js";
import { withSecondPool } from "./support/setup-second-pool.js";
import { ARUnit2Model } from "./test-helpers/models/arunit2-model.js";
import { Course } from "./test-helpers/models/course.js";
import { College } from "./test-helpers/models/college.js";
import { Entrant } from "./test-helpers/models/entrant.js";
import { Bird } from "./test-helpers/models/bird.js";

describe("MultipleDbTest", () => {
  fixtures({}, { useTransactionalTests: false });
  withSecondPool();

  const seedOpts = { useTransactionalTests: false } as const;
  const { colleges } = fixtures(["colleges"], {
    connection: () => College.connection,
    ...seedOpts,
  });
  const { courses } = fixtures(["courses"], { connection: () => Course.connection, ...seedOpts });
  const { entrants } = fixtures(
    {
      entrants: [
        Entrant,
        {
          first: { id: 1, course_id: 1, name: "Ruby Developer" },
          second: { id: 2, course_id: 1, name: "Ruby Guru" },
          third: { id: 3, course_id: 2, name: "Java Lover" },
        },
      ],
    },
    { connection: () => Entrant.connection, ...seedOpts },
  );

  it("connected", async () => {
    expect(await Entrant.leaseConnection()).toBeTruthy();
    expect(await Course.leaseConnection()).toBeTruthy();
  });

  it("proper connection", async () => {
    expect(await Entrant.leaseConnection()).not.toBe(await Course.leaseConnection());
    expect(await Entrant.leaseConnection()).toBe(await Entrant.retrieveConnection());
    expect(await Course.leaseConnection()).toBe(await Course.retrieveConnection());
    expect(await Base.leaseConnection()).toBe(await Entrant.leaseConnection());
  });

  it("swapping the connection", async () => {
    const oldSpecName = Course.connectionSpecificationName;
    Course.connectionSpecificationName = "ActiveRecord::Base";
    try {
      expect(await Entrant.leaseConnection()).toBe(await Course.leaseConnection());
    } finally {
      Course.connectionSpecificationName = oldSpecName;
    }
  });

  it("find", async () => {
    const c1 = courses("ruby");
    expect(c1.name).toBe("Ruby Development");
    const c2 = courses("java");
    expect(c2.name).toBe("Java Development");
    const e1 = entrants("first");
    expect(e1.name).toBe("Ruby Developer");
    const e2 = entrants("second");
    expect(e2.name).toBe("Ruby Guru");
    const e3 = entrants("third");
    expect(e3.name).toBe("Java Lover");
  });

  const entrantsOf = (course: InstanceType<typeof Course>) =>
    (course as unknown as { entrants: { count(): Promise<number> } }).entrants;

  it("associations", async () => {
    const c1 = courses("ruby");
    expect(await entrantsOf(c1).count()).toBe(2);
    const e1 = entrants("first");
    const e1Course = (await e1.association("course").loadTarget()) as InstanceType<typeof Course>;
    expect(e1Course.id).toBe(c1.id);
    const c2 = courses("java");
    expect(await entrantsOf(c2).count()).toBe(1);
    const e3 = entrants("third");
    const e3Course = (await e3.association("course").loadTarget()) as InstanceType<typeof Course>;
    expect(e3Course.id).toBe(c2.id);
  });

  it("course connection should survive reloads", async () => {
    expect(await Course.leaseConnection()).toBeTruthy();
    const reloaded = (await import("./test-helpers/models/course.js")).Course;
    expect(await reloaded.leaseConnection()).toBeTruthy();
  });

  it("transactions across databases", async () => {
    const c1 = courses("ruby");
    const e1 = entrants("first");

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
    } catch {}

    expect(c1.name).toBe("Typo");
    expect(e1.name).toBe("Typo");

    expect((await Course.find(1)).name).toBe("Ruby Development");
    expect((await Entrant.find(1)).name).toBe("Ruby Developer");
  });

  it("connection", async () => {
    expect(await Entrant.leaseConnection()).toBe(await Bird.leaseConnection());
    expect(await Entrant.leaseConnection()).not.toBe(await Course.leaseConnection());
  });

  it("count on custom connection", async () => {
    expect(await ARUnit2Model.leaseConnection()).toBe(await College.leaseConnection());
    expect(await Base.leaseConnection()).not.toBe(await College.leaseConnection());
    expect(await College.count()).toBe(1);
  });

  it("associations should work when model has no connection", async () => {
    const college = colleges("FIU") as unknown as {
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
    expect(error!.connectionPool).toBe(
      ((await Course.leaseConnection()) as { pool: unknown }).pool,
    );
  });

  it("exception contains correct pool", async () => {
    const courseConn = (await Course.leaseConnection()) as {
      pool: unknown;
      execute(sql: string): unknown;
    };
    const entrantConn = (await Entrant.leaseConnection()) as {
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
