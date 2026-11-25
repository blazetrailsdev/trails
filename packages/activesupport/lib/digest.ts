import { ArgumentError } from "./hash-utils.js";
import { ActiveSupport } from "./namespaces.js";
import type { DigestClass } from "@blazetrails/ruby-compat/digest";
import { rbObjAsString } from "@blazetrails/ruby-compat/object";
import { OpenSSL } from "@blazetrails/ruby-compat/openssl";

export class Digest {
  private static _hashDigestClass?: DigestClass;

  static get hashDigestClass(): DigestClass {
    return (this._hashDigestClass ??= OpenSSL.Digest.MD5);
  }

  static set hashDigestClass(klass: DigestClass) {
    if (typeof (klass as DigestClass | null)?.hexdigest !== "function") {
      throw new ArgumentError(
        `${rbObjAsString(klass)} is expected to implement hexdigest class method`,
      );
    }
    this._hashDigestClass = klass;
  }

  static hexdigest(arg: string | Uint8Array): string {
    return this.hashDigestClass.hexdigest(arg).slice(0, 32);
  }
}

ActiveSupport.Digest = Digest;
