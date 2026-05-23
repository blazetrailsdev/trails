// vendor/rails/activerecord/test/models/post_encrypted.rb
import { Base } from "../../base.js";
import { DerivedSecretKeyProvider } from "../../encryption/derived-secret-key-provider.js";

export class MutableDerivedSecretKeyProvider extends DerivedSecretKeyProvider {
  declare keys: string[];
}

export class EncryptedPost extends Base {
  static _tableName = "posts";

  static {
    this.encrypts("title");
    this.encrypts("body", {
      keyProvider: new MutableDerivedSecretKeyProvider("my post body secret!"),
    });
  }
}
