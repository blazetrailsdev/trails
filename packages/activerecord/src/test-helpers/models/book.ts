// vendor/rails/activerecord/test/models/book.rb
import { Base } from "../../base.js";

export class Book extends Base {
  static {
    this.belongsTo("author");
    this.belongsTo("formatRecord", { polymorphic: true });
    this.hasMany("citations", { inverseOf: "book" });
    this.hasMany("references", { through: "citations", source: "referenceOf" });
    this.hasMany("subscriptions");
    this.hasMany("subscribers", { through: "subscriptions" });
    this.hasOne("essay");
    this.aliasAttribute("title", "name");
    this.enum("status", { proposed: 0, written: 1, published: 2 });
    // Rails: { unread: 0, reading: 2, read: 3, forgotten: nil } — null value unsupported by enum()
    this.enum("lastRead", { unread: 0, reading: 2, read: 3 });
    this.enum("nullableStatus", { single: 0, married: 1 });
    this.enum("language", { english: 0, spanish: 1, french: 2 }, { prefix: "in" });
    this.enum("authorVisibility", { visible: 0, invisible: 1 }, { prefix: true });
    this.enum("illustratorVisibility", { visible: 0, invisible: 1 }, { prefix: true });
    this.enum("fontSize", { small: 0, medium: 1, large: 2 }, { prefix: "with", suffix: true });
    this.enum("difficulty", { easy: 0, medium: 1, hard: 2 }, { suffix: "toRead" });
    // Rails: { hard: "hard", soft: "soft" } — string values unsupported by enum(); using integers
    this.enum("cover", { hard: 0, soft: 1 });
    // Rails: { enabled: true, disabled: false } — boolean values unsupported by enum(); using integers
    this.enum("booleanStatus", { enabled: 0, disabled: 1 });
  }
}

export class PublishedBook extends Base {
  static _tableName = "books";

  static {
    // Rails: { hard: "0", soft: "1" } — string values unsupported by enum(); using integers
    this.enum("cover", { hard: 0, soft: 1 });
    this.validates("isbn", { uniqueness: true });
  }
}
