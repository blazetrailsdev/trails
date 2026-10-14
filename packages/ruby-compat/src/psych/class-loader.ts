import { ArgumentError } from "../argument-error.js";
import { NameError } from "../name-error.js";
import { rbPathToClass } from "../variable.js";
import { DisallowedClass } from "./exception.js";

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/**
 * `Psych::ClassLoader` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/class_loader.rb:6`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class ClassLoader {
  /** @noRailsEquivalent PERMANENT */
  static readonly BIG_DECIMAL = "BigDecimal";
  /** @noRailsEquivalent PERMANENT */
  static readonly COMPLEX = "Complex";
  /** @noRailsEquivalent PERMANENT */
  static readonly DATE = "Date";
  /** @noRailsEquivalent PERMANENT */
  static readonly DATE_TIME = "DateTime";
  /** @noRailsEquivalent PERMANENT */
  static readonly EXCEPTION = "Exception";
  /** @noRailsEquivalent PERMANENT */
  static readonly OBJECT = "Object";
  /** @noRailsEquivalent PERMANENT */
  static readonly PSYCH_OMAP = "Psych::Omap";
  /** @noRailsEquivalent PERMANENT */
  static readonly PSYCH_SET = "Psych::Set";
  /** @noRailsEquivalent PERMANENT */
  static readonly RANGE = "Range";
  /** @noRailsEquivalent PERMANENT */
  static readonly RATIONAL = "Rational";
  /** @noRailsEquivalent PERMANENT */
  static readonly REGEXP = "Regexp";
  /** @noRailsEquivalent PERMANENT */
  static readonly STRUCT = "Struct";
  /** @noRailsEquivalent PERMANENT */
  static readonly SYMBOL = "Symbol";

  /** @noRailsEquivalent PERMANENT */
  declare static Restricted: typeof Restricted;

  /** @internal */
  protected cache: Record<string, unknown>;

  /** @noRailsEquivalent PERMANENT */
  constructor() {
    this.cache = { ...CACHE };
  }

  /** @noRailsEquivalent PERMANENT */
  load(klassname: string | null | undefined): unknown {
    if (klassname == null || klassname === "") return null;

    return this.find(klassname);
  }

  /** @noRailsEquivalent PERMANENT */
  symbolize(sym: string): string {
    this.symbol();
    return `:${sym}`;
  }

  /** @internal */
  protected find(klassname: string): unknown {
    return (this.cache[klassname] ||= this.resolve(klassname));
  }

  private resolve(klassname: string): unknown {
    let name = klassname;
    let retried: unknown = false;

    for (;;) {
      try {
        return this.path2class(name);
      } catch (ex) {
        if (!(ex instanceof ArgumentError || ex instanceof NameError)) throw ex;
        if (retried === false) {
          name = `Struct::${name}`;
          retried = ex;
          continue;
        }
        throw retried;
      }
    }
  }

  /** `vendor/ruby/v3.3.11/ext/psych/psych_to_ruby.c:22`. */
  private path2class(path: string): unknown {
    return rbPathToClass(path);
  }
}

export interface ClassLoader {
  /** @noRailsEquivalent PERMANENT */
  bigDecimal(): unknown;
  /** @noRailsEquivalent PERMANENT */
  complex(): unknown;
  /** @noRailsEquivalent PERMANENT */
  date(): unknown;
  /** @noRailsEquivalent PERMANENT */
  dateTime(): unknown;
  /** @noRailsEquivalent PERMANENT */
  exception(): unknown;
  /** @noRailsEquivalent PERMANENT */
  object(): unknown;
  /** @noRailsEquivalent PERMANENT */
  psychOmap(): unknown;
  /** @noRailsEquivalent PERMANENT */
  psychSet(): unknown;
  /** @noRailsEquivalent PERMANENT */
  range(): unknown;
  /** @noRailsEquivalent PERMANENT */
  rational(): unknown;
  /** @noRailsEquivalent PERMANENT */
  regexp(): unknown;
  /** @noRailsEquivalent PERMANENT */
  struct(): unknown;
  /** @noRailsEquivalent PERMANENT */
  symbol(): unknown;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

const constants = Object.entries(ClassLoader) as [string, string][];

for (const [konst, val] of constants) {
  const name = konst.toLowerCase().replace(/_(.)/g, (_, c: string) => c.toUpperCase());
  Object.defineProperty(ClassLoader.prototype, name, {
    value(this: ClassLoader) {
      return this.load(val);
    },
    writable: true,
    configurable: true,
  });
}

const CACHE: Readonly<Record<string, unknown>> = Object.freeze(
  Object.fromEntries(
    constants.flatMap(([, val]) => {
      try {
        return [[val, rbPathToClass(val)]];
      } catch {
        return [];
      }
    }),
  ),
);

/**
 * `Psych::ClassLoader::Restricted` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/class_loader.rb:76`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Restricted extends ClassLoader {
  private classes: string[];
  private symbols: string[];

  /** @noRailsEquivalent PERMANENT */
  constructor(classes: string[], symbols: string[]) {
    super();
    this.classes = classes;
    this.symbols = symbols;
  }

  /** @noRailsEquivalent PERMANENT */
  override symbolize(sym: string): string {
    if (this.symbols.length === 0) return super.symbolize(sym);

    if (this.symbols.includes(sym)) {
      return super.symbolize(sym);
    } else {
      throw new DisallowedClass("load", "Symbol");
    }
  }

  /** @internal */
  protected override find(klassname: string): unknown {
    if (this.classes.includes(klassname)) {
      return super.find(klassname);
    } else {
      throw new DisallowedClass("load", klassname);
    }
  }
}

ClassLoader.Restricted = Restricted;
