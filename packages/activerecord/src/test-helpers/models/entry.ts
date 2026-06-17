import type { Temporal } from "@blazetrails/activesupport/temporal";
import type { Account } from "./account.js";
// vendor/rails/activerecord/test/models/entry.rb
import { Base } from "../../base.js";

export class Entry extends Base {
  declare account: Account | null;
  declare loadBelongsTo: (name: "account") => Promise<Account | null>;
  declare account_id: number;
  declare entryable_id: number;
  declare entryable_type: string;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

  static {
    this.delegatedType("entryable", { types: ["Message", "Comment"] });
    this.belongsTo("account", { touch: true });

    this.delegatedType("thing", {
      types: ["Post"],
      foreignKey: "entryable_id",
      foreignType: "entryable_type",
    });
  }
}
