import * as XmlMini from "../xml-mini.js";
import { Document, Element, ParseException } from "../rexml/document.js";
import { isBlank } from "../string-utils.js";

/**
 * Mirrors: ActiveSupport::XmlMini_REXML (xml_mini/rexml.rb) — the default
 * backend.
 */

/** Mirrors: ActiveSupport::XmlMini_REXML::CONTENT_KEY (rexml.rb:11). */
export const CONTENT_KEY = "__content__";

/**
 * Parse an XML Document string or IO into a simple hash.
 *
 * Same as XmlSimple::xml_in but doesn't shoot itself in the foot,
 * and uses the defaults from Active Support.
 *
 * data::
 *   XML Document string or IO to parse
 *
 * Mirrors: ActiveSupport::XmlMini_REXML#parse (rexml.rb:20-36) — `data` is a
 * string here (see {@link XmlMini.XmlMiniBackend}), so Rails' wrap in a
 * `StringIO` and its `eof?` check are the empty-string check.
 */
export async function parse(data: string | null | undefined): Promise<Record<string, unknown>> {
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

/**
 * Convert an XML element and merge into the hash
 *
 * hash::
 *   Hash to merge the converted element into.
 * element::
 *   XML element to merge into hash
 *
 * Mirrors: ActiveSupport::XmlMini_REXML#merge_element! (rexml.rb:47-50).
 *
 * @internal
 */
function mergeElementBang(
  hash: Record<string, unknown>,
  element: Element,
  depth: number,
): Record<string, unknown> {
  if (depth === 0) throw new ParseException("The document is too deep");
  return mergeBang(hash, element.name, collapse(element, depth));
}

/**
 * Actually converts an XML document element into a data structure.
 *
 * element::
 *   The document element to be collapsed.
 *
 * Mirrors: ActiveSupport::XmlMini_REXML#collapse (rexml.rb:56-66).
 *
 * @internal
 */
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

/**
 * Merge all the texts of an element into the hash
 *
 * hash::
 *   Hash to add the converted element to.
 * element::
 *   XML element whose texts are to me merged into the hash
 *
 * Mirrors: ActiveSupport::XmlMini_REXML#merge_texts! (rexml.rb:73-82).
 *
 * @internal
 */
function mergeTextsBang(hash: Record<string, unknown>, element: Element): Record<string, unknown> {
  if (!element.hasText()) {
    return hash;
  } else {
    // must use value to prevent double-escaping
    let texts = "";
    for (const t of element.texts) texts += t.value;
    return mergeBang(hash, CONTENT_KEY, texts);
  }
}

/**
 * Adds a new key/value pair to an existing Hash. If the key to be added
 * already exists and the existing value associated with key is not
 * an Array, it will be wrapped in an Array. Then the new value is
 * appended to that Array.
 *
 * hash::
 *   Hash to add key/value pair to.
 * key::
 *   Key to be added.
 * value::
 *   Value to be associated with key.
 *
 * Mirrors: ActiveSupport::XmlMini_REXML#merge! (rexml.rb:94-106).
 *
 * @internal
 */
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

/**
 * Converts the attributes array of an XML element into a hash.
 * Returns an empty Hash if node has no attributes.
 *
 * element::
 *   XML element to extract attributes from.
 *
 * Mirrors: ActiveSupport::XmlMini_REXML#get_attributes (rexml.rb:113-117).
 *
 * @internal
 */
function getAttributes(element: Element): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  element.attributes.each((n, v) => (attributes[n] = v));
  return attributes;
}

/**
 * Determines if a document element has text content
 *
 * element::
 *   XML element to be checked.
 *
 * Mirrors: ActiveSupport::XmlMini_REXML#empty_content? (rexml.rb:123-125).
 *
 * @internal
 */
function isEmptyContent(element: Element): boolean {
  return isBlank(element.texts.map((t) => t.value).join(""));
}
