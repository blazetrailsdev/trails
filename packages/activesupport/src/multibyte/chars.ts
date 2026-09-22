import { NoMethodError } from "@blazetrails/ruby-compat";
import { String as JsonString } from "../core-ext/object/json.js";
import { truncateBytes } from "../string-utils.js";
import { Unicode } from "./unicode.js";

export class Chars {
  wrappedString: string;

  constructor(string: string) {
    this.wrappedString = string;
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop, receiver);
        if (!target.respondToMissing(prop, false)) {
          if (prop === "then" || prop === "toJSON" || prop === "asymmetricMatch") return undefined;
          return () => {
            throw new NoMethodError(`undefined method '${prop}' for an instance of Chars`);
          };
        }
        const member = (target.wrappedString as unknown as Record<string, unknown>)[prop];
        if (typeof member !== "function") return target.methodMissing(prop);
        return (...args: unknown[]) => target.methodMissing(prop, ...args);
      },
      has(target, prop) {
        return prop in target || (typeof prop === "string" && target.respondToMissing(prop, false));
      },
    });
  }

  toS(): string {
    return this.wrappedString;
  }

  toStr(): string {
    return this.wrappedString;
  }

  isMatch(pattern: RegExp | string): boolean {
    return new RegExp(pattern).test(this.wrappedString);
  }

  actsLikeString(): boolean {
    return true;
  }

  methodMissing(method: string, ...args: unknown[]): unknown {
    const member = (this.wrappedString as unknown as Record<string, unknown>)[method];
    const result = typeof member === "function" ? member.apply(this.wrappedString, args) : member;
    if (method.endsWith("Bang")) {
      return result != null && result !== false ? this : null;
    } else {
      return typeof result === "string" ? this.chars(result) : result;
    }
  }

  respondToMissing(method: string, _includePrivate: boolean): boolean {
    return method in Object(this.wrappedString);
  }

  split(...args: Parameters<string["split"]>): Chars[] {
    return this.wrappedString.split(...args).map((i) => new (this.constructor as typeof Chars)(i));
  }

  sliceBang(start: number, length: number = 1): Chars | null {
    const chars = [...this.wrappedString];
    if (start < 0) start += chars.length;
    if (start < 0 || start > chars.length || length < 0) return null;
    const stringSliced = chars.splice(start, length).join("");
    this.wrappedString = chars.join("");
    return this.chars(stringSliced);
  }

  /** @missingRailsArgs join — PERMANENT */
  reverse(): Chars {
    return this.chars(graphemeClusters(this.wrappedString).reverse().join(""));
  }

  limit(limit: number): Chars {
    return this.chars(truncateBytes(this.wrappedString, limit, { omission: null }));
  }

  titleize(): Chars {
    return this.chars(
      this.wrappedString.toLowerCase().replace(/\b('?\S)/gu, (_m, c: string) => c.toUpperCase()),
    );
  }

  titlecase(): Chars {
    return this.titleize();
  }

  decompose(): Chars {
    return this.chars(
      String.fromCodePoint(...Unicode.decompose(":canonical", codepoints(this.wrappedString))),
    );
  }

  compose(): Chars {
    return this.chars(String.fromCodePoint(...Unicode.compose(codepoints(this.wrappedString))));
  }

  graphemeLength(): number {
    return graphemeClusters(this.wrappedString).length;
  }

  tidyBytes(force: boolean = false): Chars {
    return this.chars(Unicode.tidyBytes(this.wrappedString, force));
  }

  asJson(_options: unknown = null): unknown {
    return JsonString.asJson(this.toS());
  }

  reverseBang(...args: []): this {
    this.wrappedString = this.reverse(...args).toS();
    return this;
  }

  tidyBytesBang(...args: [force?: boolean]): this {
    this.wrappedString = this.tidyBytes(...args).toS();
    return this;
  }

  /** @internal */
  private chars(string: string): Chars {
    return new (this.constructor as typeof Chars)(string);
  }
}

function graphemeClusters(string: string): string[] {
  return Array.from(new Intl.Segmenter().segment(string), (s) => s.segment);
}

function codepoints(string: string): number[] {
  return Array.from(string, (c) => c.codePointAt(0)!);
}
