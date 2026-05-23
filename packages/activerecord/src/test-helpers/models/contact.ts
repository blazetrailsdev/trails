// vendor/rails/activerecord/test/models/contact.rb
import { Base } from "../../base.js";

// Contact uses a fake adapter with synthetic columns (ContactFakeColumns).
// The fake adapter infrastructure is not ported; these classes declare the
// association shape used by tests that exercise STI and serialization paths.

export class Contact extends Base {
  static {
    this.serialize("preferences");
    this.belongsTo("alternative", { className: "Contact" });
  }
}

export class ContactSti extends Base {
  static {
    this._tableName = "contacts";
    this.serialize("preferences");
    this.belongsTo("alternative", { className: "ContactSti" });
  }
}
