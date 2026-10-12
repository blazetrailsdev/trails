import { Base } from "../../base.js";
import { Scheme } from "../../encryption/scheme.js";
import { registerModel } from "../../associations.js";

export class EncryptedAuthor extends Base {
  static _tableName = "authors";

  static {
    this.validates("name", { uniqueness: true });
    this.encrypts("name", { previousSchemes: [new Scheme({ deterministic: true })] });
  }
}
registerModel(EncryptedAuthor);

export class EncryptedAuthorWithKey extends Base {
  static _tableName = "authors";

  static {
    this.encrypts("name", { key: "some secret key!" });
  }
}
registerModel(EncryptedAuthorWithKey);
