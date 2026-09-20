import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assertRaises } from "@blazetrails/activesupport";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
  Mysql2Adapter,
  withDbWarningsAction,
} from "./test-helper.js";
import { SQLWarning } from "../../errors.js";
import { Base } from "../../base.js";
import type { Mysql2RawResult } from "../../connection-adapters/mysql2/database-statements.js";

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
        const error = await assertRaises([SQLWarning], {}, () =>
          adapter.execute(`SELECT 1 + 'foo'`),
        );

        expect((error as SQLWarning).connectionPool).toEqual(adapter.pool);
      });
    });

    it("db_warnings_action :ignore on warning", async () => {
      await withDbWarningsAction("ignore", async () => {
        const result = (await adapter.execute(`SELECT 1 + 'foo' AS v`)) as Mysql2RawResult;
        expect(result.rows?.[0]).toEqual([1]);
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
      const { ActiveSupport, ErrorReporter } = await import("@blazetrails/activesupport");
      const previousReporter = ActiveSupport.errorReporter;
      const errorReporter = new ErrorReporter();
      const events: Error[] = [];
      errorReporter.subscribe({
        report: (error) => {
          events.push(error);
        },
      });
      ActiveSupport.errorReporter = errorReporter;
      try {
        await withDbWarningsAction("report", async () => {
          await adapter.execute(`SELECT 1 + 'foo'`);

          const warningEvent = events[0];

          expect(warningEvent).toBeInstanceOf(SQLWarning);
          expect(warningEvent.message).toEqual(`Truncated incorrect DOUBLE value: 'foo'`);
        });
      } finally {
        ActiveSupport.errorReporter = previousReporter;
      }
    });

    it("db_warnings_action custom proc on warning", async () => {
      let warningMessage: string | null = null;
      let warningLevel: string | null = null;
      const warningAction = (warning: SQLWarning) => {
        warningMessage = warning.message;
        warningLevel = warning.level;
      };

      await withDbWarningsAction(warningAction, async () => {
        await adapter.execute(`SELECT 1 + 'foo'`);

        expect(warningMessage).toEqual(`Truncated incorrect DOUBLE value: 'foo'`);
        expect(warningLevel).toEqual("Warning");
      });
    });

    it("db_warnings_action allows a list of warnings to ignore", async () => {
      await withDbWarningsAction("raise", [/Truncated incorrect DOUBLE value/], async () => {
        const result = (await adapter.execute(`SELECT 1 + 'foo' AS v`)) as Mysql2RawResult;
        expect(result.rows?.[0]).toEqual([1]);
      });
    });

    it("db_warnings_action allows a list of codes to ignore", async () => {
      await withDbWarningsAction("raise", ["1292"], async () => {
        const result = (await adapter.execute(`SELECT 1 + 'foo' AS v`)) as Mysql2RawResult;
        expect(result.rows?.[0]).toEqual([1]);
      });
    });

    it("db_warnings_action ignores note level warnings", async () => {
      await withDbWarningsAction("raise", async () => {
        const result = (await adapter.execute(
          "DROP TABLE IF EXISTS non_existent_table_warnings_test",
        )) as Mysql2RawResult;

        expect(result.rows ?? []).toEqual([]);
      });
    });

    it("db_warnings_action handles when warning_count does not match returned warnings", async () => {
      await withDbWarningsAction("raise", async () => {
        vi.spyOn(
          adapter as unknown as { warningCount: () => Promise<number> },
          "warningCount",
        ).mockResolvedValue(1);
        const error = await assertRaises([SQLWarning], {}, () => adapter.execute(`SELECT 'x'`));

        const expected = `Query had warning_count=1 but ‘SHOW WARNINGS’ did not return the warnings. Check MySQL logs or database configuration.`;
        expect(error.message).toEqual(expected);
      });
    });
  });
});
