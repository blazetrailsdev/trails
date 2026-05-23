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
    this.enum("last_read", { unread: 0, reading: 2, read: 3 });
    this.enum("nullable_status", { single: 0, married: 1 });
    this.enum("language", { english: 0, spanish: 1, french: 2 }, { prefix: "in" });
    this.enum("author_visibility", { visible: 0, invisible: 1 }, { prefix: true });
    this.enum("illustrator_visibility", { visible: 0, invisible: 1 }, { prefix: true });
    this.enum("font_size", { small: 0, medium: 1, large: 2 }, { prefix: "with", suffix: true });
    this.enum("difficulty", { easy: 0, medium: 1, hard: 2 }, { suffix: "toRead" });
    // Rails: cover { hard: "hard", soft: "soft" } and boolean_status { enabled: true, disabled: false }
    // omitted — non-integer enum values not yet supported by enum()
  }
}

export class PublishedBook extends Base {
  static _tableName = "books";

  static {
    // Rails: cover { hard: "0", soft: "1" } — string values unsupported by enum(); omitted
    this.validates("isbn", { uniqueness: true });
  }
}
