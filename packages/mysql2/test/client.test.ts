import "@blazetrails/vitest-matchers";
import { File, rbCInteger, rbProgname, Thread, TopLevel } from "@blazetrails/ruby-compat";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Mysql2 } from "../lib/index.js";
import { lastIdTestLock, newClient, specHelper } from "./spec-helper.js";

const testData = new URL("fixtures/test-data", import.meta.url).pathname;
describe("Mysql2::Client", () => {
  const state = specHelper();
  const isPerformanceSchemaEnabled = async () =>
    (await state.client.query("SHOW VARIABLES LIKE 'performance_schema'"))!
      .toA()
      .some((x) => (x as Record<string, unknown>)["Value"] === "ON");
  describe("using defaults file", () => {
    const cnfFile = new URL("./fixtures/my.cnf", import.meta.url).pathname;

    it("should not raise an exception for valid defaults group", async () => {
      await expect(
        newClient({ defaultFile: cnfFile, defaultGroup: "test" }),
      ).resolves.not.toThrow();
    });
    it("should not raise an exception without default group", async () => {
      await expect(newClient({ defaultFile: cnfFile })).resolves.not.toThrow();
    });
  });
  it("should raise a Mysql::Error::ConnectionError upon connection failure", async () => {
    await expect(newClient({ host: "127.0.0.2", port: 999999 })).rejects.toThrow(
      Mysql2.Error.ConnectionError,
    );
  });
  it("should raise an exception on create for invalid encodings", async () => {
    await expect(newClient({ encoding: "fake" })).rejects.toThrow(Mysql2.Error);
  });
  it("should raise an exception on non-string encodings", async () => {
    await expect(newClient({ encoding: 1 })).rejects.toThrow(TypeError);
  });
  it("should not raise an exception on create for a valid encoding", async () => {
    await expect(newClient({ encoding: "utf8" })).resolves.not.toThrow();

    await expect(newClient({ encoding: "big5" })).resolves.not.toThrow();
  });
  it("should accept connect flags and pass them to #connect", async () => {
    const client = await newClient({ flags: Mysql2.Client.FOUND_ROWS });
    expect(client["connectArgs"][6] & Mysql2.Client.FOUND_ROWS).toBeGreaterThan(0);
  });
  it("should parse flags array", async () => {
    const client = await newClient({ flags: ["FOUND_ROWS", "-PROTOCOL_41"] });
    const connectArgs = client["connectArgs"];
    expect(connectArgs[6] & Mysql2.Client.FOUND_ROWS).toBe(Mysql2.Client.FOUND_ROWS);
    expect(connectArgs[6] & 0x200).toBe(0);
  });
  it("should parse flags string", async () => {
    const client = await newClient({ flags: "FOUND_ROWS -PROTOCOL_41" });
    const connectArgs = client["connectArgs"];
    expect(connectArgs[6] & Mysql2.Client.FOUND_ROWS).toBe(Mysql2.Client.FOUND_ROWS);
    expect(connectArgs[6] & 0x200).toBe(0);
  });
  it("should default flags to (REMEMBER_OPTIONS, LONG_PASSWORD, LONG_FLAG, TRANSACTIONS, PROTOCOL_41, SECURE_CONNECTION)", async () => {
    const client = await newClient();
    const clientFlags =
      0x80000000 | 0x00000001 | 0x00000004 | 0x00002000 | 0x00000200 | 0x00008000 | 0x00100000;
    expect(client["connectArgs"][6]).toBe(clientFlags);
  });
  it("should execute init command", async () => {
    const client = await newClient({ initCommand: "SET @something = 'setting_value';" });
    const result = await client.query("SELECT @something;");
    expect((result!.toA()[0] as Record<string, unknown>)["@something"]).toBe("setting_value");
  });
  it("should send init_command after reconnect", async () => {
    const client = await newClient({
      initCommand: "SET @something = 'setting_value';",
      reconnect: true,
    });

    let result = await client.query("SELECT @something;");
    expect((result!.first() as Record<string, unknown>)["@something"]).toBe("setting_value");

    result = await client.query("SELECT CONNECTION_ID()");
    const firstConnId = (result!.first() as Record<string, unknown>)["CONNECTION_ID()"];

    await expect(client.query(`KILL ${firstConnId}`)).rejects.toThrow(Mysql2.Error);

    await client.ping();

    result = await client.query("SELECT CONNECTION_ID()");
    const secondConnId = (result!.first() as Record<string, unknown>)["CONNECTION_ID()"];

    expect(firstConnId).not.toBe(secondConnId);

    result = await client.query("SELECT @something;");
    expect((result!.first() as Record<string, unknown>)["@something"]).toBe("setting_value");
  });
  it("should have a global default_query_options hash", async () => {
    expect(Mysql2.Client).toRespondTo("defaultQueryOptions");
  });
  describe("SSL", () => {
    const sslCertDir = TopLevel.ENV!["TEST_RUBY_MYSQL2_SSL_CERT_DIR"] || "/etc/mysql";
    const optionOverrides = {
      host: "mysql2gem.example.com",
      sslkey: `${sslCertDir}/client-key.pem`,
      sslcert: `${sslCertDir}/client-cert.pem`,
      sslca: `${sslCertDir}/ca-cert.pem`,
      sslcipher: "DHE-RSA-AES256-SHA",
      sslverify: true,
    };
    beforeEach(async (ctx) => {
      const ssl = (await state.client.query("SHOW VARIABLES LIKE 'have_ssl'"))!.toA() as Array<
        Record<string, unknown>
      >;
      if (ssl.some((x) => x["Value"] === "OFF")) {
        ctx.skip("DON'T WORRY, THIS TEST PASSES - but SSL is not compiled into your MySQL daemon.");
      } else if (ssl.some((x) => x["Value"] === "DISABLED")) {
        ctx.skip("DON'T WORRY, THIS TEST PASSES - but SSL is not enabled in your MySQL daemon.");
      } else {
        for (const item of ["sslkey", "sslcert", "sslca"] as const) {
          if (!(await File.isExistAsync(optionOverrides[item]))) {
            ctx.skip(
              `DON'T WORRY, THIS TEST PASSES - but ${optionOverrides[item]} does not exist.`,
            );
            break;
          }
        }
      }
    });

    it("should set ssl_mode option #{ssl_mode}", async () => {
      for (const sslMode of ["disabled", "required", "verify_identity"]) {
        await expect(
          expect(() => newClient({ sslMode, ...optionOverrides })).not.toOutput(
            /does not support ssl_mode/,
            "stderr",
          ),
        ).resolves.not.toThrow();
      }
    });
    it("should be able to connect via SSL options", async () => {
      const sslClient = await newClient(optionOverrides);
      const results = Object.fromEntries(
        (
          (await sslClient.query('SHOW STATUS WHERE Variable_name LIKE "Ssl_%"'))!.toA() as Array<
            Record<string, unknown>
          >
        ).map((x) => [x["Variable_name"], x["Value"]]),
      );
      expect(results["Ssl_cipher"]).not.toBeEmpty();
      expect(results["Ssl_version"]).not.toBeEmpty();

      expect(sslClient.sslCipher()).not.toBeEmpty();
      expect(results["Ssl_cipher"]).toBe(sslClient.sslCipher());
    });
  });
  it("should terminate connections when calling close", async () => {
    await expect(async () => {
      const client = await Mysql2.Client.new({
        host: TopLevel.ENV!["MYSQL_HOST"] ?? "localhost",
        port: Number(TopLevel.ENV!["MYSQL_PORT"] ?? 3306),
        username: "rails",
      });
      const connectionId = client.threadId();
      await client.close();

      let closed = false;
      for (let i = 0; i < 10; i++) {
        closed = (await state.client.query("SHOW PROCESSLIST"))!
          .toA()
          .every((row) => (row as Record<string, unknown>)["Id"] !== connectionId);
        if (closed) break;

        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(closed).toBe(true);
    }).not.toChange(async () => (await state.client.query("SHOW STATUS LIKE 'Aborted_%'"))!.toA());
  });
  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
  it.skip("should not leave dangling connections after garbage collection", () => {});
  describe("#set_server_option", () => {
    it("returns true when multi_statements is enable", async () => {
      const client = await newClient();
      await client.setServerOption(Mysql2.Client.OPTION_MULTI_STATEMENTS_ON);
      expect(await client.setServerOption(Mysql2.Client.OPTION_MULTI_STATEMENTS_ON)).toBe(true);
    });
    it("returns true when multi_statements is disable", async () => {
      const client = await newClient();
      await client.setServerOption(Mysql2.Client.OPTION_MULTI_STATEMENTS_ON);
      expect(await client.setServerOption(Mysql2.Client.OPTION_MULTI_STATEMENTS_OFF)).toBe(true);
    });
    it("returns false when multi_statements is neither OPTION_MULTI_STATEMENTS_OFF or OPTION_MULTI_STATEMENTS_ON", async () => {
      const client = await newClient();
      await client.setServerOption(Mysql2.Client.OPTION_MULTI_STATEMENTS_ON);
      expect(await client.setServerOption(344)).toBe(false);
    });
    it("enables multiple-statement", async () => {
      const client = await newClient();
      await client.setServerOption(Mysql2.Client.OPTION_MULTI_STATEMENTS_ON);
      await client.query("SELECT 1;SELECT 2;");

      expect(client.nextResult()).toBe(true);
      expect(client.storeResult()!.first()).toEqual({ "2": 2 });
      expect(client.nextResult()).toBe(false);
    });
    it("disables multiple-statement", async () => {
      const client = await newClient();
      await client.setServerOption(Mysql2.Client.OPTION_MULTI_STATEMENTS_ON);
      await client.setServerOption(Mysql2.Client.OPTION_MULTI_STATEMENTS_OFF);

      await expect(client.query("SELECT 1;SELECT 2;")).rejects.toThrow(Mysql2.Error);
    });
  });
  describe("#automatic_close", () => {
    it("is enabled by default", async () => {
      expect((await newClient()).automaticClose).toBe(true);
    });
    // PERMANENT-SKIP: the spec defines this only under RUBY_PLATFORM =~ /mingw|mswin/; libmysqlclient's Windows-only automatic_close refusal has no npm-driver counterpart.
    it.skip("cannot be disabled", () => {});
    it("can be configured", async () => {
      const client = await newClient({ automaticClose: false });
      expect(client.automaticClose).toBe(false);
    });
    it("can be assigned", async () => {
      const client = await newClient();
      client.automaticClose = false;
      expect(client.automaticClose).toBe(false);

      client.automaticClose = true;
      expect(client.automaticClose).toBe(true);

      client.automaticClose = null;
      expect(client.automaticClose).toBe(false);

      client.automaticClose = 9;
      expect(client.automaticClose).toBe(true);
    });
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("should not close connections when running in a child process", () => {});
  });
  it("should be able to connect to database with numeric-only name", async () => {
    const database = 1235;
    await state.client.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);

    await expect(newClient({ database })).resolves.not.toThrow();

    await state.client.query(`DROP DATABASE IF EXISTS \`${database}\``);
  });
  it("should respond to #close", async () => {
    expect(state.client).toRespondTo("close");
  });
  it("should be able to close properly", async () => {
    expect(await state.client.close()).toBeUndefined();
    await expect(state.client.query("SELECT 1")).rejects.toThrow(Mysql2.Error);
  });
  describe("#closed?", () => {
    it("should return false when connected", async () => {
      expect(state.client.isClosed()).toBe(false);
    });
    it("should return true after close", async () => {
      await state.client.close();
      expect(state.client.isClosed()).toBe(true);
    });
  });
  it("should not try to query closed mysql connection", async () => {
    const client = await newClient({ reconnect: true });
    expect(await client.close()).toBeUndefined();
    await expect(client.query("SELECT 1")).rejects.toThrow(Mysql2.Error);
  });
  it("should respond to #query", async () => {
    expect(state.client).toRespondTo("query");
  });
  it("should respond to #warning_count", async () => {
    expect(state.client).toRespondTo("warningCount");
  });
  describe("#warning_count", () => {
    describe("when no warnings", () => {
      it("should 0", async () => {
        await state.client.query("select 1");
        expect(state.client.warningCount).toBe(0);
      });
    });
    describe("when has a warnings", () => {
      it("should > 0", async () => {
        await state.client.query("DROP TABLE IF EXISTS activerecord_unittest.no_such_table");
        expect(state.client.warningCount).toBeGreaterThan(0);
      });
    });
  });
  it("should respond to #query_info", async () => {
    expect(state.client).toRespondTo("queryInfo");
  });
  describe("#query_info", () => {
    describe("when no info present", () => {
      it("should 0", async () => {
        await state.client.query("select 1");
        expect(state.client.queryInfo()).toBeEmpty();
        expect(state.client.queryInfoString()).toBeNull();
      });
    });
    describe("when has some info", () => {
      it("should retrieve it", async () => {
        await state.client.query(
          "CREATE TABLE IF NOT EXISTS infoTest (`id` int(11) NOT NULL AUTO_INCREMENT, blah INT(11), PRIMARY KEY (`id`))",
        );

        await state.client.query("INSERT INTO infoTest (blah) VALUES (1234),(4535)");

        expect(state.client.queryInfo()).toEqual({ records: 2, duplicates: 0, warnings: 0 });
        expect(state.client.queryInfoString()).toBe("Records: 2  Duplicates: 0  Warnings: 0");

        await state.client.query("DROP TABLE infoTest");
      });
    });
  });
  describe(":local_infile", () => {
    let localEnabled = false;
    beforeAll(async () => {
      const client = await newClient({ localInfile: true });
      const local = (await client.query("SHOW VARIABLES LIKE 'local_infile'"))!.toA();
      localEnabled = local.some((x) => (x as Record<string, unknown>)["Value"] === "ON");
      if (localEnabled) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS infileTest (
            id MEDIUMINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            foo VARCHAR(10),
            bar MEDIUMTEXT
          )
        `);
      }
      await client.close();
    });
    beforeEach((ctx) => {
      if (!localEnabled) {
        ctx.skip(
          "DON'T WORRY, THIS TEST PASSES - but LOCAL INFILE is not enabled in your MySQL daemon.",
        );
      }
    });
    afterAll(async () => {
      const client = await newClient();
      await client.query("DROP TABLE IF EXISTS infileTest");
      await client.close();
    });

    it("should raise an error when local_infile is disabled", async () => {
      const client = await newClient({ localInfile: false });
      await expect(
        client.query("LOAD DATA LOCAL INFILE 'spec/test_data' INTO TABLE infileTest"),
      ).rejects.toThrow(/command is not allowed/);
    });
    it("should raise an error when a non-existent file is loaded", async () => {
      const client = await newClient({ localInfile: true });
      await expect(
        client.query("LOAD DATA LOCAL INFILE 'this/file/is/not/here' INTO TABLE infileTest"),
      ).rejects.toThrow(
        expect.objectContaining({
          constructor: Mysql2.Error,
          message: "No such file or directory: this/file/is/not/here",
        }),
      );
    });
    it("should LOAD DATA LOCAL INFILE", async () => {
      const client = await newClient({ localInfile: true });
      await client.query(`LOAD DATA LOCAL INFILE '${testData}' INTO TABLE infileTest`);
      const info = client.queryInfo();
      expect(info).toEqual({ records: 1, deleted: 0, skipped: 0, warnings: 0 });

      const result = await client.query("SELECT * FROM infileTest");
      expect(result!.first()).toEqual({ id: 1, foo: "Hello", bar: "World" });
    });
  });
  it("should expect connect_timeout to be a positive integer", async () => {
    await expect(newClient({ connectTimeout: -1 })).rejects.toThrow(Mysql2.Error);
  });
  it("should expect read_timeout to be a positive integer", async () => {
    await expect(newClient({ readTimeout: -1 })).rejects.toThrow(Mysql2.Error);
  });
  it("should expect write_timeout to be a positive integer", async () => {
    await expect(newClient({ writeTimeout: -1 })).rejects.toThrow(Mysql2.Error);
  });
  it("should allow nil read_timeout", async () => {
    const client = await newClient({ readTimeout: null });

    expect(client.readTimeout).toBeNull();
  });
  it("should set default program_name in connect_attrs", async (ctx) => {
    ctx.skip(
      !(await isPerformanceSchemaEnabled()),
      "DON'T WORRY, THIS TEST PASSES - but PERFORMANCE SCHEMA is not enabled in your MySQL daemon.",
    );
    const client = await newClient();
    const result = await client.query(
      "SELECT attr_value FROM performance_schema.session_account_connect_attrs WHERE processlist_id = connection_id() AND attr_name = 'program_name'",
    );
    expect((result!.first() as Record<string, unknown>)["attr_value"]).toBe(rbProgname());
  });
  it("should set custom connect_attrs", async (ctx) => {
    ctx.skip(
      !(await isPerformanceSchemaEnabled()),
      "DON'T WORRY, THIS TEST PASSES - but PERFORMANCE SCHEMA is not enabled in your MySQL daemon.",
    );
    const client = await newClient({
      connectAttrs: { program_name: "my_program_name", foo: "fooval", bar: "barval" },
    });
    const results = Object.fromEntries(
      (
        (await client.query(
          "SELECT * FROM performance_schema.session_account_connect_attrs WHERE processlist_id = connection_id()",
        ))!.toA() as Array<Record<string, unknown>>
      ).map((x) => [x["ATTR_NAME"], x["ATTR_VALUE"]]),
    );
    expect(results["program_name"]).toBe("my_program_name");
    expect(results["foo"]).toBe("fooval");
    expect(results["bar"]).toBe("barval");
  });
  describe("#query", () => {
    it("should let you query again if iterating is finished when streaming", async () => {
      await (await state.client.query("SELECT 1 UNION SELECT 2", {
        stream: true,
        cacheRows: false,
      }))!.toA();

      await expect(
        state.client.query("SELECT 1 UNION SELECT 2", { stream: true, cacheRows: false }),
      ).resolves.not.toThrow();
    });
    it("should not let you query again if iterating is not finished when streaming", async () => {
      await (await state.client.query("SELECT 1 UNION SELECT 2", {
        stream: true,
        cacheRows: false,
      }))!.first();

      await expect(
        state.client.query("SELECT 1 UNION SELECT 2", { stream: true, cacheRows: false }),
      ).rejects.toThrow(Mysql2.Error);
    });
    it("should only accept strings as the query parameter", async () => {
      await expect(state.client.query(["SELECT 'not right'"] as unknown as string)).rejects.toThrow(
        TypeError,
      );
    });
    it("should not retain query options set on a query for subsequent queries, but should retain it in the result", async () => {
      let result = await state.client.query("SELECT 1", { something: "else" });
      expect(state.client.queryOptions["something"]).toBeUndefined();
      expect(result!["queryOptions" as never]).toEqual({
        ...state.client.queryOptions,
        something: "else",
      });
      expect(state.client["currentQueryOptions"]).toEqual({
        ...state.client.queryOptions,
        something: "else",
      });

      result = await state.client.query("SELECT 1");
      expect(result!["queryOptions" as never]).toEqual(state.client.queryOptions);
      expect(state.client["currentQueryOptions"]).toEqual(state.client.queryOptions);
    });
    it("should allow changing query options for subsequent queries", async () => {
      state.client.queryOptions["something"] = "else";
      const result = await state.client.query("SELECT 1");
      expect(state.client.queryOptions["something"]).toBe("else");
      expect((result!["queryOptions" as never] as Record<string, unknown>)["something"]).toBe(
        "else",
      );

      delete state.client.queryOptions["something"];
      expect(state.client.queryOptions["something"]).toBeUndefined();
    });
    it("should return results as a hash by default", async () => {
      expect((await state.client.query("SELECT 1"))!.toA()[0]).not.toBeInstanceOf(Array);
    });
    it("should be able to return results as an array", async () => {
      expect((await state.client.query("SELECT 1", { as: "array" }))!.first()).toBeInstanceOf(
        Array,
      );
      (await state.client.query("SELECT 1"))!.each({ as: "array" });
    });
    it("should be able to return results with symbolized keys", async () => {
      const row = (await state.client.query("SELECT 1", { symbolizeKeys: true }))!.first()!;
      expect(Object.keys(row)[0]).toBeExactInstanceOf(String);
    });
    it("should require an open connection", async () => {
      await state.client.close();
      await expect(state.client.query("SELECT 1")).rejects.toThrow(Mysql2.Error);
    });
    // PERMANENT-SKIP: its last assertion reads `#socket`, the connection's file descriptor, which Node's `net.Socket` does not expose.
    it.skip("should detect closed connection on query read error", () => {});
    // PERMANENT-SKIP: `async: true` sends a query without reading its result; npm mysql2's command queue always reads each command's response before it settles.
    it.skip("should not allow another query to be sent without fetching a result first", () => {});
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("should describe the thread holding the active query", () => {});
    // PERMANENT-SKIP: `read_timeout: 0` is libmysqlclient's immediate timeout; npm mysql2 reads a query `timeout` of 0 as no timeout.
    it.skip("should timeout if we wait longer than :read_timeout", () => {});
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("should run signal handlers while waiting for a response", () => {});
    // PERMANENT-SKIP: `#socket` answers the connection's file descriptor, which Node's `net.Socket` does not expose.
    it.skip("#socket should return a Fixnum (file descriptor from C)", () => {});
    it.skip("#socket should require an open connection", () => {});
    // PERMANENT-SKIP: `Timeout.timeout` raises into the thread blocked on the socket read; a JS promise cannot be interrupted mid-await.
    it.skip("should be impervious to connection-corrupting timeouts in #execute", () => {});
    describe("when a non-standard exception class is raised", () => {
      // PERMANENT-SKIP: `Timeout.timeout` raises into the thread blocked on the socket read; a JS promise cannot be interrupted mid-await.
      it.skip("should close the connection when an exception is raised", () => {});
      // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
      it.skip("should handle Timeouts without leaving the connection hanging if reconnect is true", () => {});
      it.skip("should handle Timeouts without leaving the connection hanging if reconnect is set to true after construction", () => {});
    });
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("threaded queries should be supported", () => {});
    it.skip("evented async queries should be supported", () => {});
    describe("Multiple results sets", () => {
      let multiClient: Awaited<ReturnType<typeof newClient>>;
      beforeEach(async () => {
        multiClient = await newClient({ flags: Mysql2.Client.MULTI_STATEMENTS });
      });

      it("should raise an exception when one of multiple statements fails", async () => {
        const result = await multiClient.query(
          "SELECT 1 AS 'set_1'; SELECT * FROM invalid_table_name; SELECT 2 AS 'set_2';",
        );
        expect(result!.first()!["set_1" as never]).toBe(1);
        expect(() => multiClient.nextResult()).toThrow(Mysql2.Error);
        expect(multiClient.nextResult()).toBe(false);
      });
      it("returns multiple result sets", async () => {
        expect(
          (await multiClient.query("SELECT 1 AS 'set_1'; SELECT 2 AS 'set_2'"))!.first(),
        ).toEqual({ set_1: 1 });

        expect(multiClient.nextResult()).toBe(true);
        expect(multiClient.storeResult()!.first()).toEqual({ set_2: 2 });

        expect(multiClient.nextResult()).toBe(false);
      });
      it("does not interfere with other statements", async () => {
        await multiClient.query("SELECT 1 AS 'set_1'; SELECT 2 AS 'set_2'");
        while (multiClient.nextResult()) multiClient.storeResult();

        expect((await multiClient.query("SELECT 3 AS 'next'"))!.first()).toEqual({ next: 3 });
      });
      it("will raise on query if there are outstanding results to read", async () => {
        await multiClient.query("SELECT 1; SELECT 2; SELECT 3");
        await expect(multiClient.query("SELECT 4")).rejects.toThrow(Mysql2.Error);
      });
      it("#abandon_results! should work", async () => {
        await multiClient.query("SELECT 1; SELECT 2; SELECT 3");
        multiClient.abandonResultsBang();
        await expect(multiClient.query("SELECT 4")).resolves.not.toThrow();
      });
      it("#more_results? should work", async () => {
        await multiClient.query("SELECT 1 AS 'set_1'; SELECT 2 AS 'set_2'");
        expect(multiClient.isMoreResults()).toBe(true);

        multiClient.nextResult();
        multiClient.storeResult();

        expect(multiClient.isMoreResults()).toBe(false);
      });
      it("#more_results? should work with stored procedures", async () => {
        await multiClient.query("DROP PROCEDURE IF EXISTS test_proc");
        await multiClient.query(
          "CREATE PROCEDURE test_proc() BEGIN SELECT 1 AS 'set_1'; SELECT 2 AS 'set_2'; END",
        );
        expect((await multiClient.query("CALL test_proc()"))!.first()).toEqual({ set_1: 1 });
        expect(multiClient.isMoreResults()).toBe(true);

        multiClient.nextResult();
        expect(multiClient.storeResult()!.first()).toEqual({ set_2: 2 });

        multiClient.nextResult();
        expect(multiClient.storeResult()).toBeNull();

        expect(multiClient.isMoreResults()).toBe(false);
      });
    });
  });
  // PERMANENT-SKIP: `#socket` answers the connection's file descriptor, which Node's `net.Socket` does not expose.
  it.skip("should respond to #socket", () => {});
  // PERMANENT-SKIP: the spec defines this only under RUBY_PLATFORM =~ /mingw|mswin/, for libmysqlclient's Windows socket.
  it.skip("#socket should raise as it's not supported", () => {});
  it("should respond to escape", async () => {
    expect(Mysql2.Client).toRespondTo("escape");
  });
  describe("escape", () => {
    it("should return a new SQL-escape version of the passed string", async () => {
      expect(Mysql2.Client.escape("abc'def\"ghi\0jkl%mno")).toBe("abc\\'def\\\"ghi\\0jkl%mno");
    });
    it("should return the passed string if nothing was escaped", async () => {
      const str = "plain";
      expect(Mysql2.Client.escape(str)).toBe(str);
    });
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("should not overflow the thread stack", () => {});
    it("should not overflow the process stack", async () => {
      await expect(
        Promise.resolve(new Thread(() => Mysql2.Client.escape("'".repeat(1024 * 1024 * 4))).join()),
      ).resolves.not.toThrow();
    });
    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
    it.skip("should carry over the original string's encoding", () => {});
  });
  it("should respond to #escape", async () => {
    expect(state.client).toRespondTo("escape");
  });
  describe("#escape", () => {
    it("should return a new SQL-escape version of the passed string", async () => {
      expect(state.client.escape("abc'def\"ghi\0jkl%mno")).toBe("abc\\'def\\\"ghi\\0jkl%mno");
    });
    it("should return the passed string if nothing was escaped", async () => {
      const str = "plain";
      expect(state.client.escape(str)).toBe(str);
    });
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("should not overflow the thread stack", () => {});
    it("should not overflow the process stack", async () => {
      await expect(
        Promise.resolve(new Thread(() => state.client.escape("'".repeat(1024 * 1024 * 4))).join()),
      ).resolves.not.toThrow();
    });
    it("should require an open connection", async () => {
      await state.client.close();
      expect(() => state.client.escape("")).toThrow(Mysql2.Error);
    });
    describe("when mysql encoding is not utf8", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
      it.skip("should return a internal encoding string if Encoding.default_internal is set", () => {});
    });
  });
  // PERMANENT-SKIP: `#info` answers the linked libmysqlclient's version (`mysql_get_client_version`); npm mysql2 is a pure-JS protocol client with no client library version.
  it.skip("should respond to #info", () => {});
  it.skip("#info should return a hash containing the client version ID and String", () => {});
  describe("strings returned by #info", () => {
    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
    it.skip("should be tagged as ascii", () => {});
  });
  describe("strings returned by .info", () => {
    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
    it.skip("should be tagged as ascii", () => {});
  });
  it("should respond to #server_info", async () => {
    expect(state.client).toRespondTo("serverInfo");
  });
  it("#server_info should return a hash containing the client version ID and String", async () => {
    const server_info = state.client.serverInfo();
    expect(server_info).toBeExactInstanceOf(Object);
    expect(server_info).toHaveKey("id");
    expect(server_info.id).toBeExactInstanceOf(rbCInteger);
    expect(server_info).toHaveKey("version");
    expect(server_info.version).toBeExactInstanceOf(String);
  });
  it("#server_info should require an open connection", async () => {
    await state.client.close();
    expect(() => state.client.serverInfo()).toThrow(Mysql2.Error);
  });
  describe("strings returned by #server_info", () => {
    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
    it.skip("should default to the connection's encoding if Encoding.default_internal is nil", () => {});
    it.skip("should use Encoding.default_internal", () => {});
  });
  it("should raise a Mysql2::Error::ConnectionError exception upon connection failure due to invalid credentials", async () => {
    await expect(
      newClient({ host: "localhost", username: "asdfasdf8d2h", password: "asdfasdfw42" }),
    ).rejects.toThrow(Mysql2.Error.ConnectionError);

    await expect(newClient()).resolves.not.toThrow();
  });
  describe("write operations api", () => {
    lastIdTestLock(state);
    it("should respond to #last_id", async () => {
      await state.client.query(
        "CREATE TABLE IF NOT EXISTS lastIdTest (`id` BIGINT NOT NULL AUTO_INCREMENT, blah INT(11), PRIMARY KEY (`id`))",
      );
      expect(state.client).toRespondTo("lastId");
      await state.client.query("DROP TABLE lastIdTest");
    });
    it("#last_id should return a Fixnum, the from the last INSERT/UPDATE", async () => {
      await state.client.query(
        "CREATE TABLE IF NOT EXISTS lastIdTest (`id` BIGINT NOT NULL AUTO_INCREMENT, blah INT(11), PRIMARY KEY (`id`))",
      );
      expect(state.client.lastId).toBe(0);
      await state.client.query("INSERT INTO lastIdTest (blah) VALUES (1234)");
      expect(state.client.lastId).toBe(1);
      await state.client.query("DROP TABLE lastIdTest");
    });
    it("should respond to #last_id", async () => {
      await state.client.query(
        "CREATE TABLE IF NOT EXISTS lastIdTest (`id` BIGINT NOT NULL AUTO_INCREMENT, blah INT(11), PRIMARY KEY (`id`))",
      );
      expect(state.client).toRespondTo("lastId");
      await state.client.query("DROP TABLE lastIdTest");
    });
    it("#last_id should return a Fixnum, the from the last INSERT/UPDATE", async () => {
      await state.client.query(
        "CREATE TABLE IF NOT EXISTS lastIdTest (`id` BIGINT NOT NULL AUTO_INCREMENT, blah INT(11), PRIMARY KEY (`id`))",
      );
      await state.client.query("INSERT INTO lastIdTest (blah) VALUES (1234)");
      expect(state.client.affectedRows).toBe(1);
      await state.client.query("UPDATE lastIdTest SET blah=4321 WHERE id=1");
      expect(state.client.affectedRows).toBe(1);
      await state.client.query("DROP TABLE lastIdTest");
    });
    it("#last_id should handle BIGINT auto-increment ids above 32 bits", async () => {
      await state.client.query(
        "CREATE TABLE IF NOT EXISTS lastIdTest (`id` BIGINT NOT NULL AUTO_INCREMENT, blah INT(11), PRIMARY KEY (`id`))",
      );
      await state.client.query("INSERT INTO lastIdTest (id, blah) VALUES (5000000000, 5000)");
      expect(state.client.lastId).toBe(5000000000);
      await state.client.query("INSERT INTO lastIdTest (blah) VALUES (5001)");
      expect(state.client.lastId).toBe(5000000001);
      await state.client.query("DROP TABLE lastIdTest");
    });
  });
  it("should respond to #thread_id", async () => {
    expect(state.client).toRespondTo("threadId");
  });
  it("#thread_id should be a Fixnum", async () => {
    expect(state.client.threadId()).toBeExactInstanceOf(rbCInteger);
  });
  it("should respond to #ping", async () => {
    expect(state.client).toRespondTo("ping");
  });
  describe("session_track", () => {
    beforeEach(async (ctx) => {
      if (!("SESSION_TRACK" in Mysql2.Client)) ctx.skip("Server versions must be MySQL 5.7 later.");
      await state.client.query("SET @@SESSION.session_track_system_variables='*';");
    });

    it("returns changes system variables for SESSION_TRACK_SYSTEM_VARIABLES", async () => {
      await state.client.query("SET @@SESSION.session_track_state_change=ON;");
      const res = state.client.sessionTrack(Mysql2.Client.SESSION_TRACK_SYSTEM_VARIABLES);
      expect(res).toInclude("session_track_state_change", "ON");
    });
    it("returns database name for SESSION_TRACK_SCHEMA", async () => {
      await state.client.query("USE information_schema");
      const res = state.client.sessionTrack(Mysql2.Client.SESSION_TRACK_SCHEMA);
      expect(res).toEqual(["information_schema"]);
    });
    it("returns multiple session track type values when available", async () => {
      await state.client.query("SET @@SESSION.session_track_transaction_info='CHARACTERISTICS';");

      let res = state.client.sessionTrack(Mysql2.Client.SESSION_TRACK_SYSTEM_VARIABLES);
      expect(res).toInclude("session_track_transaction_info", "CHARACTERISTICS");

      res = state.client.sessionTrack(Mysql2.Client.SESSION_TRACK_STATE_CHANGE);
      expect(res).toBeNull();

      res = state.client.sessionTrack(Mysql2.Client.SESSION_TRACK_TRANSACTION_CHARACTERISTICS);
      expect(res).toInclude("");
    });
    it("returns valid transaction state inside a transaction", async () => {
      await state.client.query("SET @@SESSION.session_track_transaction_info='CHARACTERISTICS'");
      await state.client.query("START TRANSACTION");

      const res = state.client.sessionTrack(Mysql2.Client.SESSION_TRACK_TRANSACTION_STATE);
      expect(res).toInclude("T_______");
    });
    it("returns empty array if session track type not found", async () => {
      await state.client.query("SET @@SESSION.session_track_state_change=ON;");
      const res = state.client.sessionTrack(
        Mysql2.Client.SESSION_TRACK_TRANSACTION_CHARACTERISTICS,
      );
      expect(res).toBeNull();
    });
  });
  describe("select_db", () => {
    beforeEach(async () => {
      for (let i = 0; i < 2; i++) {
        await state.client.query(`CREATE DATABASE test_selectdb_${i}`);
        await state.client.query(`USE test_selectdb_${i}`);
        await state.client.query(`CREATE TABLE test${i} (\`id\` int NOT NULL PRIMARY KEY)`);
      }
    });
    afterEach(async () => {
      const client = await newClient();
      for (let i = 0; i < 2; i++) {
        await client.query(`DROP DATABASE test_selectdb_${i}`);
      }
    });

    const firstValue = async (sql: string) =>
      Object.values((await state.client.query(sql))!.first() as Record<string, unknown>)[0];
    it("should respond to #select_db", async () => {
      expect(state.client).toRespondTo("selectDb");
    });
    it("should switch databases", async () => {
      await state.client.selectDb("test_selectdb_0");
      expect(await firstValue("SHOW TABLES")).toBe("test0");
      await state.client.selectDb("test_selectdb_1");
      expect(await firstValue("SHOW TABLES")).toBe("test1");
      await state.client.selectDb("test_selectdb_0");
      expect(await firstValue("SHOW TABLES")).toBe("test0");
    });
    it("should raise a Mysql2::Error when the database doesn't exist", async () => {
      await expect(state.client.selectDb("nopenothere")).rejects.toThrow(Mysql2.Error);
    });
    it("should return the database switched to", async () => {
      expect(await state.client.selectDb("test_selectdb_1")).toBe("test_selectdb_1");
    });
  });
  it("#thread_id should return a boolean", async () => {
    expect(await state.client.ping()).toBe(true);
    await state.client.close();
    expect(await state.client.ping()).toBe(false);
  });
  it("should be able to connect using plaintext password", async () => {
    const client = await newClient({ enableCleartextPlugin: true });
    await client.query("SELECT 1");
  });
  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
  it.skip("should respond to #encoding", () => {});
});
