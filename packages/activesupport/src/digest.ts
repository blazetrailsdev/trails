import { ArgumentError } from "./hash-utils.js";
import { OpenSSL, type DigestClass } from "@blazetrails/ruby-compat";

export class Digest {
  private static _hashDigestClass?: DigestClass;

  static get hashDigestClass(): DigestClass {
    return (this._hashDigestClass ??= OpenSSL.Digest.MD5);
  }

  static set hashDigestClass(klass: DigestClass) {
    if (typeof (klass as DigestClass | null)?.hexdigest !== "function") {
      throw new ArgumentError(`${String(klass)} is expected to implement hexdigest class method`);
    }
    this._hashDigestClass = klass;
  }

  static hexdigest(arg: string): string {
    return this.hashDigestClass.hexdigest(arg).slice(0, 32);
  }
}
