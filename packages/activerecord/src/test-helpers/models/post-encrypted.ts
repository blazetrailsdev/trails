import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { DerivedSecretKeyProvider } from "../../encryption/derived-secret-key-provider.js";

export class MutableDerivedSecretKeyProvider extends DerivedSecretKeyProvider {
  declare keys: string[];
}
constSet(TopLevel, "MutableDerivedSecretKeyProvider", MutableDerivedSecretKeyProvider);

export class EncryptedPost extends Base {
  declare title: string;
  static _tableName = "posts";

  static {
    this.encrypts("title");
    this.encrypts("body", {
      keyProvider: new MutableDerivedSecretKeyProvider("my post body secret!"),
    });
  }
}
constSet(TopLevel, "EncryptedPost", EncryptedPost);
DescendantsTracker.registerSubclass(Base, EncryptedPost);
