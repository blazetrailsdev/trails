import { assert, assertNot } from "@blazetrails/activesupport";

type Node =
  | { type: "element"; name: string; attributeNodes: [string, string][]; children: Node[] }
  | { type: "text"; text: string }
  | { type: "comment"; text: string };

type Fragment = { children: Node[] };

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

function extractChildren(node: Fragment, strict: boolean): Node[] {
  if (strict) {
    return node.children;
  } else {
    return node.children.filter((n) => !(n.type === "text" && n.text.trim() === ""));
  }
}

function isEqualChildren(child: Node, otherChild: Node, strict: boolean): boolean {
  if (child.type !== otherChild.type) return false;

  if (child.type === "element" && otherChild.type === "element") {
    return (
      child.name === otherChild.name &&
      isEqualAttributeNodes(child.attributeNodes, otherChild.attributeNodes) &&
      compareDoms(child, otherChild, strict)
    );
  } else {
    return isEqualChild(child, otherChild, strict);
  }
}

function isEqualChild(child: Node, otherChild: Node, strict: boolean): boolean {
  if (strict) {
    return toS(child) === toS(otherChild);
  } else {
    return split(toS(child)).join(" ") === split(toS(otherChild)).join(" ");
  }
}

function isEqualAttributeNodes(nodes: [string, string][], otherNodes: [string, string][]): boolean {
  if (nodes.length !== otherNodes.length) return false;

  const byName = ([a]: [string, string], [b]: [string, string]) => (a < b ? -1 : a > b ? 1 : 0);
  nodes = [...nodes].sort(byName);
  otherNodes = [...otherNodes].sort(byName);

  for (const [i, attr] of nodes.entries()) {
    if (!isEqualAttribute(attr, otherNodes[i])) return false;
  }

  return true;
}

function isEqualAttribute(attr: [string, string], otherAttr: [string, string]): boolean {
  return attr[0] === otherAttr[0] && attr[1] === otherAttr[1];
}

function split(string: string): string[] {
  return string.trim() === "" ? [] : string.trim().split(/\s+/);
}

function toS(node: Node): string {
  if (node.type === "comment") return `<!--${node.text}-->`;
  if (node.type === "text") {
    return node.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
  return "";
}

const VOID_ELEMENTS = new Set(
  "area base basefont br col embed frame hr img input isindex link meta param source track wbr".split(
    " ",
  ),
);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const TOKEN =
  /<!--([\s\S]*?)(?:-->|$)|<\/([a-zA-Z][^\s>]*)[^>]*>?|<([a-zA-Z][^\s/>]*)((?:\s*[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?|\s*\/(?!>))*)\s*(\/?)>|[^<]+|</g;

const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;

function decodeEntities(string: string): string {
  return string.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, ref: string) => {
    if (ref[0] !== "#") return ENTITIES[ref] ?? match;
    return String.fromCodePoint(
      /^#x/i.test(ref) ? parseInt(ref.slice(2), 16) : Number(ref.slice(1)),
    );
  });
}

function fragment(text: unknown): Fragment {
  const root: Fragment = { children: [] };
  const stack: (Fragment & { name?: string })[] = [root];
  for (const [token, comment, endName, name, attributes, selfClosing] of String(
    text ?? "",
  ).matchAll(TOKEN)) {
    const children = stack[stack.length - 1].children;
    const last = children[children.length - 1];
    if (comment !== undefined) {
      children.push({ type: "comment", text: comment });
    } else if (endName !== undefined) {
      const index = stack.map((node) => node.name).lastIndexOf(endName.toLowerCase());
      if (index > 0) stack.length = index;
    } else if (name !== undefined) {
      const attributeNodes = [...attributes.matchAll(ATTRIBUTE)].map(
        ([, key, ...values]): [string, string] => [
          key.toLowerCase(),
          decodeEntities(values.find((value) => value !== undefined) ?? ""),
        ],
      );
      const node = {
        type: "element" as const,
        name: name.toLowerCase(),
        attributeNodes,
        children: [] as Node[],
      };
      children.push(node);
      if (selfClosing === "" && !VOID_ELEMENTS.has(node.name)) stack.push(node);
    } else if (last?.type === "text") {
      last.text += decodeEntities(token);
    } else {
      children.push({ type: "text", text: decodeEntities(token) });
    }
  }
  return root;
}
