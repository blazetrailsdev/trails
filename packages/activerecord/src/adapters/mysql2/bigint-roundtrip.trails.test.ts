import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BigIntegerType } from "@blazetrails/activemodel";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
  Mysql2Adapter,
} from "../abstract-mysql-adapter/test-helper.js";
import type { Mysql2RawResult } from "../../connection-adapters/mysql2/database-statements.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  const type = new BigIntegerType({ limit: 8 });
  const BIG = 2n ** 62n;

  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
    await adapter.execute(`DROP TABLE IF EXISTS \`bigint_rt\``);
    await adapter.execute(`
      CREATE TABLE \`bigint_rt\` (
        \`id\`    BIGINT AUTO_INCREMENT PRIMARY KEY,
        \`score\` BIGINT NOT NULL,
        \`count\` INT NOT NULL DEFAULT 0
      )
    `);
  });

  afterEach(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS \`bigint_rt\``);
  });

  describe("MySQL bigint round-trip", () => {
    it("preserves exact value above Number.MAX_SAFE_INTEGER via BigIntegerType", async () => {
      const unsafe = 9007199254740993n;
      await adapter.execInsert(`INSERT INTO \`bigint_rt\` (\`score\`) VALUES (?)`, null, [unsafe]);
      const result = (await adapter.execute(
        `SELECT \`score\` FROM \`bigint_rt\``,
      )) as Mysql2RawResult;
      expect(type.cast(result.rows![0][0])).toBe(unsafe);
    });

    it("update round-trip preserves value", async () => {
      await adapter.execInsert(`INSERT INTO \`bigint_rt\` (\`score\`) VALUES (?)`, null, [BIG]);
      await adapter.execUpdate(`UPDATE \`bigint_rt\` SET \`score\` = ?`, null, [BIG + 1n]);
      const result = (await adapter.execute(
        `SELECT \`score\` FROM \`bigint_rt\``,
      )) as Mysql2RawResult;
      expect(type.cast(result.rows![0][0])).toBe(BIG + 1n);
    });

    it("safe-range BIGINT returns as number (auto-increment IDs unaffected)", async () => {
      await adapter.execInsert(`INSERT INTO \`bigint_rt\` (\`score\`) VALUES (?)`, null, [42]);
      const result = (await adapter.execute(
        `SELECT \`id\`, \`score\` FROM \`bigint_rt\``,
      )) as Mysql2RawResult;
      expect(typeof result.rows![0][0]).toBe("number");
      expect(typeof result.rows![0][1]).toBe("number");
    });

    it("INT column is unaffected by supportBigNumbers", async () => {
      await adapter.execInsert(
        `INSERT INTO \`bigint_rt\` (\`score\`, \`count\`) VALUES (?, ?)`,
        null,
        [BIG, 42],
      );
      const result = (await adapter.execute(
        `SELECT \`count\` FROM \`bigint_rt\``,
      )) as Mysql2RawResult;
      expect(typeof result.rows![0][0]).toBe("number");
      expect(result.rows![0][0]).toBe(42);
    });
  });
});
