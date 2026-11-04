import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { Scheme } from "../../encryption/scheme.js";

export class EncryptedAuthor extends Base {
  static _tableName = "authors";

  static {
    this.validates("name", { uniqueness: true });
    this.encrypts("name", { previousSchemes: [new Scheme({ deterministic: true })] });
  }
}
constSet(TopLevel, "EncryptedAuthor", EncryptedAuthor);
DescendantsTracker.registerSubclass(Base, EncryptedAuthor);

export class EncryptedAuthorWithKey extends Base {
  static _tableName = "authors";

  static {
    this.encrypts("name", { key: "some secret key!" });
  }
}
constSet(TopLevel, "EncryptedAuthorWithKey", EncryptedAuthorWithKey);
DescendantsTracker.registerSubclass(Base, EncryptedAuthorWithKey);
