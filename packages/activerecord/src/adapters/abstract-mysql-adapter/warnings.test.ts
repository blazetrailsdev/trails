import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
  Mysql2Adapter,
  withDbWarningsAction,
} from "./test-helper.js";
import { SQLWarning } from "../../errors.js";
import { Base } from "../../base.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
    await adapter.execute(`SELECT 1 FROM (SELECT 1) AS clear_warnings`);
  });
  afterEach(() => {
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
        const mysqlWarning = `[ActiveRecord::SQLWarning] Truncated incorrect DOUBLE value: 'foo' (1292)`;
        const logger = { warn: vi.fn() };
        const previousLogger = Base.logger;
        Base.logger = logger as never;
        try {
          await adapter.execute(`SELECT 1 + 'foo'`);
          expect(logger.warn).toHaveBeenCalledWith(mysqlWarning);
        } finally {
          Base.logger = previousLogger;
        }
      });
    });

    it("db_warnings_action :report on warning", async () => {
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
        vi.spyOn(
          adapter as unknown as { warningCount: () => Promise<number> },
          "warningCount",
        ).mockResolvedValue(1);
        const raised = adapter.execute(`SELECT 'x'`);
        await expect(raised).rejects.toBeInstanceOf(SQLWarning);
        await expect(raised).rejects.toThrow(
          `Query had warning_count=1 but ‘SHOW WARNINGS’ did not return the warnings. Check MySQL logs or database configuration.`,
        );
      });
    });
  });
});
