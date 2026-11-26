import { delegate } from "@blazetrails/activesupport";
import { included } from "@blazetrails/ruby-compat/include";
import type { BigDecimal } from "@blazetrails/activesupport";
import { Base } from "../../lib/base.js";
import { Migration } from "../../lib/migration.js";
import type { AbstractAdapter } from "../../lib/connection-adapters/abstract-adapter.js";

declare module "../../lib/migration.js" {
  namespace Migration {
    let messageCount: number;
  }
}
Migration.messageCount = 0;

export const CONNECTION_METHODS = [
  "addColumn",
  "removeColumn",
  "renameColumn",
  "addIndex",
  "changeColumn",
  "renameTable",
  "columnExists",
  "indexExists",
  "addReference",
  "addBelongsTo",
  "removeReference",
  "removeReferences",
  "removeBelongsTo",
] as const;

export class TestModel extends Base {
  declare age: unknown;
  declare bio: unknown;
  declare birthday: unknown;
  declare command: unknown;
  declare contributor: unknown;
  declare exgirlfriend: unknown;
  declare favorite_day: unknown;
  declare first_name: unknown;
  declare height: unknown;
  declare last_name: unknown;
  declare nick_name: unknown;
  declare wealth: BigDecimal | null;
  static {
    this._tableName = "test_models";
  }
}

type ConnectionMethods = Pick<
  AbstractAdapter,
  Extract<(typeof CONNECTION_METHODS)[number], keyof AbstractAdapter>
>;

export interface TestHelper extends ConnectionMethods {
  connection: AbstractAdapter;
  tableName: string;
  setup(): Promise<void>;
  teardown(): Promise<void>;
}

export const TestHelper = {
  [included](base: { prototype: object }): void {
    delegate.call(base.prototype, ...CONNECTION_METHODS, { to: "connection" });
  },

  async setup(this: TestHelper): Promise<void> {
    this.connection = await Base.leaseConnection();
    await this.connection.createTable("test_models", {}, (t) => {
      t.timestamps({ null: true });
    });

    await TestModel.resetColumnInformation();
  },

  async teardown(this: TestHelper): Promise<void> {
    TestModel.resetTableName();
    await TestModel.resetSequenceName();
    await this.connection.dropTable("test_models", { ifExists: true });
  },
};
