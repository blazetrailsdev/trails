import { Concurrent } from "@blazetrails/ruby-compat/concurrent/map";
import { Hash } from "@blazetrails/ruby-compat/hash";

type StringHash = Hash<string, string> | InstanceType<typeof Concurrent.Map<string, string>>;

/** @internal */
export class StringDeduper {
  static global: StringDeduper | UnaryMinusGlobalStringDeduper;

  /** @internal */
  private readonly strings: StringHash;

  constructor() {
    this.strings = this.createHash((h, k) => {
      const v = k;
      h.set(v, v);
      return v;
    });
  }

  dedupe(string: string): string {
    if (Object.isFrozen(string)) return string;
    return this.strings.get(string)!;
  }

  /** @internal */
  protected createHash(block: (h: StringHash, k: string) => string): StringHash {
    return new Hash(block);
  }
}

/** @internal */
export class ConcurrentStringDeduper extends StringDeduper {
  /** @internal */
  protected override createHash(block: (h: StringHash, k: string) => string): StringHash {
    return new Concurrent.Map(null, block);
  }
}

/** @internal */
export class UnaryMinusGlobalStringDeduper {
  dedupe(string: string): string {
    if (Object.isFrozen(string)) return string;
    return string;
  }
}

StringDeduper.global = new UnaryMinusGlobalStringDeduper();
