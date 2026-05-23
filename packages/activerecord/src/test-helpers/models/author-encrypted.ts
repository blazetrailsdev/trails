// vendor/rails/activerecord/test/models/author_encrypted.rb
import { Base } from "../../base.js";
import { Scheme } from "../../encryption/scheme.js";

export class EncryptedAuthor extends Base {
  static _tableName = "authors";

  static {
    this.validates("name", { uniqueness: true });
    this.encrypts("name", { previousSchemes: [new Scheme({ deterministic: true })] });
  }
}

export class EncryptedAuthorWithKey extends Base {
  static _tableName = "authors";

  static {
    this.encrypts("name", { key: "some secret key!" });
  }
}
