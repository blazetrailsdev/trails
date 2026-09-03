import { StringIO } from "@blazetrails/ruby-compat";

const CONTENT_ROOT = "__content__";

function isModuleNotFound(e: unknown, pkg: string): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as NodeJS.ErrnoException).code;
  return code === "ERR_MODULE_NOT_FOUND" && e.message.includes(pkg);
}

type XmlHash = Record<string, unknown>;

// @blazetrails/nokogiri is an optional peer dependency, so it may not be
// resolvable when this file is type-checked in isolation (e.g. before its
// `dist` is built). These local interfaces describe the slice of the Nokogiri
// XML DOM surface used below so the dynamic import stays well-typed without
// depending on the package's own declarations being present.
interface XmlAttr {
  nodeName: string;
  value: string;
}

interface XmlNode {
  readonly name: string;
  readonly content: string;
  readonly children: XmlNode[];
  readonly attributeNodes: XmlAttr[];
  isElement(): boolean;
  isText(): boolean;
  isCdata(): boolean;
}

interface XmlDocument {
  readonly errors: ReadonlyArray<Error>;
  readonly root: XmlNode;
  dispose(): void;
}

interface NokogiriModule {
  parseXml(data: string | StringIO): XmlDocument;
}

// Loaded via a non-literal specifier so the optional dependency does not have
// to resolve at type-check time; the cast pins it to the surface above.
const NOKOGIRI_PACKAGE = "@blazetrails/nokogiri";

let nokogiri: NokogiriModule | undefined;

/**
 * Mirrors: the file-top `require "nokogiri"` (nokogiri.rb:3-8), which Ruby runs
 * when `cast_backend_name_to_module` requires this file — i.e. at
 * backend-selection time, so `parse` itself never loads anything.
 *
 * ESM has no synchronous `require`, and a top-level `await import()` breaks the
 * IIFE/CJS bundles, so the file-top `require` is an awaitable hook the loader
 * calls after importing this module (`xml-mini.ts`'s `XML_MINI_BACKENDS`).
 *
 * @internal
 */
export async function _require(): Promise<void> {
  if (nokogiri !== undefined) return;
  try {
    nokogiri = (await import(NOKOGIRI_PACKAGE)) as unknown as NokogiriModule;
  } catch (e) {
    if (isModuleNotFound(e, "@blazetrails/nokogiri")) {
      throw new Error(
        "@blazetrails/nokogiri is not installed. Add it as a dependency to use the Nokogiri XML backend.",
        { cause: e },
      );
    }
    throw e;
  }
}

function nodeToHash(node: XmlNode): XmlHash {
  const hash: XmlHash = {};

  for (const child of node.children) {
    if (child.isElement()) {
      const childHash = nodeToHash(child);
      const key = child.name;
      if (Object.prototype.hasOwnProperty.call(hash, key)) {
        const existing = hash[key];
        if (Array.isArray(existing)) {
          existing.push(childHash);
        } else {
          hash[key] = [existing, childHash];
        }
      } else {
        hash[key] = childHash;
      }
    } else if (child.isText() || child.isCdata()) {
      const existing = hash[CONTENT_ROOT];
      hash[CONTENT_ROOT] = typeof existing === "string" ? existing + child.content : child.content;
    }
  }

  // Strip whitespace-only content when child elements are present (mirrors Rails node.to_hash).
  if (
    Object.prototype.hasOwnProperty.call(hash, CONTENT_ROOT) &&
    Object.keys(hash).length > 1 &&
    (hash[CONTENT_ROOT] as string).trim() === ""
  ) {
    delete hash[CONTENT_ROOT];
  }

  // Attributes come after children/content (Rails node.to_hash order).
  for (const attr of node.attributeNodes) {
    hash[attr.nodeName] = attr.value;
  }

  return hash;
}

/**
 * Mirrors: ActiveSupport::XmlMini_Nokogiri#parse (nokogiri.rb:19-31) —
 * `StringIO` is the shim for Ruby's stdlib `StringIO`, and `instanceof
 * StringIO` stands in for `respond_to?(:read)`.
 *
 * @missingRailsCall first — PERMANENT: Ruby core Enumerable#first on the parsed document
 *   (xml_mini/nokogiri.rb:19-30), not a ported trails method.
 */
export function parse(data: string | StringIO | null | undefined): XmlHash {
  if (!(data instanceof StringIO)) {
    data = new StringIO(data ?? "");
  }

  if (data.isEof()) {
    return {};
  } else {
    const doc = nokogiri!.parseXml(data);
    try {
      if (doc.errors.length > 0) {
        throw doc.errors[0];
      }
      return { [doc.root.name]: nodeToHash(doc.root) };
    } finally {
      doc.dispose();
    }
  }
}
