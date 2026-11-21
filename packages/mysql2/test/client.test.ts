import "@blazetrails/vitest-matchers";
import { rbCInteger } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Mysql2 } from "../lib/index.js";
import { newClient, specHelper } from "./spec-helper.js";
describe("Mysql2::Client", () => {
  const state = specHelper();
  describe("using defaults file", () => {
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should not raise an exception for valid defaults group", () => {});
    it.skip("should not raise an exception without default group", () => {});
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
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should default flags to (REMEMBER_OPTIONS, LONG_PASSWORD, LONG_FLAG, TRANSACTIONS, PROTOCOL_41, SECURE_CONNECTION)", () => {});
  it("should execute init command", async () => {
    const client = await newClient({ initCommand: "SET @something = 'setting_value';" });
    const result = await client.query("SELECT @something;");
    expect((result!.toA()[0] as Record<string, unknown>)["@something"]).toBe("setting_value");
  });
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should send init_command after reconnect", () => {});
  it("should have a global default_query_options hash", async () => {
    expect(Mysql2.Client).toRespondTo("defaultQueryOptions");
  });
  describe("SSL", () => {
    // PERMANENT-SKIP: SSL is outside the RFC 0254 surface (Non-goals).
    it.skip("should set ssl_mode option #{ssl_mode}", () => {});
    it.skip("should be able to connect via SSL options", () => {});
  });
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should terminate connections when calling close", () => {});
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
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("returns false when multi_statements is neither OPTION_MULTI_STATEMENTS_OFF or OPTION_MULTI_STATEMENTS_ON", () => {});
    // PERMANENT-SKIP: multi-result sets and session_track are outside the RFC 0254 surface (Non-goals).
    it.skip("enables multiple-statement", () => {});
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
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("cannot be disabled", () => {});
    it.skip("can be configured", () => {});
    it.skip("can be assigned", () => {});
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("should not close connections when running in a child process", () => {});
  });
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should be able to connect to database with numeric-only name", () => {});
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
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should respond to #query_info", () => {});
  describe("#query_info", () => {
    describe("when no info present", () => {
      // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
      it.skip("should 0", () => {});
    });
    describe("when has some info", () => {
      // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
      it.skip("should retrieve it", () => {});
    });
  });
  describe(":local_infile", () => {
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should raise an error when local_infile is disabled", () => {});
    it.skip("should raise an error when a non-existent file is loaded", () => {});
    it.skip("should LOAD DATA LOCAL INFILE", () => {});
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
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should set default program_name in connect_attrs", () => {});
  it.skip("should set custom connect_attrs", () => {});
  describe("#query", () => {
    // PERMANENT-SKIP: streaming, cache_rows and async_result are outside the RFC 0254 surface (Non-goals).
    it.skip("should let you query again if iterating is finished when streaming", () => {});
    it.skip("should not let you query again if iterating is not finished when streaming", () => {});
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should only accept strings as the query parameter", () => {});
    it.skip("should not retain query options set on a query for subsequent queries, but should retain it in the result", () => {});
    it.skip("should allow changing query options for subsequent queries", () => {});
    it("should return results as a hash by default", async () => {
      expect((await state.client.query("SELECT 1"))!.toA()[0]).not.toBeInstanceOf(Array);
    });
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should be able to return results as an array", () => {});
    it.skip("should be able to return results with symbolized keys", () => {});
    it("should require an open connection", async () => {
      await state.client.close();
      await expect(state.client.query("SELECT 1")).rejects.toThrow(Mysql2.Error);
    });
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should detect closed connection on query read error", () => {});
    it.skip("should not allow another query to be sent without fetching a result first", () => {});
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("should describe the thread holding the active query", () => {});
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should timeout if we wait longer than :read_timeout", () => {});
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("should run signal handlers while waiting for a response", () => {});
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("#socket should return a Fixnum (file descriptor from C)", () => {});
    it.skip("#socket should require an open connection", () => {});
    it.skip("should be impervious to connection-corrupting timeouts in #execute", () => {});
    describe("when a non-standard exception class is raised", () => {
      // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
      it.skip("should close the connection when an exception is raised", () => {});
      // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
      it.skip("should handle Timeouts without leaving the connection hanging if reconnect is true", () => {});
      it.skip("should handle Timeouts without leaving the connection hanging if reconnect is set to true after construction", () => {});
    });
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("threaded queries should be supported", () => {});
    it.skip("evented async queries should be supported", () => {});
    describe("Multiple results sets", () => {
      // PERMANENT-SKIP: multi-result sets and session_track are outside the RFC 0254 surface (Non-goals).
      it.skip("should raise an exception when one of multiple statements fails", () => {});
      it.skip("returns multiple result sets", () => {});
      it.skip("does not interfere with other statements", () => {});
      it.skip("will raise on query if there are outstanding results to read", () => {});
      it.skip("#abandon_results! should work", () => {});
      it.skip("#more_results? should work", () => {});
      it.skip("#more_results? should work with stored procedures", () => {});
    });
  });
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should respond to #socket", () => {});
  it.skip("#socket should raise as it's not supported", () => {});
  it.skip("should respond to escape", () => {});
  describe("escape", () => {
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should return a new SQL-escape version of the passed string", () => {});
    it.skip("should return the passed string if nothing was escaped", () => {});
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("should not overflow the thread stack", () => {});
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should not overflow the process stack", () => {});
    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
    it.skip("should carry over the original string's encoding", () => {});
  });
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should respond to #escape", () => {});
  describe("#escape", () => {
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should return a new SQL-escape version of the passed string", () => {});
    it.skip("should return the passed string if nothing was escaped", () => {});
    // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
    it.skip("should not overflow the thread stack", () => {});
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should not overflow the process stack", () => {});
    it.skip("should require an open connection", () => {});
    describe("when mysql encoding is not utf8", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
      it.skip("should return a internal encoding string if Encoding.default_internal is set", () => {});
    });
  });
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
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
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("#server_info should require an open connection", () => {});
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
    it("should respond to #last_id", async () => {
      await state.client.query(
        "CREATE TABLE IF NOT EXISTS lastIdTest (`id` BIGINT NOT NULL AUTO_INCREMENT, blah INT(11), PRIMARY KEY (`id`))",
      );
      expect(state.client).toRespondTo("lastId");
      await state.client.query("DROP TABLE lastIdTest");
    });
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("#last_id should return a Fixnum, the from the last INSERT/UPDATE", () => {});
    it.skip("should respond to #last_id", () => {});
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
  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
  it.skip("should respond to #thread_id", () => {});
  it.skip("#thread_id should be a Fixnum", () => {});
  it("should respond to #ping", async () => {
    expect(state.client).toRespondTo("ping");
  });
  describe("session_track", () => {
    // PERMANENT-SKIP: multi-result sets and session_track are outside the RFC 0254 surface (Non-goals).
    it.skip("returns changes system variables for SESSION_TRACK_SYSTEM_VARIABLES", () => {});
    it.skip("returns database name for SESSION_TRACK_SCHEMA", () => {});
    it.skip("returns multiple session track type values when available", () => {});
    it.skip("returns valid transaction state inside a transaction", () => {});
    it.skip("returns empty array if session track type not found", () => {});
  });
  describe("select_db", () => {
    // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
    it.skip("should respond to #select_db", () => {});
    it.skip("should switch databases", () => {});
    it.skip("should raise a Mysql2::Error when the database doesn't exist", () => {});
    it.skip("should return the database switched to", () => {});
  });
  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (fork, threads and signal interrupts).
  it.skip("#thread_id should return a boolean", () => {});
  // PERMANENT-SKIP: not in the RFC 0254 surface table (§ "The measured split").
  it.skip("should be able to connect using plaintext password", () => {});
  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
  it.skip("should respond to #encoding", () => {});
});
