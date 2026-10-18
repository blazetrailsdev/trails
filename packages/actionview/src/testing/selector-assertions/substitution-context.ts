import { rbInspect, rbRegInitStr, rbRegToS } from "@blazetrails/ruby-compat";
import type { Html5Node } from "@blazetrails/nokogiri";

export class SubstitutionContext {
  private readonly _substitute: string;

  constructor() {
    this._substitute = "?";
  }

  substituteBang(selector: string, values: unknown[], formatForPresentation = false): string {
    return selector.replaceAll(this._substitute, (match) => {
      if (values.length === 0 || !this.isSubstitutable(values[0])) return match[0];
      return this.matcherFor(values.shift(), formatForPresentation);
    });
  }

  match(matches: Html5Node[], attribute: string, matcher: string): Html5Node[] {
    return matches.filter((node) => {
      const value = node.get(attribute);
      return value != null && rbRegInitStr(matcher).test(value);
    });
  }

  private matcherFor(value: unknown, formatForPresentation: boolean): string {
    if (formatForPresentation) {
      return rbInspect(value);
    } else if (value instanceof RegExp) {
      return `"${rbRegToS(value, "onig")}"`;
    } else {
      return rbInspect(String(value));
    }
  }

  private isSubstitutable(value: unknown): boolean {
    return typeof value === "string" || typeof value === "number" || value instanceof RegExp;
  }
}
