// vendor/rails/activerecord/test/models/contact.rb
import { Base } from "../../base.js";

// Contact uses a fake adapter with synthetic columns (ContactFakeColumns).
// The fake adapter infrastructure is not ported; these classes declare the
// association shape used by tests that exercise STI and serialization paths.

// The fake adapter's synthetic column list (id, name, age, avatar, created_at,
// awesome, preferences, alternative_id) is declared directly on the class so
// in-memory `new Contact(...)` round-trips the same attribute set Rails exposes.
function declareContactColumns(klass: typeof Base): void {
  klass.attribute("id", "integer");
  klass.attribute("name", "string");
  klass.attribute("age", "integer");
  klass.attribute("avatar", "string");
  klass.attribute("created_at", "string");
  klass.attribute("awesome", "boolean");
  klass.attribute("preferences", "string");
  klass.attribute("alternative_id", "integer");
}

export class Contact extends Base {
  static {
    declareContactColumns(this);
    this.serialize("preferences");
    this.belongsTo("alternative", { className: "Contact" });
  }
}

export class ContactSti extends Base {
  static {
    this._tableName = "contacts";
    declareContactColumns(this);
    this.attribute("type", "string");
    this.serialize("preferences");
    this.belongsTo("alternative", { className: "ContactSti" });
  }
}
