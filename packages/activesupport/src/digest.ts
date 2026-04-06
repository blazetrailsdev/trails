import { getCrypto } from "./crypto-adapter.js";

type HashDigestClass = {
  hexdigest(data: string): string;
};

const MD5: HashDigestClass = {
  hexdigest(data: string): string {
    return getCrypto().createHash("md5").update(data).digest("hex");
  },
};

export class Digest {
  private static _hashDigestClass: HashDigestClass = MD5;

  static get hashDigestClass(): HashDigestClass {
    return this._hashDigestClass;
  }

  static set hashDigestClass(klass: HashDigestClass) {
    if (!klass || typeof klass.hexdigest !== "function") {
      throw new TypeError(`${String(klass)} is expected to implement hexdigest class method`);
    }
    this._hashDigestClass = klass;
  }

  static hexdigest(arg: string): string {
    return this._hashDigestClass.hexdigest(arg).slice(0, 32);
  }
}
