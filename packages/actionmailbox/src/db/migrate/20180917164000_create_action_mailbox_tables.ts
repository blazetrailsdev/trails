import { Migration } from "@blazetrails/activerecord";
import { TopLevel } from "@blazetrails/activesupport";

export class CreateActionMailboxTables extends Migration.get(6.0) {
  async change(): Promise<void> {
    await this.createTable("action_mailbox_inbound_emails", { id: this.primaryKeyType() }, (t) => {
      t.integer("status", { default: 0, null: false });
      t.string("message_id", { null: false });
      t.string("message_checksum", { null: false });

      t.timestamps();

      t.index(["message_id", "message_checksum"], {
        name: "index_action_mailbox_inbound_emails_uniqueness",
        unique: true,
      });
    });
  }

  /** @internal */
  private primaryKeyType(): string {
    const config = TopLevel.Trails!.configuration!.generators();
    return (
      (config.options.get(config.orm!())!.primaryKeyType as string | null | undefined) ||
      "primary_key"
    );
  }
}
