import { Hash } from "@blazetrails/ruby-compat";

/** @internal */
export class StringDeduper {
  static global: StringDeduper | UnaryMinusGlobalStringDeduper;

  /** @internal */
  private readonly strings: Hash<string, string>;

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
  protected createHash(
    block: (h: Hash<string, string>, k: string) => string,
  ): Hash<string, string> {
    return new Hash(block);
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
