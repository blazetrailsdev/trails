import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";
import { Scheme } from "../../lib/encryption/scheme.js";

export class EncryptedAuthor extends Base {
  static tableName = "authors";

  static {
    this.validates("name", { uniqueness: true });
    this.encrypts("name", { previousSchemes: [new Scheme({ deterministic: true })] });
  }
}
constSet(TopLevel, "EncryptedAuthor", EncryptedAuthor);
DescendantsTracker.registerSubclass(Base, EncryptedAuthor);

export class EncryptedAuthorWithKey extends Base {
  static tableName = "authors";

  static {
    this.encrypts("name", { key: "some secret key!" });
  }
}
constSet(TopLevel, "EncryptedAuthorWithKey", EncryptedAuthorWithKey);
DescendantsTracker.registerSubclass(Base, EncryptedAuthorWithKey);
