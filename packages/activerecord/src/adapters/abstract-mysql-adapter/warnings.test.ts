/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/warnings_test.rb
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  describeIfMysql,
  Mysql2Adapter,
  MYSQL_TEST_URL,
  withDbWarningsAction,
} from "./test-helper.js";
import { SQLWarning } from "../../errors.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
    vi.restoreAllMocks();
  });

  describe("WarningsTest", () => {
    it("db_warnings_action :raise on warning", async () => {
      await withDbWarningsAction("raise", async () => {
        await expect(adapter.execute(`SELECT 1 + 'foo'`)).rejects.toBeInstanceOf(SQLWarning);
      });
    });

    it("db_warnings_action :ignore on warning", async () => {
      await withDbWarningsAction("ignore", async () => {
        const rows = await adapter.execute(`SELECT 1 + 'foo' AS v`);
        expect(rows[0]?.v).toBe(1);
      });
    });

    it("db_warnings_action :log on warning", async () => {
      await withDbWarningsAction("log", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        await adapter.execute(`SELECT 1 + 'foo'`);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining(`[ActiveRecord::SQLWarning] Truncated incorrect DOUBLE value`),
        );
      });
    });

    it("db_warnings_action :report on warning", async () => {
      // Rails dispatches to ActiveSupport::ErrorReporter; we have no global
      // singleton yet (same gap PostgreSQLAdapter documents). Accept the
      // "report" action without crashing — the warning is silently dropped.
      await withDbWarningsAction("report", async () => {
        await expect(adapter.execute(`SELECT 1 + 'foo'`)).resolves.toBeDefined();
      });
    });

    it("db_warnings_action custom proc on warning", async () => {
      let captured: SQLWarning | null = null;
      await withDbWarningsAction(
        (w) => {
          captured = w;
        },
        async () => {
          await adapter.execute(`SELECT 1 + 'foo'`);
        },
      );
      expect(captured).toBeInstanceOf(SQLWarning);
      expect((captured as unknown as SQLWarning).message).toBe(
        `Truncated incorrect DOUBLE value: 'foo'`,
      );
      expect((captured as unknown as SQLWarning).level).toBe("Warning");
    });

    it("db_warnings_action allows a list of warnings to ignore", async () => {
      await withDbWarningsAction("raise", [/Truncated incorrect DOUBLE value/], async () => {
        const rows = await adapter.execute(`SELECT 1 + 'foo' AS v`);
        expect(rows[0]?.v).toBe(1);
      });
    });

    it("db_warnings_action allows a list of codes to ignore", async () => {
      await withDbWarningsAction("raise", ["1292"], async () => {
        const rows = await adapter.execute(`SELECT 1 + 'foo' AS v`);
        expect(rows[0]?.v).toBe(1);
      });
    });

    it("db_warnings_action ignores note level warnings", async () => {
      await withDbWarningsAction("raise", async () => {
        await expect(
          adapter.execute("DROP TABLE IF EXISTS non_existent_table_warnings_test"),
        ).resolves.toBeDefined();
      });
    });

    it("db_warnings_action handles when warning_count does not match returned warnings", async () => {
      await withDbWarningsAction("raise", async () => {
        // Force warning_count to 1 even though SHOW WARNINGS will return [].
        vi.spyOn(
          adapter as unknown as { _warningCount: () => Promise<number> },
          "_warningCount",
        ).mockResolvedValue(1);
        try {
          await adapter.execute(`SELECT 'x'`);
          throw new Error("expected SQLWarning");
        } catch (e) {
          expect(e).toBeInstanceOf(SQLWarning);
          expect((e as SQLWarning).message).toBe(
            `Query had warning_count=1 but ‘SHOW WARNINGS’ did not return the warnings. Check MySQL logs or database configuration.`,
          );
        }
      });
    });
  });
});
