import { assert, assertNot, isBlank } from "@blazetrails/activesupport";
import { type Html5DocumentFragment, type Html5Node } from "@blazetrails/nokogiri";
import { Testing } from "../testing.js";

type Fragment = Html5DocumentFragment | Html5Node;
type Attr = Html5Node["attributeNodes"][number];

export function assertDomEqual(
  expected: unknown,
  actual: unknown,
  message: string | null = null,
  { strict = false, htmlVersion = null }: { strict?: boolean; htmlVersion?: string | null } = {},
): void {
  const [expectedDom, actualDom] = [
    fragment(expected, { htmlVersion }),
    fragment(actual, { htmlVersion }),
  ];
  message ??= `Expected: ${String(expected)}\nActual: ${String(actual)}`;
  assert(compareDoms(expectedDom, actualDom, strict), message);
}

export function assertDomNotEqual(
  expected: unknown,
  actual: unknown,
  message: string | null = null,
  { strict = false, htmlVersion = null }: { strict?: boolean; htmlVersion?: string | null } = {},
): void {
  const [expectedDom, actualDom] = [
    fragment(expected, { htmlVersion }),
    fragment(actual, { htmlVersion }),
  ];
  message ??= `Expected: ${String(expected)}\nActual: ${String(actual)}`;
  assertNot(compareDoms(expectedDom, actualDom, strict), message);
}

function compareDoms(expected: Fragment, actual: Fragment, strict: boolean): boolean {
  const expectedChildren = extractChildren(expected, strict);
  const actualChildren = extractChildren(actual, strict);
  if (expectedChildren.length !== actualChildren.length) return false;

  for (const [i, child] of expectedChildren.entries()) {
    if (!isEqualChildren(child, actualChildren[i], strict)) return false;
  }

  return true;
}

function extractChildren(node: Fragment, strict: boolean): Html5Node[] {
  if (strict) {
    return node.children;
  } else {
    return node.children.filter((n) => !(n.isText() && isBlank(n.text)));
  }
}

function isEqualChildren(child: Html5Node, otherChild: Html5Node, strict: boolean): boolean {
  if (child.type !== otherChild.type) return false;

  if (child.isElement()) {
    return (
      child.name === otherChild.name &&
      isEqualAttributeNodes(child.attributeNodes, otherChild.attributeNodes) &&
      compareDoms(child, otherChild, strict)
    );
  } else {
    return isEqualChild(child, otherChild, strict);
  }
}

function isEqualChild(child: Html5Node, otherChild: Html5Node, strict: boolean): boolean {
  if (strict) {
    return child.toString() === otherChild.toString();
  } else {
    return split(child.toString()).join(" ") === split(otherChild.toString()).join(" ");
  }
}

function isEqualAttributeNodes(nodes: Attr[], otherNodes: Attr[]): boolean {
  if (nodes.length !== otherNodes.length) return false;

  const byName = (a: Attr, b: Attr) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  nodes = [...nodes].sort(byName);
  otherNodes = [...otherNodes].sort(byName);

  for (const [i, attr] of nodes.entries()) {
    if (!isEqualAttribute(attr, otherNodes[i])) return false;
  }

  return true;
}

function isEqualAttribute(attr: Attr, otherAttr: Attr): boolean {
  return attr.name === otherAttr.name && attr.value === otherAttr.value;
}

function split(string: string): string[] {
  return string.trim() === "" ? [] : string.trim().split(/\s+/);
}

function fragment(
  text: unknown,
  { htmlVersion = null }: { htmlVersion?: string | null } = {},
): Html5DocumentFragment {
  return Testing.htmlDocumentFragment({ htmlVersion }).parse(String(text ?? ""));
}
