import type { XmlNode } from "@blazetrails/nokogiri";

const CONTENT_ROOT = "__content__";

function isModuleNotFound(e: unknown, pkg: string): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as NodeJS.ErrnoException).code;
  return code === "ERR_MODULE_NOT_FOUND" && e.message.includes(pkg);
}

type XmlHash = Record<string, unknown>;

async function loadNokogiri() {
  try {
    return await import("@blazetrails/nokogiri");
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

export async function parse(data: string | null | undefined): Promise<XmlHash> {
  if (!data) return {};
  const { parseXml } = await loadNokogiri();
  const doc = parseXml(data);
  try {
    if (doc.errors.length > 0) {
      throw new Error(doc.errors[0].message);
    }
    return { [doc.root.name]: nodeToHash(doc.root) };
  } finally {
    doc.dispose();
  }
}
