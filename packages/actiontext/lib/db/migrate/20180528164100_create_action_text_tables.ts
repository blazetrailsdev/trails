import { Migration } from "@blazetrails/activerecord";
import { TopLevel } from "@blazetrails/activesupport";

export class CreateActionTextTables extends Migration.get(6.0) {
  async change(): Promise<void> {
    const [primaryKeyType, foreignKeyType] = this.primaryAndForeignKeyTypes();

    await this.createTable("action_text_rich_texts", { id: primaryKeyType }, (t) => {
      t.string("name", { null: false });
      t.text("body", { size: "long" });
      t.references("record", {
        null: false,
        polymorphic: true,
        index: false,
        type: foreignKeyType,
      });

      t.timestamps();

      t.index(["record_type", "record_id", "name"], {
        name: "index_action_text_rich_texts_uniqueness",
        unique: true,
      });
    });
  }

  /** @internal */
  private primaryAndForeignKeyTypes(): [string, string] {
    const config = TopLevel.Trails!.configuration!.generators();
    const setting = config.options.get(config.orm!())!.primaryKeyType as string | null | undefined;
    const primaryKeyType = setting || "primary_key";
    const foreignKeyType = setting || "bigint";
    return [primaryKeyType, foreignKeyType];
  }
}
