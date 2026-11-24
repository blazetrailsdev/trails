import "@blazetrails/vitest-matchers";
import { TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PG } from "../lib/index.js";
import type { Connection } from "../lib/connection.js";
import type { Result } from "../lib/result.js";

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

  it("#get_result should send remaining data before waiting", async () => {
    const str = "abcd".repeat(2000) + "\n";
    await conn.exec("CREATE TEMP TABLE copytable2 (col1 TEXT)");
    conn.sendQuery("COPY copytable2 FROM STDOUT");
    expect((await conn.getLastResult())!.resultStatus()).toBe(PG.PGRES_COPY_IN);

    for (let i = 0; i < 1000; i++) {
      conn.syncPutCopyData(str);
    }
    conn.syncPutCopyEnd();
    const res = await conn.getLastResult();
    expect(res!.resultStatus()).toBe(PG.PGRES_COMMAND_OK);
    await conn.exec("DROP TABLE IF EXISTS copytable2");
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
    expect(elapsed).toBeBetween(0.2, 99, "exclusive");
  });

  it("raises a rescue-able error if #finish is called twice", async () => {
    const c = await PG.connect(conninfo);

    await c.finish();
    const finish = c.finish();
    await expect(finish).rejects.toThrow(/connection is closed/i);
    await expect(finish).rejects.toMatchObject({ connection: c });
  });

  it("can use conn.reset to restart the connection", async () => {
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

  it("should convert strings to #close_prepared", async () => {
    await conn.prepare("weiß5", "VALUES(123)");
    const r = await conn.closePrepared("weiß5");
    expect(r.nfields()).toBe(0);
    await conn.prepare("weiß5", "VALUES(123)");
    await conn.closePrepared("weiß5");
  });

  it("should convert strings to #close_portal", async () => {
    await conn.exec("DECLARE cörsör5 CURSOR FOR VALUES(1,2,3)");
    const r = await conn.closePortal("cörsör5");
    expect(r.nfields()).toBe(0);
    await conn.exec("DECLARE cörsör5 CURSOR FOR VALUES(1,2,3)");
    await conn.closePortal("cörsör5");
  });

  describe("server_version", () => {
    it("should retrieve the server version", () => {
      expect(conn.serverVersion()).toBeGreaterThanOrEqual(100000);
    });

    it("should raise an error on a bad connection", async () => {
      const conn = await PG.connect(conninfo);
      await conn.finish();
      expect(() => conn.serverVersion()).toThrow(PG.ConnectionBad);
    });
  });

  describe("protocol_version", () => {
    it("should retrieve the wrie protocol version", () => {
      expect(conn.protocolVersion()).toBe(3);
    });

    it("should raise an error on a bad connection", async () => {
      const conn = await PG.connect(conninfo);
      await conn.finish();
      expect(() => conn.protocolVersion()).toThrow(PG.ConnectionBad);
    });
  });

  describe("#inspect", () => {
    beforeEach(async () => {
      await conn.exec("ROLLBACK");
    });

    afterEach(async () => {
      if (conn.isFinished()) return;
      await conn.getLastResult();
      await conn.exec("BEGIN");
    });

    it("should print host, port and user of a fresh connection, but not more", () => {
      expect(conn.inspect()).toMatch(
        new RegExp(`<PG::Connection:[0-9a-fx]+ host=localhost port=${conninfo.port} user=\\w*>`),
      );
    });

    it("should tell about finished connection", async () => {
      const conn = await PG.connect(conninfo);
      await conn.finish();
      expect(conn.inspect()).toMatch(/<PG::Connection:[0-9a-fx]+ finished>/);
    });

    it("should tell about pipeline mode", () => {
      conn.enterPipelineMode();
      expect(conn.inspect()).toMatch(/ pipeline_status=PQ_PIPELINE_ON/);
    });

    it("should tell about transaction_status", () => {
      conn.sendQuery("select 8");
      expect(conn.inspect()).toMatch(/ transaction_status=PQTRANS_ACTIVE/);
    });

    it("should tell about nonblocking mode", () => {
      conn.setnonblocking(true);
      expect(conn.inspect()).toMatch(/ nonblocking=true/);
      conn.setnonblocking(false);
    });

    it("should tell about non UTF8 client encoding", async () => {
      await conn.setClientEncoding("ISO-8859-1");
      expect(conn.inspect()).toMatch(/ client_encoding=LATIN1/);
    });
  });

  describe("in nonblocking mode", () => {
    afterEach(() => {
      conn.setnonblocking(false);
    });

    it("defaults to blocking", () => {
      expect(conn.isnonblocking()).toBe(false);
      expect(conn.isNonblocking()).toBe(false);
    });

    it("can set nonblocking", () => {
      expect(conn.setnonblocking(true)).toBeNull();
      expect(conn.isnonblocking()).toBe(true);
      expect(conn.isNonblocking()).toBe(true);

      expect(conn.setnonblocking(false)).toBeNull();
      expect(conn.isnonblocking()).toBe(false);
      expect(conn.isNonblocking()).toBe(false);
    });

    it("sets nonblocking for the connection only", async () => {
      const co2 = await PG.connect(conninfo);
      expect(co2.setnonblocking(true)).toBeNull();
      expect(co2.isnonblocking()).toBe(true);
      expect(conn.isnonblocking()).toBe(false);
      await co2.finish();
    });
  });

  describe("set_chunked_rows_mode", () => {
    it("raises an error when called at the wrong time", () => {
      let err: unknown;
      try {
        conn.setChunkedRowsMode(2);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(PG.Error);
      expect((err as Error).message).toMatch(/PQsetChunkedRowsMode/);
      expect(err).toMatchObject({ connection: conn });
    });

    it("raises an error when called with wrong arguments", () => {
      expect(() => conn.setChunkedRowsMode("nonint")).toThrow(TypeError);
      expect(() => conn.setChunkedRowsMode(0)).toThrow(/PQsetChunkedRowsMode/);
      expect(() => conn.setChunkedRowsMode(-2)).toThrow(PG.Error);
    });

    it("should work in chunked rows mode", async () => {
      conn.sendQuery("SELECT generate_series(1,12)");
      conn.setChunkedRowsMode(3);

      const results = [];
      for (;;) {
        await conn.block();
        const res = await conn.getResult();
        if (res == null) break;
        results.push(res);
      }
      expect(results.length).toBe(5);
      for (const res of results.slice(0, -1)) {
        expect(res.resultStatus()).toBe(PG.PGRES_TUPLES_CHUNK);
        const values = res.fieldValues("generate_series");
        expect(values.length).toBe(3);
        expect(Number(values[0])).toBeGreaterThan(0);
      }
      expect(results.at(-1)!.resultStatus()).toBe(PG.PGRES_TUPLES_OK);
      expect(results.at(-1)!.ntuples()).toBe(0);
    });

    it("should receive rows before entire query is finished", async () => {
      conn.sendQuery("SELECT generate_series(0,999), NULL UNION ALL SELECT 1000, pg_sleep(10);");
      conn.setChunkedRowsMode(4);

      const startTime = performance.now();
      const res = (await conn.getResult())!;
      res.check();

      expect((performance.now() - startTime) / 1000).toBeLessThan(9);
      expect(res.values()).toEqual([
        ["0", null],
        ["1", null],
        ["2", null],
        ["3", null],
      ]);
      await conn.cancel();
    });

    it("should receive rows before entire query fails", async () => {
      await conn.exec(
        "CREATE FUNCTION errfunc() RETURNS int AS $$ BEGIN RAISE 'test-error'; END; $$ LANGUAGE plpgsql;",
      );
      conn.sendQuery("SELECT generate_series(0,999), NULL UNION ALL SELECT 1000, errfunc();");
      conn.setChunkedRowsMode(5);

      let firstResult: Result | null = null;
      let err: unknown;
      try {
        for (;;) {
          const res = await conn.getResult();
          if (res == null) break;
          res.check();
          firstResult ??= res;
        }
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(PG.Error);
      expect(err).toMatchObject({ connection: conn });
      expect(firstResult instanceof PG.Result).toBeTruthy();
      expect(firstResult!.resultStatus()).toBe(PG.PGRES_TUPLES_CHUNK);
    });
  });

  describe("pipeline mode", () => {
    const raised = async (fn: () => unknown): Promise<unknown> => {
      try {
        await fn();
      } catch (e) {
        return e;
      }
      return undefined;
    };

    describe("pipeline_status", () => {
      it("can enter and exit the pipeline mode", () => {
        conn.enterPipelineMode();
        expect(conn.pipelineStatus()).toBe(PG.PQ_PIPELINE_ON);
        conn.exitPipelineMode();
        expect(conn.pipelineStatus()).toBe(PG.PQ_PIPELINE_OFF);
      });
    });

    describe("enter_pipeline_mode", () => {
      it("does nothing if already in pipeline mode", () => {
        conn.enterPipelineMode();
        conn.enterPipelineMode();
        expect(conn.pipelineStatus()).toBe(PG.PQ_PIPELINE_ON);
      });

      it("raises an error when called with pending results", async () => {
        conn.sendQueryParams("select 1", []);
        const err = await raised(() => conn.enterPipelineMode());
        expect(err).toBeInstanceOf(PG.Error);
        expect(err).toMatchObject({ connection: conn });
        await conn.getLastResult();
      });
    });

    describe("exit_pipeline_mode", () => {
      it("does nothing if not in pipeline mode", () => {
        conn.exitPipelineMode();
        expect(conn.pipelineStatus()).toBe(PG.PQ_PIPELINE_OFF);
      });

      it("raises an error when called with pending results", async () => {
        conn.enterPipelineMode();
        conn.sendQueryParams("select 1", []);
        const err = await raised(() => conn.exitPipelineMode());
        expect(err).toBeInstanceOf(PG.Error);
        expect(err).toMatchObject({ connection: conn });
        conn.pipelineSync();
        await conn.getLastResult();
      });
    });

    describe("pipeline_sync", () => {
      it("sends a sync message", async () => {
        conn.enterPipelineMode();
        conn.sendQueryParams("select 6", []);
        conn.pipelineSync();
        expect((await conn.getResult())!.resultStatus()).toBe(PG.PGRES_TUPLES_OK);
        expect(await conn.getResult()).toBeNull();
        expect((await conn.getResult())!.resultStatus()).toBe(PG.PGRES_PIPELINE_SYNC);
        expect(await conn.getResult()).toBeNull();
        expect(await conn.getResult()).toBeNull();
        conn.exitPipelineMode();
      });

      it("raises an error when not in pipeline mode", () => {
        let err: unknown;
        try {
          conn.pipelineSync();
        } catch (e) {
          err = e;
        }
        expect(err).toBeInstanceOf(PG.Error);
        expect(err).toMatchObject({ connection: conn });
      });

      it("has send_pipeline_sync method", () => {
        expect(typeof conn.sendPipelineSync).toBe("function");
        expect(typeof conn.asyncPipelineSync).toBe("function");
      });
    });

    describe("send_flush_request", () => {
      it("flushes all results", async () => {
        conn.enterPipelineMode();
        conn.sendQueryParams("select 1", []);
        conn.sendFlushRequest();
        conn.flush();
        expect((await conn.getResult())!.resultStatus()).toBe(PG.PGRES_TUPLES_OK);
        expect(await conn.getResult()).toBeNull();
        expect(await conn.getResult()).toBeNull();
      });

      it("raises an error when called with pending results", async () => {
        conn.sendQueryParams("select 1", []);
        let err: unknown;
        try {
          conn.sendFlushRequest();
        } catch (e) {
          err = e;
        }
        expect(err).toBeInstanceOf(PG.Error);
        expect(err).toMatchObject({ connection: conn });
        await conn.getLastResult();
      });
    });

    describe("get_last_result", () => {
      it("delivers PGRES_PIPELINE_SYNC", async () => {
        conn.enterPipelineMode();
        conn.sendQueryParams("select 6", []);
        conn.pipelineSync();
        expect((await conn.getLastResult())!.values()).toEqual([["6"]]);
        expect((await conn.getLastResult())!.resultStatus()).toBe(PG.PGRES_PIPELINE_SYNC);
        conn.exitPipelineMode();
      });

      it("raises an error for PGRES_PIPELINE_ABORT", async () => {
        conn.enterPipelineMode();
        conn.sendQueryParams("garbage", []);
        conn.sendQueryParams("SELECT 7", []);
        conn.pipelineSync();
        let err1: InstanceType<typeof PG.Error> | undefined;
        try {
          await conn.getLastResult();
        } catch (e) {
          if (!(e instanceof PG.SyntaxError)) throw e;
          err1 = e;
        }
        expect(err1!.result!.resultStatus()).toBe(PG.PGRES_FATAL_ERROR);
        let err2: InstanceType<typeof PG.Error> | undefined;
        try {
          await conn.getLastResult();
        } catch (e) {
          if (!(e instanceof PG.UnableToSend)) throw e;
          err2 = e;
        }
        expect(err2!.result!.resultStatus()).toBe(PG.PGRES_PIPELINE_ABORTED);
        expect(conn.pipelineStatus()).toBe(PG.PQ_PIPELINE_ABORTED);
        expect((await conn.getLastResult())!.resultStatus()).toBe(PG.PGRES_PIPELINE_SYNC);
        conn.exitPipelineMode();
      });
    });
  });
});

describe("PG::Connection#conninfo_parse", () => {
  const described_class = PG.Connection;
  const toHash = (ar: { keyword: string; val: string | null }[]): Record<string, string> =>
    Object.fromEntries(ar.filter((h) => h.val != null).map((h) => [h.keyword, h.val!]));

  it("encode and decode Hash to connection string to Hash", () => {
    const hash = {
      host: "pgsql.example.com",
      dbname: "db01",
      sslmode: "require",
      service: "",
      password: "\\ \t\n\"'",
    };
    const optstring = described_class.connectHashToString(hash);
    const res = toHash(described_class.conninfoParse(optstring));

    expect(res).toEqual(hash);
  });

  it("decode option string to Hash", () => {
    const optstring = "host=overwritten host=c:\\\\pipe password = \\\\\\'\"  ";
    const res = toHash(described_class.conninfoParse(optstring));

    expect(res).toEqual({ host: "c:\\pipe", password: "\\'\"" });
  });

  it("can parse connection info strings kind of key=value", () => {
    const ar = PG.Connection.conninfoParse("user=auser  host=somehost  port=3334 dbname=db");
    expect(ar).toBeInstanceOf(Array);
    expect(typeof ar[0]).toBe("object");
    expect(ar.map((a) => a.keyword)).toEqual(
      expect.arrayContaining(["dbname", "user", "password", "port"]),
    );
    expect(ar.map((a) => a.val)).toEqual(
      expect.arrayContaining(["auser", "somehost", "3334", "db"]),
    );
  });

  it("can parse connection info strings kind of URI", () => {
    const ar = PG.Connection.conninfoParse("postgresql://auser@somehost:3334/db");
    expect(ar).toBeInstanceOf(Array);
    expect(typeof ar[0]).toBe("object");
    expect(ar.map((a) => a.keyword)).toEqual(
      expect.arrayContaining(["dbname", "user", "password", "port"]),
    );
    expect(ar.map((a) => a.val)).toEqual(
      expect.arrayContaining(["auser", "somehost", "3334", "db"]),
    );
  });

  it("can parse connection info strings with error", () => {
    expect(() => PG.Connection.conninfoParse("host='abc")).toThrow(/unterminated quoted string/);
    expect(() => PG.Connection.conninfoParse("host='abc")).toThrow(PG.Error);
    expect(() => PG.Connection.conninfoParse("host")).toThrow(/missing "=" after/);
  });
});

describe("PG::Connection#parse_connect_args", () => {
  const described_class = PG.Connection;

  it("shouldn't resolve absolute path in connection option string", () => {
    const optstring = described_class.parseConnectArgs({ host: "/var/socket" });
    expect(optstring).toMatch(/(^|\s)host='\/var\/socket'/);
    expect(optstring).not.toMatch(/hostaddr/);
  });

  it("can create a connection option string from a Hash parameter", () => {
    const optstring = described_class.parseConnectArgs({
      host: "pgsql.example.com",
      dbname: "db01",
      sslmode: "require",
      hostaddr: "1.2.3.4",
    });

    expect(typeof optstring).toBe("string");
    expect(optstring).toMatch(/(^|\s)host='pgsql.example.com'/);
    expect(optstring).toMatch(/(^|\s)dbname='db01'/);
    expect(optstring).toMatch(/(^|\s)sslmode='require'/);
    expect(optstring).toMatch(/(^|\s)hostaddr='1.2.3.4'/);
  });

  it("can create a connection option string from positional parameters", () => {
    const optstring = described_class.parseConnectArgs(
      "localhost",
      null,
      "-c geqo=off",
      null,
      "sales",
    );

    expect(typeof optstring).toBe("string");
    expect(optstring).toMatch(/(^|\s)host='localhost'/);
    expect(optstring).toMatch(/(^|\s)dbname='sales'/);
    expect(optstring).toMatch(/(^|\s)options='-c geqo=off'/);

    expect(optstring).not.toMatch(/port=/);
    expect(optstring).not.toMatch(/tty=/);
  });

  it("can create a connection option string from a mix of positional and hash parameters", () => {
    const optstring = described_class.parseConnectArgs("pgsql.example.com", {
      dbname: "licensing",
      user: "jrandom",
      hostaddr: "1.2.3.4",
    });

    expect(typeof optstring).toBe("string");
    expect(optstring).toMatch(/(^|\s)host='pgsql.example.com'/);
    expect(optstring).toMatch(/(^|\s)dbname='licensing'/);
    expect(optstring).toMatch(/(^|\s)user='jrandom'/);
    expect(optstring).toMatch(/(^|\s)hostaddr='1.2.3.4'/);
  });

  it("can create a connection option string from an option string and a hash", () => {
    const optstring = described_class.parseConnectArgs("dbname=original", {
      user: "jrandom",
      host: "www.ruby-lang.org,nonexisting-domaiiin.xyz,localhost",
    });

    expect(typeof optstring).toBe("string");
    expect(optstring).toMatch(/(^|\s)dbname='original'/);
    expect(optstring).toMatch(/(^|\s)user='jrandom'/);
  });

  it("escapes single quotes and backslashes in connection parameters", () => {
    expect(described_class.parseConnectArgs({ password: "DB 'browser' \\" })).toMatch(
      /password='DB \\'browser\\' \\\\'/,
    );
  });

  const uri = "postgresql://user:pass@pgsql.example.com:222/db01?sslmode=require&hostaddr=4.3.2.1";

  it("accepts an URI string", () => {
    const string = described_class.parseConnectArgs(uri);

    expect(typeof string).toBe("string");
    expect(string).toMatch(
      /^user='user' password='pass' dbname='db01' host='pgsql.example.com' hostaddr='4.3.2.1' port='222' sslmode='require' fallback_application_name/,
    );
  });

  it("accepts an URI and adds parameters from hash", () => {
    const string = described_class.parseConnectArgs(uri + "&fallback_application_name=testapp", {
      connectTimeout: 2,
    });

    expect(typeof string).toBe("string");
    expect(string).toMatch(
      /^user='user' password='pass' dbname='db01' host='pgsql.example.com' hostaddr='4.3.2.1' port='222' fallback_application_name='testapp' sslmode='require' connect_timeout='2'/,
    );
  });

  it("accepts an URI with a non-standard domain socket directory", () => {
    let string = described_class.parseConnectArgs("postgresql://%2Fvar%2Flib%2Fpostgresql/dbname");

    expect(typeof string).toBe("string");
    expect(string).toMatch(/^dbname='dbname' host='\/var\/lib\/postgresql'/);

    string = described_class.parseConnectArgs("postgresql:///dbname", {
      host: "/var/lib/postgresql",
    });

    expect(typeof string).toBe("string");
    expect(string).toMatch(/^dbname='dbname' host='\/var\/lib\/postgresql'/);
  });
});
