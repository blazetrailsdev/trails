import { assert, assertNot, isBlank } from "@blazetrails/activesupport";
import { HTML4, type Html4DocumentFragment, type Html4Node } from "@blazetrails/nokogiri";

type Fragment = Html4DocumentFragment | Html4Node;
type Attr = Html4Node["attributeNodes"][number];

export function assertDomEqual(
  expected: unknown,
  actual: unknown,
  message: string | null = null,
  { strict = false }: { strict?: boolean } = {},
): void {
  const [expectedDom, actualDom] = [fragment(expected), fragment(actual)];
  message ??= `Expected: ${String(expected)}\nActual: ${String(actual)}`;
  assert(compareDoms(expectedDom, actualDom, strict), message);
}

export function assertDomNotEqual(
  expected: unknown,
  actual: unknown,
  message: string | null = null,
  { strict = false }: { strict?: boolean } = {},
): void {
  const [expectedDom, actualDom] = [fragment(expected), fragment(actual)];
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

function extractChildren(node: Fragment, strict: boolean): Html4Node[] {
  if (strict) {
    return node.children;
  } else {
    return node.children.filter((n) => !(n.isText() && isBlank(n.text)));
  }
}

function isEqualChildren(child: Html4Node, otherChild: Html4Node, strict: boolean): boolean {
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

function isEqualChild(child: Html4Node, otherChild: Html4Node, strict: boolean): boolean {
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

function fragment(text: unknown): Html4DocumentFragment {
  return HTML4.DocumentFragment.parse(text);
}
