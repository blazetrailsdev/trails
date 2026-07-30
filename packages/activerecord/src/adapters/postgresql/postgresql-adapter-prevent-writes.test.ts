/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/postgresql_adapter_prevent_writes_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { describeIfPg } from "./test-helper.js";
import { Base } from "../../base.js";
import type { AbstractAdapter } from "../../connection-adapters/abstract-adapter.js";
import { ReadOnlyError } from "../../errors.js";
import { withExampleTable as withDdlHelperTable } from "../../support/ddl-helper.js";
import { fixtures } from "../../test-fixtures.js";

describeIfPg("PostgreSQLAdapter", () => {
  describe("PostgreSQLAdapterPreventWritesTest", () => {
    fixtures([], { useTransactionalTests: false });

    let connection: AbstractAdapter;

    beforeEach(async () => {
      connection = await Base.leaseConnection();
    });

    function withExampleTable<T>(fn: () => Promise<T> | T): Promise<T> {
      return withDdlHelperTable(
        connection,
        "ex",
        "id serial primary key, number integer, data character varying(255)",
        fn,
      );
    }

    it("errors when an insert query is called while preventing writes", async () => {
      await withExampleTable(async () => {
        await Base.whilePreventingWrites(async () => {
          await expect(
            connection.execute("INSERT INTO ex (data) VALUES ('138853948594')"),
          ).rejects.toBeInstanceOf(ReadOnlyError);
        });
      });
    });

    it("errors when an update query is called while preventing writes", async () => {
      await withExampleTable(async () => {
        await connection.execute("INSERT INTO ex (data) VALUES ('138853948594')");

        await Base.whilePreventingWrites(async () => {
          await expect(
            connection.execute("UPDATE ex SET data = '9989' WHERE data = '138853948594'"),
          ).rejects.toBeInstanceOf(ReadOnlyError);
        });
      });
    });

    it("errors when a delete query is called while preventing writes", async () => {
      await withExampleTable(async () => {
        await connection.execute("INSERT INTO ex (data) VALUES ('138853948594')");

        await Base.whilePreventingWrites(async () => {
          await expect(
            connection.execute("DELETE FROM ex where data = '138853948594'"),
          ).rejects.toBeInstanceOf(ReadOnlyError);
        });
      });
    });

    it("doesnt error when a select query is called while preventing writes", async () => {
      await withExampleTable(async () => {
        await connection.execute("INSERT INTO ex (data) VALUES ('138853948594')");

        await Base.whilePreventingWrites(async () => {
          const rows = await connection.execute("SELECT * FROM ex WHERE data = '138853948594'");
          expect(rows).toHaveLength(1);
        });
      });
    });

    it("doesnt error when a show query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        const rows = await connection.execute("SHOW TIME ZONE");
        expect(rows).toHaveLength(1);
      });
    });

    it("doesnt error when a set query is called while preventing writes", async () => {
      await Base.whilePreventingWrites(async () => {
        expect(await connection.execute("SET standard_conforming_strings = on")).toEqual([]);
      });
    });

    it("doesnt error when a read query with leading chars is called while preventing writes", async () => {
      await withExampleTable(async () => {
        await connection.execute("INSERT INTO ex (data) VALUES ('138853948594')");

        await Base.whilePreventingWrites(async () => {
          const rows = await connection.execute(
            "/*action:index*/(\n( SELECT * FROM ex WHERE data = '138853948594' ) )",
          );
          expect(rows).toHaveLength(1);
        });
      });
    });

    it("doesnt error when a read query with cursors is called while preventing writes", async () => {
      await withExampleTable(async () => {
        await Base.whilePreventingWrites(async () => {
          await connection.transaction(async () => {
            expect(await connection.execute("DECLARE cur_ex CURSOR FOR SELECT * FROM ex")).toEqual(
              [],
            );
            expect(await connection.execute("FETCH cur_ex")).toEqual([]);
            expect(await connection.execute("MOVE cur_ex")).toEqual([]);
            expect(await connection.execute("CLOSE cur_ex")).toEqual([]);
          });
        });
      });
    });
  });
});
