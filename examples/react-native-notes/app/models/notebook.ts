import { ApplicationRecord } from "./application-record";

export class Notebook extends ApplicationRecord {
  static {
    this.hasMany("notes", { dependent: "destroy" });

    this.validates("name", { presence: true });
  }
}
