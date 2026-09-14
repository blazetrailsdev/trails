import { delegate } from "@blazetrails/activesupport";
import { included } from "@blazetrails/ruby-compat";
import type { BigDecimal } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";

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
    this.connection = (await Base.leaseConnection()) as unknown as AbstractAdapter;
    await this.connection.createTable("test_models", {}, (t) => {
      t.timestamps({ null: true });
    });

    void TestModel.resetColumnInformation();
  },

  async teardown(this: TestHelper): Promise<void> {
    TestModel.resetTableName();
    TestModel.resetSequenceName();
    await this.connection.dropTable("test_models", { ifExists: true });
  },
};
