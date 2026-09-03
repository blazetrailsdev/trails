import * as XmlMini from "../xml-mini.js";
import { Document, Element, ParseException } from "../rexml/document.js";
import { isBlank } from "../string-utils.js";

export const CONTENT_KEY = "__content__";

export function parse(data: string | null | undefined): Record<string, unknown> {
  const io = data ?? "";

  if (io === "") {
    return {};
  } else {
    const doc = new Document(io);

    if (doc.root) {
      return mergeElementBang({}, doc.root, XmlMini.depth());
    } else {
      throw new ParseException(
        `The document ${JSON.stringify(String(doc))} does not have a valid root`,
      );
    }
  }
}

/** @internal */
function mergeElementBang(
  hash: Record<string, unknown>,
  element: Element,
  depth: number,
): Record<string, unknown> {
  if (depth === 0) throw new ParseException("The document is too deep");
  return mergeBang(hash, element.name, collapse(element, depth));
}

/** @internal */
function collapse(element: Element, depth: number): Record<string, unknown> {
  const hash = getAttributes(element);

  if (element.hasElements()) {
    element.eachElement((child) => mergeElementBang(hash, child, depth - 1));
    if (!isEmptyContent(element)) mergeTextsBang(hash, element);
    return hash;
  } else {
    return mergeTextsBang(hash, element);
  }
}

/** @internal */
function mergeTextsBang(hash: Record<string, unknown>, element: Element): Record<string, unknown> {
  if (!element.hasText()) {
    return hash;
  } else {
    let texts = "";
    for (const t of element.texts) texts += t.value;
    return mergeBang(hash, CONTENT_KEY, texts);
  }
}

/** @internal */
function mergeBang(
  hash: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(hash, key)) {
    if (Array.isArray(hash[key])) {
      (hash[key] as unknown[]).push(value);
    } else {
      hash[key] = [hash[key], value];
    }
  } else if (Array.isArray(value)) {
    hash[key] = [value];
  } else {
    hash[key] = value;
  }
  return hash;
}

/** @internal */
function getAttributes(element: Element): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  element.attributes.each((n, v) => (attributes[n] = v));
  return attributes;
}

/** @internal */
function isEmptyContent(element: Element): boolean {
  return isBlank(element.texts.map((t) => t.value).join(""));
}
