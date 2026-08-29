import { Base } from "../../base.js";

export class UuidEntry extends Base {
  static {
    this.delegatedType("entryable", {
      types: ["UuidMessage", "UuidComment"],
      primaryKey: "uuid",
      foreignKey: "entryable_uuid",
    });
  }
}
