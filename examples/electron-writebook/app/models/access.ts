import { ApplicationRecord } from "./application-record.ts";

export class Access extends ApplicationRecord {
  declare level: "reader" | "editor";

  static {
    this.enum("level", { reader: "reader", editor: "editor" });

    this.belongsTo("user");
    this.belongsTo("book");
  }

  declare isEditor: () => boolean;
}
