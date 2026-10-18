import { diff } from "@blazetrails/activesupport";
import { ArgumentError, Range, strip } from "@blazetrails/ruby-compat";
import { XML, type Html5Node, type NodeSet } from "@blazetrails/nokogiri";
import { SubstitutionContext } from "./substitution-context.js";

const NO_STRIP = ["pre", "script", "style", "textarea"];

export interface EqualityTests {
  text?: string | RegExp;
  html?: string | RegExp;
  count?: number;
  minimum?: number;
  maximum?: number;
}

export class HTMLSelector {
  private static readonly context = new SubstitutionContext();

  cssSelector!: string;
  readonly tests: EqualityTests;
  message: unknown;
  private readonly _values: unknown[];
  private readonly _root: { css(...args: unknown[]): NodeSet };
  private _selector!: string;

  constructor(values: unknown[], previousSelection: unknown = null, rootFallback: () => unknown) {
    this._values = values;
    this._root = this.extractRoot(previousSelection, rootFallback) as HTMLSelector["_root"];
    this.extractSelectors();
    this.tests = this.extractEqualityTests();
    this.message = this._values.shift();

    if (this.message != null && Object.getPrototypeOf(this.message) === Object.prototype) {
      throw new ArgumentError(
        "Last argument was a Hash, which would be used for the assertion message. You probably want this to be a String, or you have the wrong type of arguments.",
      );
    }

    const extra = this._values.shift();
    if (extra != null && extra !== false) {
      throw new ArgumentError(
        "Not expecting that last argument, you either have too many arguments, or they're the wrong type",
      );
    }
  }

  isSelectingNoBody(): boolean {
    return this._selector === "body" && this.tests.count === 0;
  }

  select(): NodeSet {
    return this.filter(this._root.css(this._selector, HTMLSelector.context));
  }

  private filter(matches: NodeSet): NodeSet {
    const matchWith = this.tests.text ?? this.tests.html;
    if (matches.isEmpty() || matchWith == null) return matches;

    let contentMismatch: string | null = null;
    const textMatches = "text" in this.tests;
    const regexMatching = matchWith instanceof RegExp;

    const remaining = [...matches].filter((match: Html5Node) => {
      let content = textMatches ? match.text : match.children.join("");

      if (!NO_STRIP.includes(match.name)) content = strip(content);
      if (textMatches && match.name === "textarea" && content.startsWith("\n")) {
        content = content.slice(1);
      }

      if (regexMatching ? content.search(matchWith) !== -1 : content === matchWith) return true;
      contentMismatch ??= diff(matchWith, content);
      return false;
    });

    if (remaining.length === 0 && (this.message == null || this.message === false)) {
      this.message = contentMismatch;
    }
    return new XML.NodeSet(matches.document, remaining);
  }

  private extractRoot(previousSelection: unknown, rootFallback: () => unknown): unknown {
    const possibleRoot = this._values[0];

    if (possibleRoot == null) {
      throw new ArgumentError(
        "First argument is either selector or element " +
          "to select, but nil found. Perhaps you called assert_dom with " +
          "an element that does not exist?",
      );
    } else if (typeof (possibleRoot as { css?: unknown }).css === "function") {
      this._values.shift();
      return possibleRoot;
    } else if (previousSelection != null) {
      return previousSelection;
    } else {
      return rootFallback();
    }
  }

  private extractSelectors(): void {
    const selector = this._values.shift();

    if (typeof selector !== "string") {
      throw new ArgumentError("Expecting a selector as the first argument");
    }

    this.cssSelector = HTMLSelector.context.substituteBang(selector, [...this._values], true);
    this._selector = HTMLSelector.context.substituteBang(selector, this._values);
  }

  private extractEqualityTests(): EqualityTests {
    let comparisons: EqualityTests = {};
    const comparator = this._values.shift();
    if (comparator != null && Object.getPrototypeOf(comparator) === Object.prototype) {
      comparisons = comparator as EqualityTests;
    } else if (typeof comparator === "string" || comparator instanceof RegExp) {
      comparisons.text = comparator;
    } else if (typeof comparator === "number" && Number.isInteger(comparator)) {
      comparisons.count = comparator;
    } else if (comparator instanceof Range) {
      comparisons.minimum = comparator.begin as number;
      comparisons.maximum = comparator.end as number;
    } else if (comparator === false) {
      comparisons.count = 0;
    } else if (comparator == null || comparator === true) {
      comparisons.minimum = 1;
    } else {
      throw new ArgumentError("I don't understand what you're trying to match");
    }

    if (comparisons.count != null) {
      comparisons.minimum = comparisons.maximum = comparisons.count;
    } else {
      comparisons.minimum ??= 1;
    }
    return comparisons;
  }
}
