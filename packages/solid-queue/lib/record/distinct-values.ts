import { Concern, extend, squish } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";
import { sql } from "@blazetrails/arel";
import type { Record } from "../record.js";

export class ClassMethods {
  static async distinctValuesOf(this: typeof Record, column: string): Promise<unknown[]> {
    if (await ClassMethods.isLooseIndexScanEmulationNeeded.call(this)) {
      return await ClassMethods.looseDistinctViaRecursiveCte.call(this, column);
    } else {
      return await this.distinct().pluck(column);
    }
  }

  /** @internal */
  static async isLooseIndexScanEmulationNeeded(this: typeof Record): Promise<boolean> {
    return await this.connectionPool().withConnection(
      async (connection) => connection.adapterName === "PostgreSQL",
    );
  }

  /** @internal */
  static async looseDistinctViaRecursiveCte(
    this: typeof Record,
    column: string,
  ): Promise<unknown[]> {
    return await this.connectionPool().withConnection(async (connection) => {
      const col = connection.quoteColumnName(column);

      return await connection.selectValues(
        squish(`
          WITH RECURSIVE t AS (
            (${ClassMethods.nextDistinctValue.call(this, col, `${col} IS NOT NULL`)})
            UNION ALL
            SELECT (${ClassMethods.nextDistinctValue.call(this, col, `${col} > t.${col}`)}) FROM t WHERE t.${col} IS NOT NULL
          )
          SELECT ${col} FROM t WHERE ${col} IS NOT NULL
        `),
      );
    });
  }

  /** @internal */
  static nextDistinctValue(this: typeof Record, col: string, condition: string): string {
    return this.all().where(sql(condition)).reorder(sql(col)).limit(1).select(sql(col)).toSql();
  }
}

export class DistinctValues {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
}
extend(DistinctValues, Concern);
Object.defineProperty(DistinctValues, "ClassMethods", { value: ClassMethods });
