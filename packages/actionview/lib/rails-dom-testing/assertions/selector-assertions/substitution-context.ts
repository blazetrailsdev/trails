import { rbInspect } from "@blazetrails/ruby-compat/object";
import { rbRegInitStr, rbRegToS } from "@blazetrails/ruby-compat/regexp";
import type { Html5Node, NodeSet } from "@blazetrails/nokogiri";

export class SubstitutionContext {
  private readonly substitute: string;

  constructor() {
    this.substitute = "?";
  }

  substituteBang(selector: string, values: unknown[], formatForPresentation = false): string {
    return selector.replaceAll(this.substitute, (match) => {
      if (values.length === 0 || !this.isSubstitutable(values[0])) return match[0];
      return this.matcherFor(values.shift(), formatForPresentation);
    });
  }

  match(matches: NodeSet, attribute: string, matcher: string): Html5Node[] {
    return matches.findAll((node: Html5Node) => {
      const value = node.get(attribute);
      return value != null && rbRegInitStr(matcher).test(value);
    });
  }

  /** @inventedArm rbInspect — CONVERGEABLE rails-dom-testing-regexp-substitution-css-unescape */
  private matcherFor(value: unknown, formatForPresentation: boolean): string {
    if (formatForPresentation) {
      return rbInspect(value);
    } else if (value instanceof RegExp) {
      return rbInspect(rbRegToS(value, "onig"));
    } else {
      return rbInspect(String(value));
    }
  }

  private isSubstitutable(value: unknown): boolean {
    return typeof value === "string" || typeof value === "number" || value instanceof RegExp;
  }
}
