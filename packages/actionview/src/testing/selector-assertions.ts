import { assert, assertEqual, assertOperator } from "@blazetrails/activesupport";
import { ArgumentError, NotImplementedError, rbInspect } from "@blazetrails/ruby-compat";
import {
  HTML5,
  XML,
  type Html5DocumentFragment,
  type Html5Node,
  type NodeSet,
} from "@blazetrails/nokogiri";
import { Testing } from "../testing.js";
import { HTMLSelector, type EqualityTests } from "./selector-assertions/html-selector.js";

export interface SelectorAssertionsHost {
  _selected?: NodeSet | Html5DocumentFragment | null;
  documentRootElement(): unknown;
}

export function cssSelect(this: SelectorAssertionsHost, ...args: unknown[]): NodeSet {
  if (args.length === 0) throw new ArgumentError("you at least need a selector argument");

  const root = args.length === 1 ? this.documentRootElement() : args.shift();

  return nodeset(root).css(args[0]);
}

export function assertDom(this: SelectorAssertionsHost, ...args: unknown[]): NodeSet | undefined {
  const block = typeof args.at(-1) === "function" ? (args.pop() as (s: NodeSet) => void) : null;
  this._selected ??= null;

  const selector = new HTMLSelector(args, this._selected, () =>
    nodeset(this.documentRootElement()),
  );

  if (selector.isSelectingNoBody()) {
    assert(true);
    return;
  }

  const matches = selector.select();
  assertSizeMatch(matches.size, selector.tests, selector.cssSelector, selector.message);

  if (block && !matches.isEmpty()) nestSelection.call(this, matches, block);
  return matches;
}

export const assertSelect = assertDom;

export function assertDomEncoded(
  this: SelectorAssertionsHost,
  element: unknown = null,
  { htmlVersion = null }: { htmlVersion?: string | null } = {},
  block?: (selected: NodeSet | Html5DocumentFragment) => void,
): void {
  if (element == null && this._selected == null) {
    throw new ArgumentError("Element is required when called from a nonnested assert_dom");
  }

  const content = nodeset(element ?? this._selected)
    .map((elem) =>
      elem.children
        .filter((child) => child.isCdata() || (child.isText() && !child.isBlank()))
        .map((child) => child.content)
        .join(""),
    )
    .join("");

  const selected = Testing.htmlDocumentFragment({ htmlVersion }).parse(content);
  nestSelection.call(this, selected, () => {
    if (content.length === 0) {
      block!(selected);
    } else {
      assertDom.call(this, ":root", ...(block ? [block] : []));
    }
  });
}

export const assertSelectEncoded = assertDomEncoded;

/** @internal */
export function documentRootElement(): never {
  // @nie disposition=TODO
  throw new NotImplementedError(
    "Implementing document_root_element makes " +
      "assert_dom work without needing to specify an element to select from.",
  );
}

function assertSizeMatch(
  size: number,
  equals: EqualityTests,
  cssSelector: string,
  message: unknown = null,
): void {
  const [min, max, count] = [equals.minimum, equals.maximum, equals.count];

  if (message == null || message === false)
    message = `Expected ${countDescription(min, max, count)} matching ${rbInspect(cssSelector)}, found ${size}`;
  if (count != null) {
    assertEqual(count, size, message as string);
  } else {
    if (min != null) assertOperator(size, ">=", min, message as string);
    if (max != null) assertOperator(size, "<=", max, message as string);
  }
}

function countDescription(min?: number, max?: number, count?: number): string | undefined {
  if (min != null && max != null && max !== min) {
    return `between ${min} and ${max} elements`;
  } else if (min != null && max != null && max === min && count != null) {
    return `exactly ${count} ${pluralizeElement(min)}`;
  } else if (min != null && !(min === 1 && max === 1)) {
    return `at least ${min} ${pluralizeElement(min)}`;
  } else if (max != null) {
    return `at most ${max} ${pluralizeElement(max)}`;
  }
}

function pluralizeElement(quantity: number): string {
  return quantity === 1 ? "element" : "elements";
}

function nestSelection(
  this: SelectorAssertionsHost,
  selection: NodeSet | Html5DocumentFragment,
  block: (selected: never) => void,
): void {
  const oldSelected = this._selected;
  this._selected = selection;
  try {
    block(this._selected as never);
  } finally {
    this._selected = oldSelected;
  }
}

function nodeset(node: unknown): NodeSet {
  if (node instanceof XML.NodeSet) {
    return node;
  } else {
    node ??= HTML5.Document.parse();
    return new XML.NodeSet((node as { document?: unknown }).document ?? node, [node as Html5Node]);
  }
}
