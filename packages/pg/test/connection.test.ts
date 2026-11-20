import "@blazetrails/vitest-matchers";
import { TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PG } from "../lib/index.js";
import type { Connection } from "../lib/connection.js";

const ENV = TopLevel.ENV!;
const conninfo = {
  host: ENV["PGHOST"] ?? "localhost",
  port: ENV["PGPORT"] ?? "5432",
  user: ENV["PGUSER"],
  password: ENV["PGPASSWORD"],
  dbname: "activerecord_unittest",
};

const sleep = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

describe("PG::Connection", () => {
  let conn: Connection;

  beforeEach(async () => {
    conn = await PG.connect(conninfo);
    await conn.exec("BEGIN");
  });

  afterEach(async () => {
    if (conn.isFinished()) return;
    await conn.exec("ROLLBACK");
    await conn.finish();
  });

  it("supports explicitly calling #exec_params", async () => {
    await conn.exec("CREATE TABLE students ( name TEXT, age INTEGER )");
    await conn.execParams("INSERT INTO students VALUES( $1, $2 )", ["Wally", 8]);
    await conn.execParams("INSERT INTO students VALUES( $1, $2 )", ["Sally", 6]);
    await conn.execParams("INSERT INTO students VALUES( $1, $2 )", ["Dorothy", 4]);

    const res = await conn.execParams("SELECT name FROM students WHERE age >= $1", [6]);
    expect(res.values()).toEqual([["Wally"], ["Sally"]]);
  });

  it("can wait for NOTIFY events", async () => {
    await conn.exec("ROLLBACK");
    await conn.exec("LISTEN woo");

    const t = (async () => {
      const other = await PG.connect(conninfo);
      try {
        await sleep(0.1);
        await other.exec("NOTIFY woo");
      } finally {
        await other.finish();
      }
    })();

    expect(await conn.waitForNotify(10)).toBe("woo");
    await conn.exec("UNLISTEN woo");

    await t;
  });

  it("calls a block for NOTIFY events if one is given", async () => {
    await conn.exec("ROLLBACK");
    await conn.exec("LISTEN woo");

    const t = (async () => {
      const other = await PG.connect(conninfo);
      try {
        await sleep(0.1);
        await other.exec("NOTIFY woo");
      } finally {
        await other.finish();
      }
    })();

    let eventpid: number | null = null;
    let event: string | null = null;
    await conn.waitForNotify(10, (...args) => {
      [event, eventpid] = args;
    });
    expect(event).toBe("woo");
    expect(eventpid).toBeTypeOf("number");

    await conn.exec("UNLISTEN woo");

    await t;
  });

  it("doesn't collapse sequential notifications", async () => {
    await conn.exec("ROLLBACK");
    await conn.exec("LISTEN woo");
    await conn.exec("LISTEN war");
    await conn.exec("LISTEN woz");

    const other = await PG.connect(conninfo);
    try {
      await other.exec("NOTIFY woo");
      await other.exec("NOTIFY war");
      await other.exec("NOTIFY woz");
    } finally {
      await other.finish();
    }

    const channels: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      channels.push(await conn.waitForNotify(2));
    }

    expect(channels.length).toBe(3);
    expect(channels).toInclude("woo", "war", "woz");

    await conn.exec("UNLISTEN woz");
    await conn.exec("UNLISTEN war");
    await conn.exec("UNLISTEN woo");
  });

  it("returns notifications which are already in the queue before wait_for_notify is called ", async () => {
    await conn.exec("ROLLBACK");
    await conn.exec("LISTEN woo");

    const other = await PG.connect(conninfo);
    try {
      await other.exec("NOTIFY woo");
    } finally {
      await other.finish();
    }

    await conn.exec("SELECT 1");

    expect(await conn.waitForNotify(10)).toBe("woo");
    await conn.exec("UNLISTEN woo");
  });

  it("described_class#block should allow a timeout", async () => {
    conn.sendQuery("select pg_sleep(100)");

    const start = performance.now();
    const res = await conn.block(0.3);
    const finish = performance.now();
    await conn.cancel();

    expect(res).toBeFalsy();
    const elapsed = (finish - start) / 1000;
    expect(elapsed).toBeGreaterThan(0.2);
  });

  it("raises a rescue-able error if #finish is called twice", async () => {
    const c = await PG.connect(conninfo);

    await c.finish();
    const finish = c.finish();
    await expect(finish).rejects.toThrow(/connection is closed/i);
    await expect(finish).rejects.toMatchObject({ connection: c });
  });

  // BLOCKED: pg-result-type-map-defaults-to-strings-for-oids-with-no-coder
  it.skip("can use conn.reset to restart the connection", async () => {
    const c = await PG.connect(conninfo);

    const res = await c.reset();
    expect(res).toBe(c);

    expect((await c.exec("SELECT 1")).values()).toEqual([["1"]]);
    await c.close();
  });

  it("accepts nil as the timeout in #wait_for_notify ", async () => {
    await conn.exec("ROLLBACK");
    await conn.exec("LISTEN knees");

    const other = await PG.connect(conninfo);
    await other.exec("NOTIFY knees");
    await other.finish();

    let event: string | null = null;
    let pid: number | null = null;
    await conn.waitForNotify(null, (...args) => {
      [event, pid] = args;
    });
    await conn.exec("UNLISTEN knees");

    expect(event).toBe("knees");
    expect(pid).toBeTypeOf("number");
  });

  it("sends nil as the payload if the notification wasn't given one", async () => {
    await conn.exec("ROLLBACK");
    await conn.exec("LISTEN knees");

    const other = await PG.connect(conninfo);
    await other.exec("NOTIFY knees");
    await other.finish();

    let payload: unknown = "notnil";
    await conn.waitForNotify(null, (...args) => {
      payload = args[2];
    });
    await conn.exec("UNLISTEN knees");

    expect(payload).toBeNull();
  });
});
