import { ApplicationRecord } from "./application-record.ts";

export class Tag extends ApplicationRecord {
  declare name: string;

  static {
    this.hasMany("taggings", { dependent: "destroy" });
    this.hasMany("bookmarks", { through: "taggings" });

    this.normalizes("name", { with: (name: string) => name.trim().toLowerCase() });
    this.validates("name", { presence: true, uniqueness: true, length: { maximum: 40 } });
  }
}
