import { XML, parseXml, type XmlNode } from "@blazetrails/nokogiri";

const CONTENT_ROOT = "__content__";

type XmlHash = Record<string, unknown>;

function nodeToHash(node: XmlNode): XmlHash {
  const hash: XmlHash = {};
  const content: string[] = [];

  for (const attr of node.attributeNodes) {
    hash[attr.nodeName] = attr.value;
  }

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
      content.push(child.content);
    }
  }

  if (content.length > 0) {
    hash[CONTENT_ROOT] = content.join("");
  }

  return hash;
}

export function parseXmlToHash(data: string): XmlHash {
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

export { XML };
