import {
  cmp,
  equals as cmpEquals,
  KERNEL_METHODS,
  NoMethodError,
  PROTOCOL_PROBES,
  rbStrMatch,
  rbStrRespondTo,
  rbStrSend,
  sliceBang,
  STRING_METHOD_TABLE,
  stringSplit,
} from "@blazetrails/ruby-compat";
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
        if (KERNEL_METHODS.has(prop) || !target.respondToMissing(prop, false)) {
          if (PROTOCOL_PROBES.has(prop) || KERNEL_METHODS.has(prop)) return undefined;
          return () => {
            throw new NoMethodError(`undefined method '${prop}' for an instance of Chars`);
          };
        }
        const member = (target.wrappedString as unknown as Record<string, unknown>)[prop];
        if (!(prop in STRING_METHOD_TABLE) && typeof member !== "function") {
          return target.methodMissing.call(receiver, prop);
        }
        return (...args: unknown[]) => target.methodMissing.call(receiver, prop, ...args);
      },
      has(target, prop) {
        if (prop in target) return true;
        if (typeof prop !== "string" || KERNEL_METHODS.has(prop)) return false;
        return target.respondToMissing(prop, false);
      },
    });
  }

  toS(): string {
    return this.wrappedString;
  }

  toStr(): string {
    return this.wrappedString;
  }

  compareTo(other: unknown): number | null {
    return cmp(this.wrappedString, other);
  }

  equals = cmpEquals;

  matchOperator(pattern: unknown): unknown {
    return rbStrMatch(this.wrappedString, pattern);
  }

  isMatch(pattern: RegExp | string): boolean {
    return new RegExp(pattern).test(this.wrappedString);
  }

  actsLikeString(): boolean {
    return true;
  }

  methodMissing(method: string, ...args: unknown[]): unknown {
    let result: unknown;
    [result, this.wrappedString] = rbStrSend(this.wrappedString, method, ...args);
    if (method.endsWith("Bang")) {
      return result != null && result !== false ? this : null;
    } else {
      return typeof result === "string" ? this.chars(result) : result;
    }
  }

  respondToMissing(method: string, includePrivate: boolean): boolean {
    return rbStrRespondTo(this.wrappedString, method, includePrivate);
  }

  split(...args: [pattern?: string | RegExp | null, limit?: number]): Chars[] {
    return stringSplit(this.wrappedString, ...args).map(
      (i) => new (this.constructor as typeof Chars)(i),
    );
  }

  sliceBang(
    ...args: Parameters<typeof sliceBang> extends [string, ...infer A] ? A : never
  ): Chars | null {
    const [stringSliced, rest] = sliceBang(this.wrappedString, ...args);
    this.wrappedString = rest;
    if (stringSliced != null) {
      return this.chars(stringSliced);
    }
    return null;
  }

  /** @missingRailsArgs join — PERMANENT */
  reverse(): Chars {
    return this.chars(graphemeClusters(this.wrappedString).reverse().join(""));
  }

  limit(limit: number): Chars {
    return this.chars(truncateBytes(this.wrappedString, limit, { omission: null }));
  }

  /** @missingRailsName gsub — PERMANENT */
  titleize(): Chars {
    return this.chars(
      this.wrappedString
        .toLowerCase()
        .replace(WORD_BOUNDARY_TITLEIZE, (_m, c: string) => c.toUpperCase()),
    );
  }

  titlecase(): Chars {
    return this.titleize();
  }

  /** @missingRailsName pack — PERMANENT */
  decompose(): Chars {
    return this.chars(
      String.fromCodePoint(...Unicode.decompose(":canonical", codepoints(this.wrappedString))),
    );
  }

  /** @missingRailsName pack — PERMANENT */
  compose(): Chars {
    return this.chars(String.fromCodePoint(...Unicode.compose(codepoints(this.wrappedString))));
  }

  graphemeLength(): number {
    return graphemeClusters(this.wrappedString).length;
  }

  tidyBytes(force: boolean = false): Chars {
    return this.chars(Unicode.tidyBytes(this.wrappedString, force));
  }

  /** @missingRailsName options — PERMANENT */
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

const W = "[\\p{L}\\p{M}\\p{N}\\p{Pc}]";
const WORD_BOUNDARY_TITLEIZE = new RegExp(`(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))('?\\S)`, "gu");

function graphemeClusters(string: string): string[] {
  return Array.from(new Intl.Segmenter().segment(string), (s) => s.segment);
}

function codepoints(string: string): number[] {
  return Array.from(string, (c) => c.codePointAt(0)!);
}
