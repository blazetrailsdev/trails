import { ApplicationRecord } from "./application-record";

export class Note extends ApplicationRecord {
  static {
    this.belongsTo("notebook");

    this.validates("title", { presence: true });

    this.scope("pinned", function () {
      return this.where({ pinned: true });
    });
  }
}
