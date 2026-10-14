import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class UuidEntry extends Base {
  static {
    this.delegatedType("entryable", {
      types: ["UuidMessage", "UuidComment"],
      primaryKey: "uuid",
      foreignKey: "entryable_uuid",
    });
  }
}
registerModel(UuidEntry);
